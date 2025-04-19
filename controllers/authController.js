// controllers/authController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// Cargar variables de entorno
dotenv.config();

// Constantes de configuración
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_fallback'; // Preferiblemente de ENV
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h'; // 24 horas por defecto
const SALT_ROUNDS = 10; // Rondas de hashing para bcrypt
const MAX_LOGIN_ATTEMPTS = 5; // Máximo de intentos fallidos
const LOGIN_COOLDOWN_TIME = 15 * 60 * 1000; // 15 minutos en ms
const TOKEN_REFRESH_WINDOW = 60 * 60; // 1 hora en segundos (ventana para renovar token)

// Almacenamiento temporal de intentos de login (en producción debería ser Redis)
const loginAttempts = new Map(); // userId/username -> {count, lastAttempt}
const passwordResetTokens = new Map(); // token -> {userId, expiry}

/**
 * Login de usuario
 * POST /api/auth/login
 */
const loginUser = async (req, res) => {
    const { username, password, role: selectedRole } = req.body;
    
    console.log(`Intento de login para usuario: ${username}, rol: ${selectedRole}`);
    
    if (!username || !password || !selectedRole) {
        return res.status(400).json({ 
            message: 'Todos los campos son obligatorios: username, password y role.' 
        });
    }
    
    // Verificar número de intentos para el usuario
    const currentAttempts = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    
    // Comprobar si está en periodo de espera por múltiples intentos fallidos
    if (currentAttempts.count >= MAX_LOGIN_ATTEMPTS && 
        (now - currentAttempts.lastAttempt) < LOGIN_COOLDOWN_TIME) {
        
        const remainingSeconds = Math.ceil((LOGIN_COOLDOWN_TIME - (now - currentAttempts.lastAttempt)) / 1000);
        
        return res.status(429).json({
            message: `Demasiados intentos fallidos. Por favor, inténtalo de nuevo después de ${Math.ceil(remainingSeconds / 60)} minutos.`,
            remainingSeconds
        });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // Consulta optimizada con JOIN para obtener usuario y rol en una sola consulta
        const [users] = await connection.execute(
            `SELECT u.user_id, u.username, u.password_hash, u.full_name, u.photo_url, 
                    u.default_warehouse_id, r.role_name, u.is_active
             FROM Users u 
             JOIN Roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`,
            [username]
        );
        
        // Si no hay resultados o el usuario está inactivo
        if (users.length === 0 || !users[0].is_active) {
            incrementLoginAttempt(username);
            return res.status(401).json({ message: 'Credenciales incorrectas.' });
        }
        
        const user = users[0];
        
        // Verificar el rol seleccionado
        if (user.role_name !== selectedRole) {
            incrementLoginAttempt(username);
            console.log(`Error de rol: Esperado ${selectedRole}, Real ${user.role_name}`);
            return res.status(401).json({ message: 'Credenciales incorrectas.' });
        }
        
        // Verificar la contraseña
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            incrementLoginAttempt(username);
            console.log(`Contraseña incorrecta para ${username}`);
            return res.status(401).json({ message: 'Credenciales incorrectas.' });
        }
        
        // Credenciales correctas - Resetear contador de intentos
        loginAttempts.delete(username);
        
        // Generar JWT con datos mínimos necesarios y tiempo de expiración
        const payload = { 
            id: user.user_id, 
            role: user.role_name,
            iat: Math.floor(Date.now() / 1000) // Issued At timestamp
        };
        
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
        
        // Registrar login exitoso en log de seguridad (opcional)
        await logSuccessfulLogin(connection, user.user_id, req.ip);
        
        console.log(`Login exitoso para ${username} (ID: ${user.user_id}, Rol: ${user.role_name})`);
        
        // Devolver información necesaria al cliente (nunca la contraseña)
        res.status(200).json({
            token,
            user: {
                id: user.user_id,
                username: user.username,
                name: user.full_name,
                role: user.role_name,
                photo: user.photo_url,
                default_warehouse_id: user.default_warehouse_id
            }
        });
        
    } catch (error) {
        console.error('Error durante login:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor durante autenticación.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Registro de nuevos clientes
 * POST /api/auth/register
 */
const registerClient = async (req, res) => {
    // Extraer datos del cuerpo de la petición
    const { 
        nombre, dni_ruc, celular1, celular2, email, cumple, direccion, 
        latitud, longitud, password, passwordConfirm, tipo_cliente, referral 
    } = req.body;
    
    console.log(`Solicitud de registro para cliente: ${nombre}, DNI/RUC: ${dni_ruc}`);
    
    // Validaciones básicas iniciales
    const validationErrors = validateRegistrationData(req.body);
    
    if (validationErrors.length > 0) {
        return res.status(400).json({ 
            message: 'Error de validación', 
            errors: validationErrors 
        });
    }
    
    // Campos obligatorios
    if (!nombre || !dni_ruc || !celular1 || !direccion || !password || !passwordConfirm || !tipo_cliente) {
        return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }
    
    // Validar que las contraseñas coinciden
    if (password !== passwordConfirm) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden.' });
    }
    
    // Validar longitud mínima de contraseña
    if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    
    // Validar formato DNI/RUC
    if (!/^\d{8}(\d{3})?$/.test(dni_ruc)) {
        return res.status(400).json({ message: 'Formato de DNI (8 dígitos) o RUC (11 dígitos) inválido.' });
    }
    
    // Validar formato de celular
    if (!/^\d{9}$/.test(celular1)) {
        return res.status(400).json({ message: 'El celular principal debe tener 9 dígitos.' });
    }
    
    if (celular2 && !/^\d{9}$/.test(celular2)) {
        return res.status(400).json({ message: 'El celular secundario debe tener 9 dígitos.' });
    }
    
    // Validar email si se proporciona
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar duplicados antes de insertar
        const [existingUsers] = await connection.execute(
            'SELECT user_id, username, email FROM Users WHERE username = ? OR (email = ? AND email IS NOT NULL)',
            [celular1, email || null]
        );
        
        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            if (existingUser.username === celular1) {
                return res.status(400).json({ message: 'Ya existe un usuario con este número de celular.' });
            }
            if (email && existingUser.email === email) {
                return res.status(400).json({ message: 'Ya existe un usuario con este email.' });
            }
        }
        
        // Verificar duplicado de DNI/RUC
        if (dni_ruc) {
            const [existingDni] = await connection.execute(
                'SELECT customer_id FROM Customers WHERE dni_ruc = ?',
                [dni_ruc]
            );
            
            if (existingDni.length > 0) {
                return res.status(400).json({ message: 'Ya existe un cliente con este DNI/RUC.' });
            }
        }
        
        // Verificar código de referido si se proporciona
        let referralValid = true;
        let referralUserId = null;
        
        if (referral) {
            const [referralCheck] = await connection.execute(
                'SELECT user_id FROM Customers WHERE referral_code = ?',
                [referral]
            );
            
            if (referralCheck.length === 0) {
                referralValid = false;
            } else {
                referralUserId = referralCheck[0].user_id;
            }
        }
        
        // Obtener ID del rol cliente
        const [roles] = await connection.execute(
            'SELECT role_id FROM Roles WHERE role_name = ?', 
            ['cliente']
        );
        
        if (roles.length === 0) {
            throw new Error("Rol 'cliente' no encontrado en la base de datos.");
        }
        
        const clienteRoleId = roles[0].role_id;
        
        // Generar hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // El nombre de usuario será el número de celular principal
        const username = celular1;
        
        // Insertar en la tabla Users
        const [userResult] = await connection.execute(
            `INSERT INTO Users (
                username, password_hash, full_name, phone_number_primary, 
                phone_number_secondary, email, role_id, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                username, 
                hashedPassword, 
                nombre, 
                celular1, 
                celular2 || null, 
                email || null, 
                clienteRoleId
            ]
        );
        
        const newUserId = userResult.insertId;
        
        if (!newUserId) {
            throw new Error("No se pudo crear el usuario. Operación no retornó ID.");
        }
        
        // Generar código de referido único
        const referralCode = generateReferralCode(nombre);
        
        // Insertar en la tabla Customers
        await connection.execute(
            `INSERT INTO Customers (
                user_id, dni_ruc, customer_type, address_text, 
                address_latitude, address_longitude, birth_date, 
                referral_code, referred_by_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newUserId, 
                dni_ruc, 
                tipo_cliente, 
                direccion, 
                latitud ? parseFloat(latitud) : null, 
                longitud ? parseFloat(longitud) : null, 
                cumple || null, 
                referralCode, 
                referralValid ? referral : null
            ]
        );
        
        // Procesar puntos de referido si corresponde
        if (referralValid && referralUserId) {
            await processReferralPoints(connection, referralUserId, newUserId);
        }
        
        // Confirmar la transacción
        await connection.commit();
        
        console.log(`Cliente registrado exitosamente: ${nombre} (ID: ${newUserId}), Código Referido: ${referralCode}`);
        
        res.status(201).json({ 
            message: 'Cliente registrado exitosamente.',
            user_id: newUserId,
            referral_code: referralCode
        });
        
    } catch (error) {
        // Revertir la transacción en caso de error
        if (connection) await connection.rollback();
        
        console.error('Error en registerClient:', error);
        
        // Manejo detallado de errores específicos de la base de datos
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('username')) {
                return res.status(400).json({ message: 'El número de celular ya está registrado.' });
            } else if (error.message.includes('email')) {
                return res.status(400).json({ message: 'El email ya está registrado.' });
            } else if (error.message.includes('dni_ruc')) {
                return res.status(400).json({ message: 'El DNI/RUC ya está registrado.' });
            } else if (error.message.includes('referral_code')) {
                return res.status(400).json({ message: 'Error al generar código de referido. Por favor, intenta nuevamente.' });
            }
        }
        
        // Error general
        res.status(500).json({ 
            message: 'Error interno al procesar el registro.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) connection.release();
    }
};

/**
 * Cambiar contraseña propia del usuario
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
    const userId = req.user.id; // Del token JWT
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    
    console.log(`Solicitud cambio de contraseña para User ID: ${userId}`);
    
    // Validaciones básicas
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }
    
    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: 'Las nuevas contraseñas no coinciden.' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }
    
    if (newPassword === currentPassword) {
        return res.status(400).json({ message: 'La nueva contraseña debe ser diferente a la actual.' });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // Obtener hash actual de la contraseña
        const [userRows] = await connection.execute(
            'SELECT password_hash FROM Users WHERE user_id = ?',
            [userId]
        );
        
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        const currentHash = userRows[0].password_hash;
        
        // Verificar la contraseña actual
        const isMatch = await bcrypt.compare(currentPassword, currentHash);
        
        if (!isMatch) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
        }
        
        // Generar hash de la nueva contraseña
        const newHashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        
        // Actualizar contraseña
        await connection.execute(
            'UPDATE Users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [newHashedPassword, userId]
        );
        
        // Opcional: Registrar cambio en log de seguridad
        await logPasswordChange(connection, userId, req.ip);
        
        console.log(`Contraseña cambiada exitosamente para User ID: ${userId}`);
        
        res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
        
    } catch (error) {
        console.error('Error en changePassword:', error);
        res.status(500).json({ 
            message: 'Error interno al cambiar contraseña.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Solicitar restablecimiento de contraseña
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
    const { username } = req.body;
    
    console.log(`Solicitud de recuperación de contraseña para: ${username}`);
    
    if (!username) {
        return res.status(400).json({ message: 'Se requiere el nombre de usuario o email.' });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // Buscar usuario por username o email
        const [users] = await connection.execute(
            `SELECT user_id, username, email, full_name 
             FROM Users 
             WHERE username = ? OR email = ?`,
            [username, username]
        );
        
        // No revelar si el usuario existe o no (seguridad)
        if (users.length === 0) {
            console.log(`Usuario no encontrado para recuperación: ${username}`);
            // Simular tiempo de procesamiento para evitar timing attacks
            await new Promise(resolve => setTimeout(resolve, 1000));
            return res.status(200).json({ 
                message: 'Si el usuario existe, se enviará un enlace de recuperación al email registrado.' 
            });
        }
        
        const user = users[0];
        
        // Verificar si tiene email (obligatorio para recuperación)
        if (!user.email) {
            console.log(`Usuario ${username} no tiene email para recuperación.`);
            return res.status(200).json({ 
                message: 'Si el usuario existe, se enviará un enlace de recuperación al email registrado.' 
            });
        }
        
        // Generar token único de recuperación (24 horas de validez)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
        
        // Almacenar token en memoria (en producción usar Redis o base de datos)
        passwordResetTokens.set(resetToken, { 
            userId: user.user_id, 
            expiry: tokenExpiry 
        });
        
        // En producción: Enviar email con enlace de recuperación
        // sendPasswordResetEmail(user.email, resetToken, user.full_name);
        
        // Registrar solicitud en log de seguridad
        await logPasswordResetRequest(connection, user.user_id, req.ip);
        
        console.log(`Token de recuperación generado para ${username} (ID: ${user.user_id})`);
        
        // En desarrollo: devolver token para pruebas
        const resetInfo = process.env.NODE_ENV === 'development' 
            ? { resetToken, email: user.email } 
            : undefined;
        
        res.status(200).json({ 
            message: 'Se ha enviado un enlace de recuperación al email registrado.',
            development: resetInfo
        });
        
    } catch (error) {
        console.error('Error en forgotPassword:', error);
        res.status(500).json({ 
            message: 'Error al procesar la solicitud de recuperación de contraseña.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Restablecer contraseña con token
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;
    
    console.log(`Intento de restablecimiento de contraseña con token`);
    
    if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }
    
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden.' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    
    // Verificar token
    const tokenData = passwordResetTokens.get(token);
    
    if (!tokenData || tokenData.expiry < Date.now()) {
        console.log(`Token inválido o expirado para recuperación de contraseña`);
        return res.status(400).json({ message: 'El enlace de recuperación es inválido o ha expirado.' });
    }
    
    const userId = tokenData.userId;
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // Verificar que el usuario existe
        const [userCheck] = await connection.execute(
            'SELECT user_id FROM Users WHERE user_id = ?',
            [userId]
        );
        
        if (userCheck.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        // Generar hash de la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        
        // Actualizar contraseña
        await connection.execute(
            'UPDATE Users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [hashedPassword, userId]
        );
        
        // Eliminar token usado
        passwordResetTokens.delete(token);
        
        // Registrar cambio en log de seguridad
        await logPasswordReset(connection, userId, req.ip);
        
        console.log(`Contraseña restablecida exitosamente para User ID: ${userId}`);
        
        res.status(200).json({ message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' });
        
    } catch (error) {
        console.error('Error en resetPassword:', error);
        res.status(500).json({ 
            message: 'Error interno al restablecer contraseña.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Verificar validez de token (útil para frontend)
 * GET /api/auth/verify-token
 */
const verifyToken = async (req, res) => {
    // El middleware protect ya verificó el token, así que si
    // llegamos aquí el token es válido
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`Token verificado para User ID: ${userId}, Rol: ${userRole}`);
    
    res.status(200).json({ 
        valid: true, 
        user: { id: userId, role: userRole } 
    });
};

/**
 * Refrescar token JWT antes de que expire
 * POST /api/auth/refresh-token
 */
const refreshToken = (req, res) => {
    // El token actual ya fue validado por el middleware protect
    const currentUser = req.user;
    const tokenIssuedAt = currentUser.iat; // Timestamp when token was issued
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Verificar si el token es demasiado reciente para renovar
    // (evita renovaciones innecesarias)
    if (tokenIssuedAt && (currentTime - tokenIssuedAt < 60)) { // Menos de 1 minuto
        return res.status(400).json({ 
            message: 'El token fue renovado recientemente. Inténtalo de nuevo más tarde.' 
        });
    }
    
    // Generar un nuevo token
    const payload = { 
        id: currentUser.id, 
        role: currentUser.role,
        iat: currentTime // Nuevo timestamp
    };
    
    const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
    
    console.log(`Token renovado para User ID: ${currentUser.id}`);
    
    res.status(200).json({ token: newToken });
};

// --- Funciones auxiliares ---

/**
 * Incrementa el contador de intentos fallidos de login
 * @param {string} identifier - Username o identificador para tracking
 */
function incrementLoginAttempt(identifier) {
    const currentData = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    
    // Resetear contador si el último intento fue hace más de 24 horas
    if (now - currentData.lastAttempt > 24 * 60 * 60 * 1000) {
        loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    } else {
        loginAttempts.set(identifier, { 
            count: currentData.count + 1, 
            lastAttempt: now 
        });
    }
    
    console.log(`Intento fallido de login para ${identifier}. Contador: ${currentData.count + 1}`);
}

/**
 * Genera código de referido único
 * @param {string} name - Nombre del cliente
 * @returns {string} - Código de referido de 6 caracteres
 */
function generateReferralCode(name) {
    // Obtener iniciales o primeros caracteres del nombre
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    // Número aleatorio de 3 dígitos
    const suffix = Math.floor(100 + Math.random() * 900);
    return `${prefix}${suffix}`;
}

/**
 * Procesa los puntos por referido
 * @param {Object} connection - Conexión de base de datos
 * @param {number} referrerId - ID del usuario que refirió
 * @param {number} newUserId - ID del nuevo usuario registrado
 */
async function processReferralPoints(connection, referrerId, newUserId) {
    try {
        // Obtener configuración de puntos por referido
        const [configRows] = await connection.execute(
            "SELECT config_value FROM Configuration WHERE config_key = 'points_for_referral'"
        );
        
        if (configRows.length === 0) return; // No hay configuración
        
        const pointsForReferral = parseInt(configRows[0].config_value) || 0;
        if (pointsForReferral <= 0) return; // No hay puntos configurados
        
        // Actualizar puntos del referidor
        await connection.execute(
            'UPDATE Customers SET loyalty_points = loyalty_points + ? WHERE user_id = ?',
            [pointsForReferral, referrerId]
        );
        
        // Registrar la transacción de puntos
        await connection.execute(
            `INSERT INTO LoyaltyTransactions 
            (customer_user_id, points_change, reason, related_user_id, notes)
            VALUES (?, ?, ?, ?, ?)`,
            [
                referrerId, 
                pointsForReferral, 
                'referral_bonus_earn', 
                newUserId,
                'Puntos por referir a un nuevo cliente'
            ]
        );
        
        console.log(`Puntos por referido otorgados: ${pointsForReferral} para User ID ${referrerId}`);
    } catch (error) {
        console.error('Error procesando puntos de referido:', error);
        // No lanzar error para evitar afectar el registro principal
    }
}

/**
 * Registra un login exitoso en la base de datos (opcional)
 * @param {Object} connection - Conexión de base de datos
 * @param {number} userId - ID del usuario
 * @param {string} ipAddress - Dirección IP
 */
async function logSuccessfulLogin(connection, userId, ipAddress) {
    try {
        await connection.execute(
            `INSERT INTO SecurityLogs 
            (user_id, action_type, ip_address, details, action_time)
            VALUES (?, 'login_success', ?, NULL, CURRENT_TIMESTAMP)`,
            [userId, ipAddress || 'unknown']
        );
    } catch (error) {
        console.error('Error registrando login exitoso:', error);
        // No propagar el error para evitar afectar flujo principal
    }
}

/**
 * Registra un cambio de contraseña en la base de datos
 * @param {Object} connection - Conexión de base de datos
 * @param {number} userId - ID del usuario
 * @param {string} ipAddress - Dirección IP
 */
async function logPasswordChange(connection, userId, ipAddress) {
    try {
        await connection.execute(
            `INSERT INTO SecurityLogs 
            (user_id, action_type, ip_address, details, action_time)
            VALUES (?, 'password_change', ?, NULL, CURRENT_TIMESTAMP)`,
            [userId, ipAddress || 'unknown']
        );
    } catch (error) {
        console.error('Error registrando cambio de contraseña:', error);
    }
}

/**
 * Registra una solicitud de restablecimiento de contraseña
 * @param {Object} connection - Conexión de base de datos
 * @param {number} userId - ID del usuario
 * @param {string} ipAddress - Dirección IP
 */
async function logPasswordResetRequest(connection, userId, ipAddress) {
    try {
        await connection.execute(
            `INSERT INTO SecurityLogs 
            (user_id, action_type, ip_address, details, action_time)
            VALUES (?, 'password_reset_request', ?, NULL, CURRENT_TIMESTAMP)`,
            [userId, ipAddress || 'unknown']
        );
    } catch (error) {
        console.error('Error registrando solicitud de reset:', error);
    }
}

/**
 * Registra un restablecimiento exitoso de contraseña
 * @param {Object} connection - Conexión de base de datos
 * @param {number} userId - ID del usuario
 * @param {string} ipAddress - Dirección IP
 */
async function logPasswordReset(connection, userId, ipAddress) {
    try {
        await connection.execute(
            `INSERT INTO SecurityLogs 
            (user_id, action_type, ip_address, details, action_time)
            VALUES (?, 'password_reset_complete', ?, NULL, CURRENT_TIMESTAMP)`,
            [userId, ipAddress || 'unknown']
        );
    } catch (error) {
        console.error('Error registrando reset de contraseña:', error);
    }
}

/**
 * Valida los datos de registro
 * @param {Object} data - Datos de registro
 * @returns {Array} - Lista de errores de validación
 */
function validateRegistrationData(data) {
    const errors = [];
    
    // Esta función se puede expandir con validaciones adicionales
    // Aquí solo validamos lo básico, las validaciones detalladas están en el método principal
    
    if (!data.nombre || data.nombre.trim().length < 3) {
        errors.push('El nombre debe tener al menos 3 caracteres');
    }
    
    if (!data.dni_ruc) {
        errors.push('DNI/RUC es obligatorio');
    }
    
    if (!data.direccion || data.direccion.trim().length < 5) {
        errors.push('La dirección debe tener al menos 5 caracteres');
    }
    
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Formato de email inválido');
    }
    
    if (!data.tipo_cliente || !['domicilio', 'restaurante', 'negocio', 'institucion', 'otro'].includes(data.tipo_cliente)) {
        errors.push('Tipo de cliente inválido');
    }
    
    return errors;
}

// Exportar controladores
module.exports = {
    loginUser,
    registerClient,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyToken,
    refreshToken
};