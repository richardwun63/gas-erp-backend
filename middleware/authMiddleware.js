// middleware/authMiddleware.js (VERSIÓN CORREGIDA)
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Constantes de configuración
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h'; // 24 horas por defecto
const JWT_REFRESH_WINDOW = parseInt(process.env.JWT_REFRESH_WINDOW || '3600', 10); // 1 hora en segundos

// Validar que exista un secreto JWT para firmar tokens
if (!JWT_SECRET) {
    console.error("Error Crítico: Falta JWT_SECRET en las variables de entorno.");
    process.exit(1); // Detener la app si no hay secreto JWT para evitar problemas de seguridad
}

/**
 * Middleware que verifica el token JWT y protege rutas
 * Si el token es válido, añade información del usuario a req.user
 * Si está cerca de expirar, lo renueva y devuelve un nuevo token en el header
 */
const protect = (req, res, next) => {
    let token;

    // Log detallado en modo desarrollo
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Protect Middleware] Verificando acceso a ruta: ${req.method} ${req.originalUrl}`);
    }

    // Extraer token del header Authorization: Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        try {
            // Obtener token del header
            token = req.headers.authorization.split(' ')[1];

            if (!token) {
                return res.status(401).json({ 
                    status: 'error',
                    message: 'No autorizado, token no proporcionado o formato incorrecto'
                });
            }

            // Verificar el token usando el secreto
            const decoded = jwt.verify(token, JWT_SECRET);

            // Verificar si el token está cerca de expirar
            const currentTime = Math.floor(Date.now() / 1000);
            const tokenExp = decoded.exp;
            const timeRemaining = tokenExp - currentTime;
            
            // Si está a menos de REFRESH_WINDOW segundos de expirar, generar nuevo token
            if (timeRemaining > 0 && timeRemaining < JWT_REFRESH_WINDOW) {
                // Crear nuevo payload manteniendo id y role pero actualizando exp
                const newPayload = {
                    id: decoded.id,
                    role: decoded.role
                };
                
                // Generar nuevo token
                const newToken = jwt.sign(newPayload, JWT_SECRET, {
                    expiresIn: JWT_EXPIRATION
                });
                
                // Enviar el nuevo token en el encabezado de la respuesta
                res.setHeader('X-New-Token', newToken);
                
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[Protect Middleware] Token renovado para user ID: ${decoded.id}, role: ${decoded.role}`);
                }
            }

            // Añadir la información del usuario al objeto request
            req.user = {
                id: decoded.id,
                role: decoded.role,
                iat: decoded.iat,
                exp: decoded.exp
            };
            
            // Continuar con la siguiente función de middleware o ruta
            next();
            
        } catch (error) {
            // Manejo de errores específicos de token JWT
            if (error.name === 'TokenExpiredError') {
                console.warn(`[Protect Middleware] Token expirado en ${req.originalUrl}`);
                return res.status(401).json({ 
                    status: 'error',
                    code: 'token_expired',
                    message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' 
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                console.warn(`[Protect Middleware] Token inválido en ${req.originalUrl}: ${error.message}`);
                return res.status(401).json({ 
                    status: 'error',
                    code: 'invalid_token',
                    message: 'Token de autenticación inválido o manipulado.' 
                });
            }
            
            // Otros errores de autenticación no especificados
            console.error('[Protect Middleware] Error de autenticación:', error);
            return res.status(401).json({ 
                status: 'error',
                code: 'auth_error',
                message: `Error de autenticación: ${error.message}` 
            });
        }
    } else {
        // No se encontró el formato correcto del token en el header
        console.warn(`[Protect Middleware] Header Authorization incorrecto o faltante en ${req.originalUrl}`);
        res.status(401).json({ 
            status: 'error',
            code: 'missing_token',
            message: 'No autorizado. No se proporcionó token de autenticación o el formato es incorrecto.' 
        });
    }
};

/**
 * Middleware para restricción de acceso por rol
 * @param {...string} roles - Roles permitidos para acceder a la ruta
 * @returns {Function} Middleware que verifica si el rol del usuario está permitido
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        // protect debe haberse ejecutado antes, verificamos si req.user existe
        if (!req.user || !req.user.role) {
            console.error('[RestrictTo Middleware] Error: req.user o req.user.role no definidos. Asegúrate de usar "protect" antes.');
            return res.status(403).json({ 
                status: 'error', 
                code: 'access_denied',
                message: 'Acceso denegado. Autenticación incompleta o rol de usuario desconocido.' 
            });
        }

        // Verificar si el rol del usuario está en la lista de roles permitidos
        if (!roles.includes(req.user.role)) {
            console.warn(`[RestrictTo Middleware] Acceso denegado para usuario ID ${req.user.id}, rol "${req.user.role}" a ruta ${req.method} ${req.originalUrl} que requiere uno de: ${roles.join(', ')}`);
            return res.status(403).json({ 
                status: 'error',
                code: 'insufficient_permissions',
                message: 'Acceso denegado. No tienes permiso para realizar esta acción.' 
            });
        }

        // Si el rol está permitido, pasar al siguiente middleware
        next();
    };
};

/**
 * Middleware para verificar propiedad del recurso
 * Útil para verificar que un usuario solo pueda acceder a sus propios recursos
 * @param {string} paramIdField - Nombre del parámetro de ruta que contiene el ID del recurso
 * @param {Function} getOwnerId - Función async para obtener el ID del propietario del recurso
 */
const verifyOwnership = (paramIdField, getOwnerId) => {
    return async (req, res, next) => {
        try {
            // Se asume que protect ya se ejecutó antes
            if (!req.user || !req.user.id) {
                return res.status(401).json({
                    status: 'error',
                    code: 'auth_required',
                    message: 'Se requiere autenticación para verificar propiedad del recurso.'
                });
            }

            // Si es gerente o admin, permitir acceso sin verificar propiedad
            if (['gerente', 'admin'].includes(req.user.role)) {
                return next();
            }

            const resourceId = req.params[paramIdField];
            if (!resourceId) {
                return res.status(400).json({
                    status: 'error',
                    code: 'invalid_request',
                    message: `ID de recurso no proporcionado (parámetro: ${paramIdField}).`
                });
            }

            // Obtener el ID del propietario usando la función proporcionada
            const ownerId = await getOwnerId(resourceId, req.app.get('dbPool'));
            
            // Verificar si el usuario actual es el propietario
            if (parseInt(ownerId) !== parseInt(req.user.id)) {
                console.warn(`[VerifyOwnership] Usuario ID ${req.user.id} intentó acceder al recurso ${paramIdField}=${resourceId} que pertenece a usuario ID ${ownerId}`);
                return res.status(403).json({
                    status: 'error',
                    code: 'ownership_required',
                    message: 'No tienes permiso para acceder a este recurso.'
                });
            }

            // El usuario es el propietario, permitir acceso
            next();
        } catch (error) {
            console.error('[VerifyOwnership] Error:', error);
            res.status(500).json({
                status: 'error',
                code: 'ownership_check_failed',
                message: 'Error al verificar propiedad del recurso.'
            });
        }
    };
};

module.exports = { protect, restrictTo, verifyOwnership };