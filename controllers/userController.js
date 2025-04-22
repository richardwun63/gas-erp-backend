// controllers/userController.js
const pool = require('../db/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10; // Número de rondas para el hash de bcrypt

/**
 * Obtiene el perfil del usuario logueado
 * GET /api/users/me
 */
const getMyProfile = async (req, res) => {
    const userId = req.user.id; // Obtenido del token JWT por el middleware 'protect'
    console.log(`GET /api/users/me por User ID: ${userId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Obtener datos básicos del usuario
        const [userRows] = await connection.execute(
            `SELECT 
                u.user_id, 
                u.username, 
                u.full_name, 
                u.phone_number_primary, 
                u.phone_number_secondary, 
                u.email, 
                u.photo_url, 
                u.default_warehouse_id, 
                r.role_name
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.user_id = ?`,
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        const userProfile = userRows[0];

        // Si es cliente, obtener detalles adicionales de la tabla customers
        if (userProfile.role_name === 'cliente') {
            const [customerRows] = await connection.execute(
                `SELECT 
                    dni_ruc, 
                    customer_type, 
                    address_text, 
                    address_latitude, 
                    address_longitude, 
                    birth_date, 
                    loyalty_points, 
                    referral_code, 
                    referred_by_code, 
                    last_purchase_date 
                FROM customers 
                WHERE user_id = ?`,
                [userId]
            );
            
            userProfile.details = customerRows[0] || {}; // Añadir detalles del cliente o un objeto vacío
            
            // Obtener precios especiales si existen
            const [specialPrices] = await connection.execute(
                `SELECT 
                    csp.cylinder_type_id, 
                    ct.name as cylinder_name, 
                    csp.price_exchange
                FROM customerspecificprices csp
                JOIN cylindertypes ct ON csp.cylinder_type_id = ct.cylinder_type_id
                WHERE csp.customer_user_id = ?`,
                [userId]
            );
            
            userProfile.special_prices = specialPrices || [];
        } else {
            // Para otros roles, 'details' se define como null
            userProfile.details = null;
        }

        res.status(200).json(userProfile);
    } catch (error) {
        console.error('Error en getMyProfile:', error);
        res.status(500).json({ 
            message: 'Error interno al obtener el perfil.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Actualiza el perfil del usuario logueado
 * PUT /api/users/me
 */
const updateMyProfile = async (req, res) => {
    const userId = req.user.id;
    const {
        full_name,
        phone_number_primary,
        phone_number_secondary,
        email,
        // Campos de details (solo si es cliente)
        details
    } = req.body;
    
    console.log(`PUT /api/users/me por User ID: ${userId}`);
    console.log("Datos recibidos para actualizar:", req.body);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Validaciones básicas
        // Validar email si está presente
        if (email !== undefined && email !== null && email !== '' && !isValidEmail(email)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Formato de email inválido.' });
        }
        
        // Validar teléfono primario si está presente
        if (phone_number_primary !== undefined && phone_number_primary !== null && 
            phone_number_primary !== '' && !isValidPhone(phone_number_primary)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Formato de teléfono primario inválido.' });
        }
        
        // Validar teléfono secundario si está presente
        if (phone_number_secondary !== undefined && phone_number_secondary !== null && 
            phone_number_secondary !== '' && !isValidPhone(phone_number_secondary)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Formato de teléfono secundario inválido.' });
        }

        // 2. Actualizar tabla users (campos comunes)
        let userSetClause = [];
        const userParams = [];
        
        if (full_name !== undefined) { 
            userSetClause.push('full_name = ?'); 
            userParams.push(full_name); 
        }
        
        if (phone_number_primary !== undefined) { 
            userSetClause.push('phone_number_primary = ?'); 
            userParams.push(phone_number_primary || null); 
        }
        
        if (phone_number_secondary !== undefined) { 
            userSetClause.push('phone_number_secondary = ?'); 
            userParams.push(phone_number_secondary || null); 
        }
        
        if (email !== undefined) { 
            userSetClause.push('email = ?'); 
            userParams.push(email || null); 
        }

        if (userSetClause.length > 0) {
            userParams.push(userId);
            const userSql = `UPDATE users SET ${userSetClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
            console.log("SQL users Update:", userSql, userParams);
            await connection.execute(userSql, userParams);
        }

        // 3. Actualizar tabla customers (si es cliente y vienen datos en 'details')
        const userRole = req.user.role; // Rol del middleware
        if (userRole === 'cliente' && details && typeof details === 'object' && Object.keys(details).length > 0) {
            // Validar datos específicos del cliente
            if (details.dni_ruc !== undefined && !isValidDniRuc(details.dni_ruc)) {
                await connection.rollback();
                return res.status(400).json({ message: 'Formato de DNI/RUC inválido. Debe ser 8 dígitos (DNI) o 11 dígitos (RUC).' });
            }
            
            if (details.birth_date !== undefined && details.birth_date !== null && 
                details.birth_date !== '' && !isValidDate(details.birth_date)) {
                await connection.rollback();
                return res.status(400).json({ message: 'Formato de fecha de nacimiento inválido. Use YYYY-MM-DD.' });
            }
            
            let customerSetClause = [];
            const customerParams = [];

            // Campos permitidos para actualizar en customers
            if (details.dni_ruc !== undefined) { 
                customerSetClause.push('dni_ruc = ?'); 
                customerParams.push(details.dni_ruc); 
            }
            
            if (details.address_text !== undefined) { 
                customerSetClause.push('address_text = ?'); 
                customerParams.push(details.address_text); 
            }
            
            if (details.address_latitude !== undefined) { 
                customerSetClause.push('address_latitude = ?'); 
                const latitude = details.address_latitude === '' ? null : parseFloat(details.address_latitude) || null;
                customerParams.push(latitude); 
            }
            
            if (details.address_longitude !== undefined) { 
                customerSetClause.push('address_longitude = ?'); 
                const longitude = details.address_longitude === '' ? null : parseFloat(details.address_longitude) || null;
                customerParams.push(longitude); 
            }
            
            if (details.birth_date !== undefined) { 
                customerSetClause.push('birth_date = ?'); 
                customerParams.push(details.birth_date || null); 
            }
            // customer_type, loyalty_points, referral_code no se editan aquí

            if (customerSetClause.length > 0) {
                // Verificar primero si existe el registro en customers
                const [customerCheck] = await connection.execute(
                    'SELECT customer_id FROM customers WHERE user_id = ?',
                    [userId]
                );
                
                if (customerCheck.length > 0) {
                    // Actualizar registro existente
                    customerParams.push(userId);
                    const customerSql = `UPDATE customers SET ${customerSetClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
                    console.log("SQL customers Update:", customerSql, customerParams);
                    await connection.execute(customerSql, customerParams);
                } else {
                    // Este caso no debería ocurrir normalmente - un cliente sin entrada en la tabla customers
                    await connection.rollback();
                    return res.status(500).json({ message: 'Error de integridad: Usuario marcado como cliente pero no tiene registro en la tabla customers.' });
                }
            }
        }

        await connection.commit();
        console.log(`Perfil User ID: ${userId} actualizado.`);
        res.status(200).json({ message: 'Perfil actualizado correctamente.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en updateMyProfile:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            let field = 'desconocido';
            if (error.message.includes('email')) field = 'email';
            else if (error.message.includes('dni_ruc')) field = 'DNI/RUC';
            return res.status(400).json({ message: `Error: El ${field} ya está registrado por otro usuario.` });
        }
        
        res.status(500).json({ 
            message: 'Error interno al actualizar el perfil.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Listar empleados (filtrado, paginado)
 * GET /api/users
 */
const listEmployees = async (req, res) => {
    const requestingUserId = req.user.id;
    console.log(`GET /api/users (listEmployees) por User ID: ${requestingUserId}`);

    let connection;
    try {
        connection = await pool.getConnection();
        
        // Consulta simplificada para pruebas
        const sql = `
            SELECT 
                u.user_id, 
                u.username, 
                u.full_name, 
                u.phone_number_primary, 
                r.role_name, 
                u.is_active
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE r.role_name != 'cliente'
            LIMIT 50`;
            
        console.log("SQL simplificado:", sql);
        const [employees] = await connection.execute(sql);
        
        res.status(200).json({
            employees: employees,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: employees.length,
                itemsPerPage: 50
            }
        });

    } catch (error) {
        console.error('Error en listEmployees:', error);
        res.status(500).json({ 
            message: 'Error interno al listar empleados.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Crear nuevo empleado
 * POST /api/users
 */
const createEmployee = async (req, res) => {
    const { 
        full_name, 
        username, 
        password, 
        role_name, 
        phone_number_primary, 
        phone_number_secondary, 
        email, 
        default_warehouse_id 
    } = req.body;
    
    const requestingUserId = req.user.id;
    console.log(`POST /api/users (createEmployee) por User ID: ${requestingUserId}`);
    console.log("Datos recibidos:", req.body);

    // Validaciones básicas
    if (!full_name || !username || !password || !role_name) {
        return res.status(400).json({ message: 'Nombre, username, contraseña y rol son requeridos.' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ message: 'Contraseña debe tener al menos 6 caracteres.' });
    }
    
    if (role_name === 'cliente') {
        return res.status(400).json({ message: 'Para crear clientes use la ruta de registro de clientes.' });
    }
    
    // CORRECCIÓN: Validación de roles permitidos
    const validRoles = ['base', 'repartidor', 'contabilidad', 'gerente'];
    if (!validRoles.includes(role_name)) {
        return res.status(400).json({ message: `Rol '${role_name}' inválido. Roles permitidos: ${validRoles.join(', ')}` });
    }
    
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }
    
    if (phone_number_primary && !isValidPhone(phone_number_primary)) {
        return res.status(400).json({ message: 'Formato de teléfono primario inválido.' });
    }
    
    if (phone_number_secondary && !isValidPhone(phone_number_secondary)) {
        return res.status(400).json({ message: 'Formato de teléfono secundario inválido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Verificar que el rol existe
        const [roles] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ?', [role_name]);
        if (roles.length === 0) { 
            await connection.rollback(); 
            return res.status(400).json({ message: `Rol '${role_name}' inválido.` }); 
        }
        const roleId = roles[0].role_id;

        // Verificar que el almacén existe (si se especificó)
        if (default_warehouse_id) {
            const [warehouses] = await connection.execute(
                'SELECT warehouse_id FROM warehouses WHERE warehouse_id = ?', 
                [default_warehouse_id]
            );
            if (warehouses.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: `Almacén ID ${default_warehouse_id} no encontrado.` });
            }
        }

        // Generar hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Insertar el usuario
        const sqlInsert = `
            INSERT INTO users (
                username, 
                password_hash, 
                full_name, 
                phone_number_primary, 
                phone_number_secondary, 
                email, 
                role_id, 
                default_warehouse_id, 
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`;
        
        const insertParams = [
            username, 
            hashedPassword, 
            full_name, 
            phone_number_primary || null, 
            phone_number_secondary || null, 
            email || null, 
            roleId, 
            default_warehouse_id || null
        ];

        const [result] = await connection.execute(sqlInsert, insertParams);
        const newUserId = result.insertId;
        
        if (!newUserId) {
            throw new Error("Fallo al crear usuario: no se obtuvo ID de inserción.");
        }

        await connection.commit();
        console.log(`Empleado creado ID: ${newUserId} por Gerente ID: ${requestingUserId}`);
        
        res.status(201).json({ 
            message: 'Empleado creado exitosamente.', 
            userId: newUserId,
            username: username,
            role: role_name
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en createEmployee:', error);
        
        if (error.code === 'ER_DUP_ENTRY') { 
            let field = 'desconocido'; 
            if (error.message.includes('username')) field = 'username'; 
            else if (error.message.includes('email')) field = 'email'; 
            return res.status(400).json({ message: `Error: El ${field} '${req.body[field]}' ya existe.` }); 
        }
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2' && error.message.includes('default_warehouse_id')) { 
            return res.status(400).json({ message: 'Error: Almacén predeterminado inválido.' }); 
        }
        
        res.status(500).json({ 
            message: 'Error interno al crear empleado.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtener detalles de un empleado por ID
 * GET /api/users/:id
 */
const getUserById = async (req, res) => {
    const userIdToGet = req.params.id;
    const requestingUserId = req.user.id;
    console.log(`GET /api/users/${userIdToGet} por User ID: ${requestingUserId}`);
    
    // Validar que el ID es numérico
    if (!userIdToGet || isNaN(parseInt(userIdToGet))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        
        // Obtener datos completos del usuario
        const [userRows] = await connection.execute(
            `SELECT 
                u.user_id, 
                u.username, 
                u.full_name, 
                u.phone_number_primary, 
                u.phone_number_secondary, 
                u.email, 
                u.photo_url, 
                u.default_warehouse_id, 
                r.role_name, 
                u.is_active, 
                u.schedule_start, 
                u.schedule_end, 
                w.name as default_warehouse_name,
                DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') as created_at_formatted,
                DATE_FORMAT(u.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at_formatted
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            LEFT JOIN warehouses w ON u.default_warehouse_id = w.warehouse_id
            WHERE u.user_id = ?`,
            [userIdToGet]
        );
        
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        // No devolver hash de contraseña
        const user = userRows[0];
        
        // Si es cliente y no es la ruta adecuada, redirigir
        if (user.role_name === 'cliente') {
            return res.status(403).json({ message: 'Use la ruta de clientes para ver detalles de clientes.' });
        }
        
        res.status(200).json(user);
    } catch (error) {
        console.error('Error en getUserById:', error);
        res.status(500).json({ 
            message: 'Error interno al obtener usuario.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Actualizar datos de un empleado
 * PUT /api/users/:id
 */
const updateEmployee = async (req, res) => {
    const userIdToUpdate = req.params.id;
    const requestingUserId = req.user.id;
    const { 
        full_name, 
        phone_number_primary, 
        phone_number_secondary, 
        email, 
        default_warehouse_id, 
        username 
    } = req.body;
    
    console.log(`PUT /api/users/${userIdToUpdate} por User ID: ${requestingUserId}`);
    console.log("Datos recibidos:", req.body);
    
    // Validar que el ID es numérico
    if (!userIdToUpdate || isNaN(parseInt(userIdToUpdate))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }
    
    // No permitir actualizar el propio perfil
    if (Number(userIdToUpdate) === Number(requestingUserId)) { 
        return res.status(400).json({ message: 'Use /api/users/me para actualizar su propio perfil.' }); 
    }
    
    // Validaciones de formato
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }
    
    if (phone_number_primary && !isValidPhone(phone_number_primary)) {
        return res.status(400).json({ message: 'Formato de teléfono primario inválido.' });
    }
    
    if (phone_number_secondary && !isValidPhone(phone_number_secondary)) {
        return res.status(400).json({ message: 'Formato de teléfono secundario inválido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Verificar que el usuario existe y no es cliente
        const [userRole] = await connection.execute(
            `SELECT r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id=r.role_id 
             WHERE u.user_id=?`, 
            [userIdToUpdate]
        );
        
        if (userRole.length === 0) { 
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userIdToUpdate} no encontrado.` }); 
        }
        
        if (userRole[0].role_name === 'cliente') { 
            await connection.rollback();
            return res.status(400).json({ message: 'No se pueden editar clientes desde esta función.' }); 
        }

        // Verificar que el almacén existe (si se especificó)
        if (default_warehouse_id) {
            const [warehouses] = await connection.execute(
                'SELECT warehouse_id FROM warehouses WHERE warehouse_id = ?', 
                [default_warehouse_id]
            );
            if (warehouses.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: `Almacén ID ${default_warehouse_id} no encontrado.` });
            }
        }

        // Construir cláusula SET para la actualización
        let setClause = []; 
        const params = [];
        
        if (full_name !== undefined) {
            setClause.push('full_name = ?');
            params.push(full_name);
        }
        
        if (username !== undefined) {
            setClause.push('username = ?');
            params.push(username);
        }
        
        if (phone_number_primary !== undefined) {
            setClause.push('phone_number_primary = ?');
            params.push(phone_number_primary || null);
        }
        
        if (phone_number_secondary !== undefined) {
            setClause.push('phone_number_secondary = ?');
            params.push(phone_number_secondary || null);
        }
        
        if (email !== undefined) {
            setClause.push('email = ?');
            params.push(email || null);
        }
        
        if (default_warehouse_id !== undefined) {
            setClause.push('default_warehouse_id = ?');
            params.push(default_warehouse_id || null);
        }

        if (setClause.length === 0) { 
            await connection.rollback(); 
            return res.status(400).json({ message: 'No hay campos válidos para actualizar.' }); 
        }

        params.push(userIdToUpdate);
        const sqlUpdate = `UPDATE users SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
        console.log("SQL Update Employee:", sqlUpdate, params);
        
        const [result] = await connection.execute(sqlUpdate, params);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userIdToUpdate} no encontrado al intentar actualizar.` });
        }

        await connection.commit();
        console.log(`Empleado ${userIdToUpdate} actualizado por ${requestingUserId}`);
        
        res.status(200).json({ 
            message: 'Datos del empleado actualizados correctamente.',
            updated_fields: setClause.map(clause => clause.split(' = ')[0])
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updateEmployee:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            let field = 'desconocido';
            if (error.message.includes('username')) field = 'username';
            else if (error.message.includes('email')) field = 'email';
            return res.status(400).json({ message: `Error: El ${field} ya existe.` });
        }
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'Error: Referencia inválida a almacén u otro elemento.' });
        }
        
        res.status(500).json({ 
            message: 'Error interno al actualizar empleado.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Actualizar horario de un repartidor
 * PUT /api/users/:id/schedule
 */
const updateSchedule = async (req, res) => {
    const userId = req.params.id;
    const { schedule_start, schedule_end } = req.body;
    console.log(`PUT /api/users/${userId}/schedule por User ID: ${req.user.id}`);
    console.log("Datos de horario:", req.body);
    
    // Validar que el ID es numérico
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    // Validación de formato de hora HH:MM
    const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if ((schedule_start && !timeRegex.test(schedule_start)) || 
        (schedule_end && !timeRegex.test(schedule_end))) {
        return res.status(400).json({ message: 'Formato de hora inválido. Usar HH:MM (ej: 08:00).' });
    }
    
    // Validar que la hora de inicio sea anterior a la hora de fin
    if (schedule_start && schedule_end) {
        const startMinutes = convertTimeToMinutes(schedule_start);
        const endMinutes = convertTimeToMinutes(schedule_end);
        
        if (startMinutes >= endMinutes) {
            return res.status(400).json({ message: 'La hora de inicio debe ser anterior a la hora de fin.' });
        }
    }

    let connection;
    try {
        connection = await pool.getConnection();
        
        // Verificar que el usuario existe y es repartidor
        const [userCheck] = await connection.execute(
            `SELECT u.user_id, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [userId]
        );
        
        if (userCheck.length === 0) {
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado.` });
        }
        
        if (userCheck[0].role_name !== 'repartidor') {
            return res.status(400).json({ message: 'Solo se puede actualizar el horario de usuarios con rol repartidor.' });
        }
        
        // Actualizar horario
        const [result] = await connection.execute(
            'UPDATE users SET schedule_start = ?, schedule_end = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [schedule_start || null, schedule_end || null, userId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: `Repartidor con ID ${userId} no encontrado.` });
        }
        
        res.status(200).json({ 
            message: 'Horario actualizado correctamente.',
            schedule: {
                start: schedule_start || null,
                end: schedule_end || null
            }
        });
    } catch (error) {
        console.error('Error en updateSchedule:', error);
        res.status(500).json({ 
            message: 'Error interno al actualizar horario.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Eliminar horario de un repartidor
 * DELETE /api/users/:id/schedule
 */
const clearSchedule = async (req, res) => {
    const userId = req.params.id;
    console.log(`DELETE /api/users/${userId}/schedule por User ID: ${req.user.id}`);
    
    // Validar que el ID es numérico
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        
        // Verificar que el usuario existe y es repartidor
        const [userCheck] = await connection.execute(
            `SELECT u.user_id, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [userId]
        );
        
        if (userCheck.length === 0) {
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado.` });
        }
        
        if (userCheck[0].role_name !== 'repartidor') {
            return res.status(400).json({ message: 'Solo se puede limpiar el horario de usuarios con rol repartidor.' });
        }
        
        // Limpiar horario
        const [result] = await connection.execute(
            'UPDATE users SET schedule_start = NULL, schedule_end = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [userId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: `Repartidor con ID ${userId} no encontrado.` });
        }
        
        res.status(200).json({ message: 'Horario limpiado correctamente.' });
    } catch (error) {
        console.error('Error en clearSchedule:', error);
        res.status(500).json({ 
            message: 'Error interno al limpiar horario.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Cambiar estado de un empleado (activar/desactivar)
 * PUT /api/users/:id/status
 */
const updateUserStatus = async (req, res) => {
    const userId = req.params.id;
    const { is_active } = req.body;
    const requestingUserId = req.user.id;
    console.log(`PUT /api/users/${userId}/status por User ID: ${requestingUserId}`);
    console.log("Datos status:", req.body);
    
    // Validar que el ID es numérico
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    // No permitir desactivar propia cuenta
    if (Number(userId) === Number(requestingUserId)) {
        return res.status(400).json({ message: 'No puedes cambiar el estado de tu propia cuenta.' });
    }
    
    // Validar que is_active es booleano
    if (is_active === undefined || typeof is_active !== 'boolean') {
        return res.status(400).json({ message: 'El campo "is_active" (true/false) es requerido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el usuario existe y no es cliente
        const [userCheck] = await connection.execute(
            `SELECT u.user_id, r.role_name, r.role_id 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [userId]
        );
        
        if (userCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado.` });
        }
        
        if (userCheck[0].role_name === 'cliente') {
            await connection.rollback();
            return res.status(400).json({ message: 'No se puede cambiar el estado de los clientes desde esta función.' });
        }
        
        // Verificar si es el último gerente/admin activo
        if (!is_active && userCheck[0].role_name === 'gerente') {
            const [activeGerenteCount] = await connection.execute(
                `SELECT COUNT(*) as count 
                 FROM users 
                 WHERE role_id = ? AND is_active = TRUE AND user_id != ?`,
                [userCheck[0].role_id, userId]
            );
            
            if (activeGerenteCount[0].count === 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'No se puede desactivar el último gerente activo del sistema.' });
            }
        }
        
        // Actualizar estado
        const [result] = await connection.execute(
            'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [is_active, userId]
        );
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado al aplicar cambio.` });
        }
        
        await connection.commit();
        
        // Registrar log del cambio (opcional)
        const actionDescription = is_active ? 'activado' : 'desactivado';
        console.log(`Usuario ID ${userId} ${actionDescription} por usuario ID ${requestingUserId}`);
        
        res.status(200).json({ 
            message: `Usuario ${actionDescription} correctamente.`,
            id: parseInt(userId),
            is_active: is_active
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en updateUserStatus:', error);
        res.status(500).json({ 
            message: 'Error interno al cambiar estado de usuario.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Eliminar empleado
 * DELETE /api/users/:id
 */
const deleteEmployee = async (req, res) => {
    const userIdToDelete = req.params.id;
    const requestingUserId = req.user.id;
    console.log(`DELETE /api/users/${userIdToDelete} por User ID: ${requestingUserId}`);
    
    // Validar que el ID es numérico
    if (!userIdToDelete || isNaN(parseInt(userIdToDelete))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    // No permitir eliminar propia cuenta
    if (Number(userIdToDelete) === Number(requestingUserId)) {
        return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Verificar que el usuario existe y no es cliente
        const [userCheck] = await connection.execute(
            `SELECT u.user_id, r.role_name, r.role_id 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [userIdToDelete]
        );
        
        if (userCheck.length === 0) { 
            await connection.rollback(); 
            return res.status(404).json({ message: `Usuario ID ${userIdToDelete} no encontrado.` }); 
        }
        
        if (userCheck[0].role_name === 'cliente') { 
            await connection.rollback(); 
            return res.status(400).json({ message: 'No se pueden eliminar clientes desde esta función.' }); 
        }
        
        // Verificar si es el último gerente/admin activo
        if (userCheck[0].role_name === 'gerente') {
            const [activeGerenteCount] = await connection.execute(
                `SELECT COUNT(*) as count 
                 FROM users 
                 WHERE role_id = ? AND is_active = TRUE AND user_id != ?`,
                [userCheck[0].role_id, userIdToDelete]
            );
            
            if (activeGerenteCount[0].count === 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'No se puede eliminar el último gerente activo del sistema.' });
            }
        }
        
        // Verificar dependencias (si hay registros que dependen de este usuario)
        const [deliveriesCheck] = await connection.execute(
            'SELECT COUNT(*) as count FROM deliveries WHERE delivery_person_user_id = ?',
            [userIdToDelete]
        );
        
        if (deliveriesCheck[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede eliminar: El usuario tiene ${deliveriesCheck[0].count} entregas asociadas. Desactívelo en su lugar.`,
                suggestion: "Use la función de desactivar usuario en lugar de eliminar."
            });
        }
        
        // Realizar la eliminación
        const [result] = await connection.execute(
            'DELETE FROM users WHERE user_id = ?', 
            [userIdToDelete]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `No se pudo eliminar el empleado ID ${userIdToDelete}.` });
        }

        await connection.commit();
        console.log(`Empleado ${userIdToDelete} eliminado por ${requestingUserId}`);
        
        res.status(200).json({ 
            message: 'Empleado eliminado permanentemente.',
            id: parseInt(userIdToDelete),
            role: userCheck[0].role_name
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en deleteEmployee:', error);
        
        // Mensajes específicos para errores de restricción de FK
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ 
                message: 'No se puede eliminar: El empleado tiene registros asociados (pedidos, entregas, etc.). Desactívelo en su lugar.',
                suggestion: "Use la función de desactivar usuario en lugar de eliminar."
            });
        }
        
        res.status(500).json({ 
            message: 'Error interno al eliminar empleado.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Cambiar contraseña de un empleado (admin/gerente)
 * PUT /api/users/:id/password
 */
const resetEmployeePassword = async (req, res) => {
    const userId = req.params.id;
    const { new_password } = req.body;
    const requestingUserId = req.user.id;
    console.log(`PUT /api/users/${userId}/password por User ID: ${requestingUserId}`);
    
    // Validar que el ID es numérico
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }
    
    // Validar nueva contraseña
    if (!new_password || typeof new_password !== 'string') {
        return res.status(400).json({ message: 'Nueva contraseña requerida.' });
    }
    
    if (new_password.length < 6) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el usuario existe y no es cliente
        const [userCheck] = await connection.execute(
            `SELECT u.user_id, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [userId]
        );
        
        if (userCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado.` });
        }
        
        if (userCheck[0].role_name === 'cliente') {
            await connection.rollback();
            return res.status(400).json({ message: 'No se puede cambiar la contraseña de clientes desde esta función.' });
        }
        
        // Generar el hash de la nueva contraseña
        const hashedPassword = await bcrypt.hash(new_password, SALT_ROUNDS);
        
        // Actualizar contraseña
        const [result] = await connection.execute(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [hashedPassword, userId]
        );
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Usuario ID ${userId} no encontrado al resetear password.` });
        }
        
        await connection.commit();
        console.log(`Password reseteada para User ID ${userId} por administrador ID ${requestingUserId}`);
        
        res.status(200).json({ 
            message: 'Contraseña actualizada correctamente.',
            id: parseInt(userId)
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en resetEmployeePassword:', error);
        res.status(500).json({ 
            message: 'Error interno al restablecer contraseña.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- Funciones de Utilidad ---

/**
 * Valida un formato de email
 * @param {string} email - Email a validar
 * @returns {boolean} - true si es válido
 */
function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

/**
 * Valida un formato de teléfono
 * @param {string} phone - Teléfono a validar
 * @returns {boolean} - true si es válido
 */
function isValidPhone(phone) {
    // Acepta formatos: 9XXXXXXXX o +51XXXXXXXXX o +XX XXXXXXXXX
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{9,11}$/;
    return phoneRegex.test(phone);
}

/**
 * Valida un formato de DNI o RUC
 * @param {string} dniRuc - DNI o RUC a validar
 * @returns {boolean} - true si es válido
 */
function isValidDniRuc(dniRuc) {
    // DNI: 8 dígitos, RUC: 11 dígitos
    const dniRucRegex = /^(\d{8}|\d{11})$/;
    return dniRucRegex.test(dniRuc);
}

/**
 * Valida una fecha en formato YYYY-MM-DD
 * @param {string} dateStr - Fecha a validar
 * @returns {boolean} - true si es válida
 */
function isValidDate(dateStr) {
    // Valida formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    
    // Intenta crear un Date y verificar que es válida
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    
    // Verifica que la fecha parseada tenga los mismos componentes
    const parts = dateStr.split('-').map(part => parseInt(part, 10));
    return date.getFullYear() === parts[0] && 
           date.getMonth() + 1 === parts[1] && 
           date.getDate() === parts[2];
}

/**
 * Convierte hora en formato HH:MM a minutos totales del día
 * @param {string} timeStr - Hora en formato HH:MM
 * @returns {number} - Minutos desde medianoche
 */
function convertTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

module.exports = {
    getMyProfile,
    updateMyProfile,
    listEmployees,
    createEmployee,
    getUserById,
    updateEmployee,
    updateSchedule,
    clearSchedule,
    updateUserStatus,
    deleteEmployee,
    resetEmployeePassword
};