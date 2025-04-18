// db.js - VERSIÓN CORREGIDA
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Configuración para el pool de conexiones con valores por defecto
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE, // Campo obligatorio, no tiene valor por defecto
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '0', 10), // 0 = sin límite
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10), // 10 segundos
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000', 10), // 10 segundos
  // Habilitar registro de errores de conexión
  debug: process.env.NODE_ENV === 'development',
  // Manejo de errores de conexión
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000 // 30 segundos para mantener viva la conexión
};

// Validar si la base de datos está configurada
if (!dbConfig.database) {
  console.error('⛔ ERROR CRÍTICO: Variable DB_DATABASE no definida en .env');
  console.error('Por favor configure las variables de entorno correctamente.');
  // No realiza process.exit() aquí para permitir manejo más flexible, pero advierte claramente
}

// Variable para almacenar el pool
let pool;

/**
 * Inicializa y retorna el pool de conexiones.
 * Si el pool ya existe, devuelve la instancia existente (patrón Singleton).
 * @returns {Promise<mysql.Pool>} Instancia del pool de conexiones
 */
async function getConnectionPool() {
  if (pool) {
    return pool;
  }

  try {
    console.log('🔄 Iniciando conexión al pool de MySQL...');
    
    // Crear el pool de conexiones
    pool = mysql.createPool(dbConfig);
    
    // Verificar que el pool funcione realizando una conexión de prueba
    const connection = await pool.getConnection();
    console.log('✅ Conexión a la Base de Datos MySQL establecida correctamente.');
    // Verificar que la base de datos esté lista ejecutando una consulta simple
    await connection.query('SELECT 1 AS testConnection');
    connection.release();
    
    // Manejar desconexiones inesperadas a nivel de pool
    pool.on('error', (err) => {
      console.error('❌ Error en el pool de MySQL:', err);
      
      // Si es un error de conexión perdida, intentar recrear el pool
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || 
          err.code === 'ECONNRESET' || 
          err.code === 'ETIMEDOUT') {
        console.log('🔄 Intentando reconectar al pool de MySQL...');
        pool = null; // Forzar recreación en la próxima llamada a getConnectionPool()
      }
    });
    
    return pool;
  } catch (err) {
    console.error('❌ Error crítico al conectar con la Base de Datos MySQL:');
    console.error(err);
    
    // Registrar detalles específicos para facilitar el diagnóstico
    if (err.code === 'ECONNREFUSED') {
      console.error(`⚠️ No se pudo conectar a MySQL en ${dbConfig.host}:${dbConfig.port}.`);
      console.error('Verifique que el servidor MySQL esté en ejecución y accesible.');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('⚠️ Acceso denegado: nombre de usuario o contraseña incorrectos.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`⚠️ La base de datos '${dbConfig.database}' no existe.`);
      console.error('Verifique el nombre de la base de datos o ejecute el script de inicialización.');
    }
    
    // Lanzar el error para que sea manejado por el código que llama a esta función
    throw err;
  }
}

/**
 * Obtiene una conexión del pool.
 * @returns {Promise<mysql.PoolConnection>} Una conexión del pool
 */
async function getConnection() {
  const pool = await getConnectionPool();
  return pool.getConnection();
}

/**
 * Ejecuta una consulta SQL con parámetros.
 * @param {string} sql - Consulta SQL a ejecutar
 * @param {Array} params - Parámetros para la consulta
 * @returns {Promise<Array>} Resultado de la consulta
 */
async function execute(sql, params = []) {
  const pool = await getConnectionPool();
  return pool.execute(sql, params);
}

/**
 * Ejecuta una consulta SQL con parámetros dentro de una transacción.
 * Obtiene una conexión, inicia transacción, ejecuta la consulta y maneja commit/rollback.
 * @param {Function} callback - Función que recibe la conexión y realiza operaciones de transacción
 * @returns {Promise<any>} Resultado de la transacción
 */
async function withTransaction(callback) {
  let connection;
  try {
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Ejecutar las operaciones de transacción
    const result = await callback(connection);
    
    // Si todo fue exitoso, confirmar la transacción
    await connection.commit();
    return result;
  } catch (error) {
    // Si hay un error, hacer rollback
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error durante rollback:', rollbackError);
      }
    }
    throw error;
  } finally {
    // Siempre liberar la conexión al terminar
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Cierra el pool de conexiones.
 * Útil para pruebas y cierre controlado de la aplicación.
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    try {
      await pool.end();
      console.log('✅ Pool de conexiones cerrado correctamente.');
      pool = null;
    } catch (err) {
      console.error('❌ Error al cerrar el pool de conexiones:', err);
      throw err;
    }
  }
}

// Exportar funciones para uso en otros módulos
module.exports = {
  getConnectionPool,
  getConnection,
  execute,
  withTransaction,
  closePool
};