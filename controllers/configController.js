// controllers/configController.js
const pool = require('../db/db');

/**
 * Obtener configuración pública disponible sin login
 * GET /api/config/public
 */
const getPublicConfig = async (req, res) => {
    console.log("Petición GET /api/config/public");
    
    try {
        // Definir claves de configuración consideradas públicas
        const publicKeys = [
            'whatsapp_number', 
            'benefits_description',
            'company_address',
            'company_name',
            'app_version'
        ];

        // Crear placeholders (?) para consulta SQL parametrizada
        const placeholders = publicKeys.map(() => '?').join(',');
        
        // Consulta optimizada
        const query = `SELECT config_key, config_value, last_updated 
                       FROM configuration 
                       WHERE config_key IN (${placeholders})`;

        const [configRows] = await pool.execute(query, publicKeys);

        // Convertir el array de resultados en un objeto clave-valor
        const configObject = configRows.reduce((acc, curr) => {
            // Intentar parsear el valor JSON si corresponde
            try {
                // Si el valor parece ser JSON, lo parseamos
                if (curr.config_value && 
                   (curr.config_value.startsWith('{') || curr.config_value.startsWith('['))) {
                    acc[curr.config_key] = JSON.parse(curr.config_value);
                } else {
                    acc[curr.config_key] = curr.config_value;
                }
            } catch (e) {
                // Si falla el parsing, lo dejamos como string
                acc[curr.config_key] = curr.config_value;
            }
            return acc;
        }, {});

        // Añadir información sobre la última actualización
        const lastUpdated = configRows.length > 0 
            ? Math.max(...configRows.map(row => new Date(row.last_updated).getTime()))
            : null;
            
        if (lastUpdated) {
            configObject._lastUpdated = new Date(lastUpdated).toISOString();
        }
        
        console.log("✅ Enviando respuesta exitosa para /api/config/public");
        
        // Permitir caché del lado del cliente para esta configuración (15 minutos)
        res.set('Cache-Control', 'public, max-age=900');
        res.status(200).json(configObject);

    } catch (error) {
        console.error('Error en getPublicConfig:', error);
        res.status(500).json({ 
            message: 'Error al obtener configuración pública.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener todas las configuraciones (sólo para Gerente)
 * GET /api/config
 */
const getAllConfig = async (req, res) => {
    const requestingUserId = req.user.id;
    console.log(`Petición GET /api/config por User ID: ${requestingUserId}`);
    
    try {
        const [configRows] = await pool.execute(
            `SELECT config_key, config_value, description, 
                    DATE_FORMAT(last_updated, '%Y-%m-%d %H:%i:%s') as last_updated_formatted
             FROM configuration
             ORDER BY config_key ASC`
        );

        // Convertir a objeto con estructura mejorada
        const configObject = configRows.reduce((acc, curr) => {
            // Intentar determinar el tipo del valor automáticamente
            let parsedValue = curr.config_value;
            let valueType = 'string';
            
            // Intenta detectar el tipo basado en el contenido
            if (curr.config_value) {
                // Verifica si es un número
                if (/^-?\d+(\.\d+)?$/.test(curr.config_value)) {
                    parsedValue = Number(curr.config_value);
                    valueType = 'number';
                } 
                // Verifica si es un booleano
                else if (curr.config_value === 'true' || curr.config_value === 'false' || 
                        curr.config_value === '1' || curr.config_value === '0') {
                    parsedValue = curr.config_value === 'true' || curr.config_value === '1';
                    valueType = 'boolean';
                } 
                // Verifica si es JSON
                else if ((curr.config_value.startsWith('{') && curr.config_value.endsWith('}')) || 
                        (curr.config_value.startsWith('[') && curr.config_value.endsWith(']'))) {
                    try {
                        parsedValue = JSON.parse(curr.config_value);
                        valueType = 'json';
                    } catch (e) {
                        // Si falla el parsing, mantenerlo como string
                        console.warn(`Error al parsear JSON para ${curr.config_key}: ${e.message}`);
                    }
                }
            }
            
            acc[curr.config_key] = { 
                value: parsedValue,
                description: curr.description || null,
                lastUpdated: curr.last_updated_formatted,
                valueType: valueType
            };
            return acc;
        }, {});

        // Añadir metadata del sistema
        configObject._metadata = {
            totalCount: configRows.length,
            timestamp: new Date().toISOString()
        };

        res.status(200).json(configObject);
        
    } catch (error) {
        console.error('Error en getAllConfig:', error);
        res.status(500).json({ 
            message: 'Error al obtener la configuración.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Actualizar una o varias configuraciones (sólo para Gerente)
 * PUT /api/config
 */
const updateConfig = async (req, res) => {
    const configUpdates = req.body; // Espera un objeto { clave1: valor1, clave2: valor2, ... }
    const requestingUserId = req.user.id;
    
    console.log(`Petición PUT /api/config por User ID: ${requestingUserId}`);
    console.log("Datos a actualizar:", configUpdates);

    if (!configUpdates || typeof configUpdates !== 'object' || Object.keys(configUpdates).length === 0) {
        return res.status(400).json({ 
            message: 'Cuerpo de la petición inválido. Se espera un objeto con claves y valores.'
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Array para almacenar resultados de cada operación
        const updateResults = [];
        const updatePromises = [];

        // Procesar cada configuración
        for (const [key, value] of Object.entries(configUpdates)) {
            // Saltarse claves que empiezan con guion bajo (p.ej. _metadata)
            if (key.startsWith('_')) {
                console.log(`Ignorando clave con prefijo '_': ${key}`);
                continue;
            }
            
            // Validar valor según clave específica
            if (!validateConfigValue(key, value)) {
                updateResults.push({
                    key, 
                    success: false, 
                    message: 'Valor inválido para esta configuración.'
                });
                continue;
            }

            // Convertir a string para almacenar en BD
            let valueToStore = '';
            
            if (value === null || value === undefined) {
                valueToStore = '';
            } else if (typeof value === 'object') {
                valueToStore = JSON.stringify(value);
            } else {
                valueToStore = String(value);
            }

            try {
                const updatePromise = connection.execute(
                    `INSERT INTO configuration (config_key, config_value, last_updated)
                     VALUES (?, ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE 
                     config_value = VALUES(config_value),
                     last_updated = CURRENT_TIMESTAMP`,
                    [key, valueToStore]
                )
                .then(([result]) => {
                    // Registrar la acción en log (opcional)
                    return logConfigUpdate(connection, key, valueToStore, requestingUserId)
                        .then(() => {
                            updateResults.push({
                                key,
                                success: true,
                                affected: result.affectedRows,
                                isNew: result.affectedRows > 1 ? false : true
                            });
                        });
                })
                .catch(error => {
                    console.error(`Error actualizando config ${key}:`, error);
                    updateResults.push({
                        key,
                        success: false,
                        message: error.message
                    });
                    
                    // Relanzar para que la promesa principal falle
                    throw error;
                });
                
                updatePromises.push(updatePromise);
            } catch (error) {
                console.error(`Error actualizando config ${key}:`, error);
            }
        }

        // Ejecutar todas las actualizaciones
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        await connection.commit();
        
        console.log(`Configuración actualizada por User ID: ${requestingUserId}`);
        
        // Si todas las actualizaciones fueron exitosas
        const allSuccessful = updateResults.every(result => result.success);
        
        res.status(allSuccessful ? 200 : 207).json({ 
            message: allSuccessful 
                ? 'Configuración actualizada correctamente.' 
                : 'Algunas configuraciones no pudieron ser actualizadas.',
            results: updateResults
        });

    } catch (error) {
        if (connection) await connection.rollback();
        
        console.error('Error en updateConfig:', error);
        res.status(500).json({ 
            message: 'Error al actualizar la configuración.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtener historial de cambios de configuración
 * GET /api/config/history
 */
const getConfigHistory = async (req, res) => {
    const requestingUserId = req.user.id;
    const { key, limit = 20 } = req.query;
    
    console.log(`Petición GET /api/config/history por User ID: ${requestingUserId}`);
    
    try {
        let query = `
            SELECT 
                cl.log_id,
                cl.config_key,
                cl.old_value,
                cl.new_value,
                DATE_FORMAT(cl.change_date, '%Y-%m-%d %H:%i:%s') as change_date_formatted,
                cl.user_id,
                u.username,
                u.full_name as user_name
            FROM configlogs cl
            LEFT JOIN users u ON cl.user_id = u.user_id
        `;
        
        const params = [];
        
        // Filtrar por clave específica si se proporciona
        if (key) {
            query += ' WHERE cl.config_key = ?';
            params.push(key);
        }
        
        // Ordenar por fecha de cambio (más reciente primero)
        query += ' ORDER BY cl.change_date DESC';
        
        // Limitar número de resultados - CORREGIDO para MySQL 8.0.41
        const limitValue = parseInt(limit, 10);
        if (!isNaN(limitValue)) {
            query += ` LIMIT ${limitValue}`;
        } else {
            query += ' LIMIT 20'; // Valor por defecto
        }
        
        const [logs] = await pool.execute(query, params);
        
        res.status(200).json({ 
            history: logs,
            filters: { key, limit }
        });
        
    } catch (error) {
        console.error('Error en getConfigHistory:', error);
        res.status(500).json({ 
            message: 'Error al obtener historial de configuración.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Restablecer configuración a valores predeterminados
 * POST /api/config/reset
 */
const resetConfig = async (req, res) => {
    const requestingUserId = req.user.id;
    const { keys } = req.body; // Array de claves a restablecer o 'all'
    
    console.log(`Petición POST /api/config/reset por User ID: ${requestingUserId}`);
    
    if (!keys) {
        return res.status(400).json({ message: 'Se requiere especificar las claves a restablecer.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Cargar valores predeterminados
        const defaultValues = getDefaultConfigValues();
        const resetResults = [];
        
        if (keys === 'all') {
            // Restablecer todas las claves disponibles en defaultValues
            for (const [key, defaultValue] of Object.entries(defaultValues)) {
                await resetConfigValue(connection, key, defaultValue, requestingUserId, resetResults);
            }
        } else if (Array.isArray(keys)) {
            // Restablecer solo las claves especificadas
            for (const key of keys) {
                if (defaultValues.hasOwnProperty(key)) {
                    await resetConfigValue(connection, key, defaultValues[key], requestingUserId, resetResults);
                } else {
                    resetResults.push({
                        key,
                        success: false,
                        message: 'No hay valor predeterminado para esta clave.'
                    });
                }
            }
        } else {
            await connection.rollback();
            return res.status(400).json({ message: 'El formato de las claves a restablecer es inválido.' });
        }
        
        await connection.commit();
        
        console.log(`Configuración restablecida por User ID: ${requestingUserId}`);
        
        res.status(200).json({
            message: 'Configuración restablecida correctamente.',
            results: resetResults
        });
        
    } catch (error) {
        if (connection) await connection.rollback();
        
        console.error('Error en resetConfig:', error);
        res.status(500).json({ 
            message: 'Error al restablecer la configuración.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- Funciones auxiliares ---

/**
 * Valida el valor de una configuración según su clave
 * @param {string} key - Clave de configuración
 * @param {any} value - Valor a validar
 * @returns {boolean} - True si es válido, false en caso contrario
 */
function validateConfigValue(key, value) {
    // Validaciones específicas según la clave
    switch (key) {
        case 'points_per_sol':
            // Debe ser un número no negativo
            return typeof value === 'number' && value >= 0;
            
        case 'points_for_referral':
            // Debe ser un entero no negativo
            return Number.isInteger(value) && value >= 0;
            
        case 'points_min_redeem':
            // Debe ser un entero positivo
            return Number.isInteger(value) && value > 0;
            
        case 'points_discount_value':
            // Debe ser un número positivo
            return typeof value === 'number' && value > 0;
            
        case 'benefits_description':
            // Debe ser un string y tener un tamaño razonable
            return typeof value === 'string' && value.length <= 1000;
            
        case 'whatsapp_number':
            // Debe ser un número o string numérico válido
            return (/^\d+$/).test(String(value).trim()) || value === '';
            
        // Añadir más validaciones según se requiera
        
        default:
            // Para claves no especificadas, aceptar cualquier valor no nulo
            return value !== null && value !== undefined;
    }
}

/**
 * Registra un cambio de configuración en el log
 * @param {Object} connection - Conexión a la base de datos
 * @param {string} key - Clave de configuración
 * @param {string} newValue - Nuevo valor (ya convertido a string)
 * @param {number} userId - ID del usuario que hizo el cambio
 * @returns {Promise} - Promesa que resuelve cuando se completa el log
 */
async function logConfigUpdate(connection, key, newValue, userId) {
    try {
        // Obtener valor anterior
        const [oldValueRows] = await connection.execute(
            'SELECT config_value FROM configuration WHERE config_key = ?',
            [key]
        );
        
        const oldValue = oldValueRows.length > 0 ? oldValueRows[0].config_value : null;
        
        // Si el valor no ha cambiado, no necesitamos registrar el log
        if (oldValue === newValue) {
            return;
        }
        
        // Registrar en log - utilizando nombre correcto de tabla en minúsculas
        await connection.execute(
            `INSERT INTO configlogs 
            (config_key, old_value, new_value, user_id, change_date)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [key, oldValue, newValue, userId]
        );
    } catch (error) {
        console.error(`Error al registrar log de configuración para ${key}:`, error);
        // No propagamos el error para evitar afectar la operación principal
    }
}

/**
 * Obtiene los valores predeterminados de configuración
 * @returns {Object} - Objeto con los valores predeterminados
 */
function getDefaultConfigValues() {
    return {
        points_per_sol: 0,
        points_for_referral: 50,
        points_min_redeem: 100,
        points_discount_value: 10.00,
        benefits_description: 'Por cada 100 puntos obtienes S/10.00 de descuento en tu próxima compra.',
        whatsapp_number: '',
        company_name: 'Gas ERP Ayacucho',
        company_address: 'Av. Principal 123, Ayacucho',
        app_version: '1.0.0'
        // Añadir más valores predeterminados según sea necesario
    };
}

/**
 * Restablece una configuración a su valor predeterminado
 * @param {Object} connection - Conexión a la base de datos
 * @param {string} key - Clave de configuración
 * @param {any} defaultValue - Valor predeterminado
 * @param {number} userId - ID del usuario que realiza el restablecimiento
 * @param {Array} results - Array para almacenar resultados
 */
async function resetConfigValue(connection, key, defaultValue, userId, results) {
    try {
        // Convertir a string para almacenar en BD
        let valueToStore = '';
        
        if (defaultValue === null || defaultValue === undefined) {
            valueToStore = '';
        } else if (typeof defaultValue === 'object') {
            valueToStore = JSON.stringify(defaultValue);
        } else if (typeof defaultValue === 'number') {
            valueToStore = String(defaultValue);
        } else if (typeof defaultValue === 'boolean') {
            valueToStore = defaultValue ? 'true' : 'false';
        } else {
            valueToStore = String(defaultValue);
        }
        
        // Actualizar en la base de datos
        const [result] = await connection.execute(
            `UPDATE configuration 
             SET config_value = ?, last_updated = CURRENT_TIMESTAMP
             WHERE config_key = ?`,
            [valueToStore, key]
        );
        
        // Si no existe, insertarla
        if (result.affectedRows === 0) {
            await connection.execute(
                `INSERT INTO configuration 
                (config_key, config_value, last_updated)
                VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [key, valueToStore]
            );
        }
        
        // Registrar en log
        await logConfigUpdate(connection, key, valueToStore, userId);
        
        results.push({
            key,
            success: true,
            resetTo: defaultValue
        });
    } catch (error) {
        console.error(`Error al restablecer config ${key}:`, error);
        results.push({
            key,
            success: false,
            message: error.message
        });
        
        // Relanzar para que la promesa principal falle
        throw error;
    }
}

// Exportar controladores
module.exports = {
    getPublicConfig,
    getAllConfig,
    updateConfig,
    getConfigHistory,
    resetConfig
};