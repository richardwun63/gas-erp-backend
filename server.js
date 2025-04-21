// server.js (VERSIÓN CORREGIDA Y OPTIMIZADA)
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const pool = require('./db/db');

// Cargar variables de entorno desde .env
dotenv.config();

// --- INICIALIZACIÓN DE LA APLICACIÓN EXPRESS ---
const app = express();

// --- MIDDLEWARES DE SEGURIDAD Y CONFIGURACIÓN ---
// Ruta específica para favicon.ico para evitar 404
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
// Seguridad básica de encabezados con helmet
app.use(helmet({
    contentSecurityPolicy: false, // Deshabilitado para desarrollo, habilitar en producción
    crossOriginEmbedderPolicy: false, // Para permitir cargar recursos de terceros
}));

// Configuración de CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000' 
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Limitador de tasa para prevenir ataques de fuerza bruta
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Límite de solicitudes por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        message: 'Demasiadas solicitudes desde esta IP, intente nuevamente después de 15 minutos'
    }
});

// Aplicar limitador de tasa a rutas de autenticación
app.use('/api/auth', apiLimiter);

// Logger de solicitudes HTTP
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Parsers para JSON y datos de formulario
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- CONEXIÓN A BASE DE DATOS ---
let dbPool;

const setupDatabase = async () => {
    try {
        console.log('🔄 Iniciando conexión al pool de MySQL...');
        // Obtener el pool de conexiones de db.js (que ya maneja reconexiones)
        dbPool = await pool.getConnectionPool();
        
        // Hacer el pool accesible globalmente a través de la app Express
        app.set('dbPool', dbPool);
        
        console.log('✅ Pool de base de datos MySQL configurado correctamente en Express.');
        
        // Probar la conexión (opcional, pool.getConnectionPool ya la verifica)
        const connection = await dbPool.getConnection();
        console.log('✅ Conexión de prueba exitosa.');
        connection.release();
        
    } catch (error) {
        console.error('❌ Error crítico al configurar la base de datos:');
        console.error(error);
        
        // En producción, podría ser mejor detener la aplicación
        if (process.env.NODE_ENV === 'production') {
            console.error('La aplicación se detendrá debido a errores en la base de datos.');
            process.exit(1);
        } else {
            console.warn('⚠️ Continuando ejecución en modo desarrollo sin base de datos.');
        }
    }
};

// Invocar la configuración de la base de datos
setupDatabase();

// --- IMPORTACIÓN DE RUTAS ---
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
const customerRoutes = require('./routes/customerRoutes');
const configRoutes = require('./routes/configRoutes');
const reportRoutes = require('./routes/reportRoutes');
const miscRoutes = require('./routes/miscRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');

// --- MONTAJE DE RUTAS ---
// Prefijo '/api' para todas las rutas de la API
const apiRouter = express.Router();

// Montar las rutas en el router de la API
apiRouter.use('/auth', authRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/deliveries', deliveryRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/config', configRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/misc', miscRoutes);
apiRouter.use('/warehouses', warehouseRoutes);

// Montar el router de la API en la ruta /api
app.use('/api', apiRouter);

// Ruta Raíz para verificación del estado
app.get('/', (req, res) => {
    const dbStatus = req.app.get('dbPool') ? 'Conectado' : 'Desconectado';
    res.json({
        status: 'OK',
        message: 'API Gas ERP Ayacucho funcionando correctamente',
        environment: process.env.NODE_ENV || 'development',
        database: dbStatus,
        version: '1.0.0',
        serverTime: new Date().toISOString()
    });
});

// --- MANEJO DE RUTAS SPA (Para el frontend de React/Vue/Angular) ---
// Esto redirecciona todas las solicitudes no API al index.html para que la SPA maneje las rutas
app.get('*', (req, res, next) => {
    // Solo manejar solicitudes que no sean para archivos estáticos o la API
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.includes('.')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

// --- MANEJO DE ERRORES ---
// 404 - Ruta no encontrada
app.use((req, res, next) => {
    res.status(404).json({ 
        status: 'error',
        code: 'not_found',
        message: `Ruta no encontrada: ${req.originalUrl}` 
    });
});

// 500 - Error general del servidor
app.use((err, req, res, next) => {
    // Logging del error para debug del servidor
    console.error("Error no manejado detectado:", err);
    
    // Preparar el mensaje de error
    const statusCode = err.status || 500;
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // En producción no exponer detalles internos del error
    const errorMessage = isDevelopment 
        ? err.message || 'Error desconocido'
        : 'Ocurrió un error interno en el servidor.';
    
    // Mensaje de error estandarizado
    const errorResponse = {
        status: 'error',
        code: err.code || 'internal_server_error',
        message: errorMessage
    };
    
    // En desarrollo añadimos información adicional para debug
    if (isDevelopment) {
        errorResponse.stack = err.stack;
        errorResponse.details = err.details || {};
    }
    
    res.status(statusCode).json(errorResponse);
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend corriendo en http://localhost:${PORT}`);
    console.log(`🕒 Hora actual: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
    console.log(`📅 Fecha actual: ${new Date().toLocaleDateString('es-PE')}`);
    console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
});

// Manejo de cierre de servidor
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    console.log('🔄 Recibida señal de apagado, cerrando conexiones...');
    
    // Cerrar servidor primero para dejar de recibir conexiones
    server.close(() => {
        console.log('✅ Servidor HTTP cerrado.');
        
        // Cerrar conexiones a la base de datos
        if (dbPool) {
            pool.closePool()
                .then(() => {
                    console.log('✅ Conexiones a base de datos cerradas correctamente.');
                    process.exit(0);
                })
                .catch(err => {
                    console.error('❌ Error al cerrar conexiones de base de datos:', err);
                    process.exit(1);
                });
        } else {
            console.log('✅ No hay conexiones a base de datos para cerrar.');
            process.exit(0);
        }
    });
    
    // Si después de 10 segundos no ha terminado, forzar cierre
    setTimeout(() => {
        console.error('⚠️ No se pudo cerrar limpiamente en 10s, forzando salida.');
        process.exit(1);
    }, 10000);
}

// Exportar app (opcional, para pruebas)
module.exports = app;