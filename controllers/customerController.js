// controllers/customerController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');

/**
 * Listar clientes con filtros y paginación
 * GET /api/customers?limit=X&page=Y&search=Z&type=T&sort=column&order=ASC|DESC
 */
const listCustomers = async (req, res) => {
    const { 
        limit = 25, 
        page = 1, 
        search = '', 
        type = '', 
        sort = 'full_name', 
        order = 'ASC' 
    } = req.query;
    
    // Calcular offset para paginación
    const offset = (page - 1) * limit;
    
    console.log(`GET /api/customers por User ID: ${req.user.id}, Query:`, req.query);
    
    try {
        // Construir query base
        let sql = `
            SELECT 
                u.user_id, 
                u.full_name, 
                u.phone_number_primary,
                u.phone_number_secondary, 
                u.email, 
                c.dni_ruc,
                c.customer_type, 
                c.loyalty_points, 
                c.referral_code,
                c.birth_date,
                DATE_FORMAT(c.last_purchase_date, '%Y-%m-%d') as last_purchase_date,
                c.address_text
            FROM 
                Users u
                JOIN Customers c ON u.user_id = c.user_id
                JOIN Roles r ON u.role_id = r.role_id
            WHERE 
                r.role_name = 'cliente'
                AND u.is_active = TRUE
        `;
        
        const params = [];
        
        // Filtros adicionales
        if (search) {
            sql += ` AND (
                u.full_name LIKE ? 
                OR u.phone_number_primary LIKE ? 
                OR u.email LIKE ? 
                OR c.dni_ruc LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        
        if (type && type !== 'all') {
            sql += ' AND c.customer_type = ?';
            params.push(type);
        }
        
        // Validar columna de ordenamiento para evitar inyección SQL
        const validColumns = [
            'user_id', 'full_name', 'phone_number_primary', 
            'email', 'dni_ruc', 'customer_type', 
            'loyalty_points', 'birth_date', 'last_purchase_date'
        ];
        
        const sortColumn = validColumns.includes(sort) ? sort : 'full_name';
        const sortDirection = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        
        // Añadir ordenamiento seguro
        sql += ' ORDER BY ' + 
            (sortColumn.includes('date') ? `${sortColumn} ${sortDirection} NULLS LAST` : 
             (sortColumn.startsWith('u.') || sortColumn.startsWith('c.')) ? 
             `${sortColumn} ${sortDirection}` : 
             (sortColumn.includes('loyalty_points') ? 
              `c.${sortColumn} ${sortDirection}` : 
              (sortColumn.includes('dni_ruc') || sortColumn.includes('customer_type') || 
               sortColumn.includes('birth_date') || sortColumn.includes('last_purchase_date')) ? 
              `c.${sortColumn} ${sortDirection}` : 
              `u.${sortColumn} ${sortDirection}`));
        
        // Añadir paginación
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        // Ejecutar consulta principal
        const [customers] = await pool.execute(sql, params);
        
        // Obtener conteo total para metadatos de paginación
        let countSql = `
            SELECT COUNT(*) as total 
            FROM Users u
            JOIN Customers c ON u.user_id = c.user_id
            JOIN Roles r ON u.role_id = r.role_id
            WHERE r.role_name = 'cliente' AND u.is_active = TRUE
        `;
        
        const countParams = [];
        
        if (search) {
            countSql += ` AND (
                u.full_name LIKE ? 
                OR u.phone_number_primary LIKE ? 
                OR u.email LIKE ? 
                OR c.dni_ruc LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        
        if (type && type !== 'all') {
            countSql += ' AND c.customer_type = ?';
            countParams.push(type);
        }
        
        const [countResult] = await pool.execute(countSql, countParams);
        const totalCount = countResult[0].total;
        
        // Formatear fechas y preparar respuesta final
        const formattedCustomers = customers.map(customer => {
            if (customer.birth_date) {
                // Transformar fecha a formato YYYY-MM-DD
                customer.birth_date = customer.birth_date.toISOString().split('T')[0];
            }
            
            return customer;
        });
        
        // Enviar respuesta con metadatos de paginación
        res.status(200).json({
            customers: formattedCustomers,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalCount / limit)
            }
        });
        
    } catch (error) {
        console.error('Error en listCustomers:', error);
        res.status(500).json({ 
            message: 'Error interno al listar clientes.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener detalles completos de un cliente por ID
 * GET /api/customers/:id
 */
const getCustomerDetails = async (req, res) => {
    const customerUserId = req.params.id;
    console.log(`GET /api/customers/${customerUserId} por User ID: ${req.user.id}`);
    
    try {
        // Obtener datos del cliente y usuario combinados
        const [customerRows] = await pool.execute(
            `SELECT 
                u.user_id,
                u.username,
                u.full_name,
                u.phone_number_primary,
                u.phone_number_secondary,
                u.email,
                u.is_active,
                c.customer_id,
                c.dni_ruc,
                c.customer_type,
                c.address_text,
                c.address_latitude,
                c.address_longitude,
                DATE_FORMAT(c.birth_date, '%Y-%m-%d') as birth_date,
                c.loyalty_points,
                c.referral_code,
                c.referred_by_code,
                DATE_FORMAT(c.last_purchase_date, '%Y-%m-%d') as last_purchase_date,
                DATE_FORMAT(u.created_at, '%Y-%m-%d') as registration_date
            FROM 
                Users u
                JOIN Customers c ON u.user_id = c.user_id
                JOIN Roles r ON u.role_id = r.role_id
            WHERE 
                u.user_id = ? 
                AND r.role_name = 'cliente'
            LIMIT 1`,
            [customerUserId]
        );
        
        if (customerRows.length === 0) {
            return res.status(404).json({ message: `Cliente con ID ${customerUserId} no encontrado.` });
        }
        
        const customerDetails = customerRows[0];
        
        // Obtener precios especiales del cliente (si los tiene)
        const [specialPricesRows] = await pool.execute(
            `SELECT 
                csp.csp_id,
                csp.cylinder_type_id,
                ct.name as cylinder_name,
                ct.price_exchange as standard_price,
                csp.price_exchange as special_price
            FROM 
                CustomerSpecificPrices csp
                JOIN CylinderTypes ct ON csp.cylinder_type_id = ct.cylinder_type_id
            WHERE 
                csp.customer_user_id = ?
            ORDER BY 
                ct.name`,
            [customerUserId]
        );
        
        // Obtener historial reciente de pedidos (opcional)
        const [recentOrdersRows] = await pool.execute(
            `SELECT 
                o.order_id,
                DATE_FORMAT(o.order_date, '%Y-%m-%d') as order_date,
                o.total_amount,
                o.order_status,
                o.payment_status
            FROM 
                Orders o
            WHERE 
                o.customer_user_id = ?
            ORDER BY 
                o.order_date DESC
            LIMIT 5`,
            [customerUserId]
        );
        
        // Obtener historial de transacciones de puntos (opcional)
        const [pointsTransactionsRows] = await pool.execute(
            `SELECT 
                lt.loyalty_tx_id,
                DATE_FORMAT(lt.transaction_date, '%Y-%m-%d') as transaction_date,
                lt.points_change,
                lt.reason,
                lt.related_order_id,
                lt.notes
            FROM 
                LoyaltyTransactions lt
            WHERE 
                lt.customer_user_id = ?
            ORDER BY 
                lt.transaction_date DESC
            LIMIT 10`,
            [customerUserId]
        );
        
        // Estructurar respuesta final
        const result = {
            ...customerDetails,
            special_prices: specialPricesRows,
            recent_orders: recentOrdersRows,
            points_transactions: pointsTransactionsRows
        };
        
        res.status(200).json(result);
        
    } catch (error) {
        console.error('Error en getCustomerDetails:', error);
        res.status(500).json({ 
            message: 'Error interno al obtener detalles del cliente.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener clientes con cumpleaños próximos
 * GET /api/customers/birthdays?days=30&limit=10
 */
const getUpcomingBirthdays = async (req, res) => {
    const { days = 30, limit = 10 } = req.query;
    console.log(`GET /api/customers/birthdays?days=${days} por User ID: ${req.user.id}`);
    
    // Validar parámetros
    const daysAhead = parseInt(days) || 30;
    const resultLimit = parseInt(limit) || 10;
    
    if (daysAhead < 1 || daysAhead > 365) {
        return res.status(400).json({ message: 'El parámetro "days" debe estar entre 1 y 365.' });
    }
    
    if (resultLimit < 1 || resultLimit > 100) {
        return res.status(400).json({ message: 'El parámetro "limit" debe estar entre 1 y 100.' });
    }
    
    try {
        // Consulta SQL con lógica para detectar cumpleaños en los próximos N días
        // Independientemente del año de nacimiento
        const [birthdayRows] = await pool.execute(
            `SELECT 
                u.user_id,
                u.full_name,
                u.phone_number_primary,
                DATE_FORMAT(c.birth_date, '%Y-%m-%d') as birth_date,
                c.customer_type,
                c.loyalty_points,
                c.address_text,
                # Cálculo de días restantes hasta el próximo cumpleaños
                CASE 
                    # Si el cumpleaños ya pasó este año, calcular días hasta el cumpleaños del próximo año
                    WHEN DAYOFYEAR(c.birth_date) < DAYOFYEAR(CURDATE()) 
                    THEN DAYOFYEAR(c.birth_date) + 366 - DAYOFYEAR(CURDATE())
                    # Si el cumpleaños es hoy o aún no ha ocurrido este año
                    ELSE DAYOFYEAR(c.birth_date) - DAYOFYEAR(CURDATE())
                END as days_until_birthday
            FROM 
                Users u
                JOIN Customers c ON u.user_id = c.user_id
                JOIN Roles r ON u.role_id = r.role_id
            WHERE 
                r.role_name = 'cliente'
                AND u.is_active = TRUE
                AND c.birth_date IS NOT NULL
                # Filtrar por clientes con cumpleaños en los próximos 'daysAhead' días
                AND (
                    # Si el cumpleaños ya pasó este año, verificar si el próximo cumpleaños es dentro de 'daysAhead' días
                    (
                        DAYOFYEAR(c.birth_date) < DAYOFYEAR(CURDATE()) 
                        AND DAYOFYEAR(c.birth_date) + 366 - DAYOFYEAR(CURDATE()) <= ?
                    )
                    # Si el cumpleaños es hoy o aún no ha ocurrido este año
                    OR (
                        DAYOFYEAR(c.birth_date) >= DAYOFYEAR(CURDATE())
                        AND DAYOFYEAR(c.birth_date) - DAYOFYEAR(CURDATE()) <= ?
                    )
                )
            ORDER BY 
                days_until_birthday ASC, u.full_name ASC
            LIMIT ?`,
            [daysAhead, daysAhead, resultLimit]
        );
        
        // Procesar resultados y añadir información adicional útil
        const birthdays = birthdayRows.map(customer => {
            // Calcular fecha del próximo cumpleaños
            const birthDate = new Date(customer.birth_date);
            const currentDate = new Date();
            const birthDay = birthDate.getDate();
            const birthMonth = birthDate.getMonth();
            
            let nextBirthdayYear = currentDate.getFullYear();
            // Si ya pasó el cumpleaños este año, el próximo es el año siguiente
            if (
                (birthMonth < currentDate.getMonth()) || 
                (birthMonth === currentDate.getMonth() && birthDay < currentDate.getDate())
            ) {
                nextBirthdayYear += 1;
            }
            
            const nextBirthday = new Date(nextBirthdayYear, birthMonth, birthDay);
            
            const birthDayFormatted = birthDate.toLocaleDateString('es-ES', { 
                day: 'numeric', 
                month: 'long' 
            });
            
            const nextBirthdayFormatted = nextBirthday.toLocaleDateString('es-ES', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric'
            });
            
            return {
                ...customer,
                birth_day_formatted: birthDayFormatted,
                next_birthday_formatted: nextBirthdayFormatted,
                customer_age: nextBirthdayYear - birthDate.getFullYear()
            };
        });
        
        res.status(200).json(birthdays);
        
    } catch (error) {
        console.error('Error en getUpcomingBirthdays:', error);
        res.status(500).json({ 
            message: 'Error interno al obtener próximos cumpleaños.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Establecer o actualizar precios especiales para un cliente
 * PUT /api/customers/:id/pricing
 * Body: { prices: [{ cylinder_type_id: X, price_exchange: Y }, ...] }
 */
const setSpecialPrices = async (req, res) => {
    const customerUserId = req.params.id;
    const { prices } = req.body; // Array de { cylinder_type_id, price_exchange }
    const adminUserId = req.user.id;
    
    console.log(`PUT /api/customers/${customerUserId}/pricing por User ID: ${adminUserId}`);
    console.log("Datos recibidos:", req.body);
    
    // Validar datos de entrada
    if (!prices || !Array.isArray(prices) || prices.length === 0) {
        return res.status(400).json({ message: 'Se requiere un array de precios válido.' });
    }
    
    // Validar cada ítem de precio
    for (const price of prices) {
        if (!price.cylinder_type_id) {
            return res.status(400).json({ message: 'Todos los ítems deben tener un cylinder_type_id válido.' });
        }
        
        if (price.price_exchange === undefined || price.price_exchange === null || price.price_exchange === '') {
            return res.status(400).json({ message: 'Todos los ítems deben tener un price_exchange válido.' });
        }
        
        const priceValue = parseFloat(price.price_exchange);
        if (isNaN(priceValue) || priceValue < 0) {
            return res.status(400).json({ message: 'Los precios deben ser valores numéricos no negativos.' });
        }
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el cliente existe
        const [customerCheck] = await connection.execute(
            `SELECT c.user_id
             FROM Customers c
             JOIN Users u ON c.user_id = u.user_id
             JOIN Roles r ON u.role_id = r.role_id
             WHERE c.user_id = ? AND r.role_name = 'cliente' AND u.is_active = TRUE`,
            [customerUserId]
        );
        
        if (customerCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Cliente con ID ${customerUserId} no encontrado o no activo.` });
        }
        
        // Primero, eliminar precios especiales existentes para este cliente
        await connection.execute(
            'DELETE FROM CustomerSpecificPrices WHERE customer_user_id = ?',
            [customerUserId]
        );
        
        // Luego, insertar los nuevos precios
        const insertPromises = prices.map(price => 
            connection.execute(
                'INSERT INTO CustomerSpecificPrices (customer_user_id, cylinder_type_id, price_exchange) VALUES (?, ?, ?)',
                [
                    customerUserId, 
                    price.cylinder_type_id, 
                    parseFloat(price.price_exchange)
                ]
            )
        );
        
        await Promise.all(insertPromises);
        
        // Registro para auditoría (opcional - podría añadirse a una tabla de log)
        console.log(`Precios especiales actualizados para cliente ID ${customerUserId} por admin ID ${adminUserId}. ${prices.length} precios establecidos.`);
        
        await connection.commit();
        
        res.status(200).json({ 
            message: 'Precios especiales actualizados correctamente.',
            updated_price_count: prices.length
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en setSpecialPrices:', error);
        
        // Errores específicos
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                message: 'Error: Uno o más tipos de cilindro referenciados no existen.' 
            });
        }
        
        res.status(500).json({ 
            message: 'Error interno al actualizar precios especiales.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Eliminar todos los precios especiales de un cliente
 * DELETE /api/customers/:id/pricing
 */
const clearSpecialPrices = async (req, res) => {
    const customerUserId = req.params.id;
    const adminUserId = req.user.id;
    
    console.log(`DELETE /api/customers/${customerUserId}/pricing por User ID: ${adminUserId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el cliente existe
        const [customerCheck] = await connection.execute(
            `SELECT c.user_id
             FROM Customers c
             JOIN Users u ON c.user_id = u.user_id
             JOIN Roles r ON u.role_id = r.role_id
             WHERE c.user_id = ? AND r.role_name = 'cliente'`,
            [customerUserId]
        );
        
        if (customerCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Cliente con ID ${customerUserId} no encontrado.` });
        }
        
        // Eliminar todos los precios especiales para este cliente
        const [result] = await connection.execute(
            'DELETE FROM CustomerSpecificPrices WHERE customer_user_id = ?',
            [customerUserId]
        );
        
        // Registro para auditoría
        console.log(`Precios especiales eliminados para cliente ID ${customerUserId} por admin ID ${adminUserId}. ${result.affectedRows} precios eliminados.`);
        
        await connection.commit();
        
        res.status(200).json({ 
            message: 'Precios especiales eliminados correctamente.',
            removed_price_count: result.affectedRows
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en clearSpecialPrices:', error);
        res.status(500).json({ 
            message: 'Error interno al eliminar precios especiales.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Ajustar (añadir o quitar) puntos de fidelidad a un cliente
 * POST /api/customers/:id/points/adjust
 * Body: { points_change: 50, reason: "manual_adjustment", notes: "..." }
 */
const adjustLoyaltyPoints = async (req, res) => {
    const customerUserId = req.params.id;
    const { points_change, reason, notes } = req.body;
    const adminUserId = req.user.id;
    
    console.log(`POST /api/customers/${customerUserId}/points/adjust por User ID: ${adminUserId}`);
    console.log("Datos recibidos:", req.body);
    
    // Validaciones de entrada
    if (points_change === undefined || points_change === null) {
        return res.status(400).json({ message: 'Se requiere especificar el cambio de puntos.' });
    }
    
    const pointsChangeValue = parseInt(points_change);
    if (isNaN(pointsChangeValue) || pointsChangeValue === 0) {
        return res.status(400).json({ 
            message: 'El cambio de puntos debe ser un número entero distinto de cero (positivo para añadir, negativo para quitar).' 
        });
    }
    
    if (!reason) {
        return res.status(400).json({ message: 'Se requiere especificar el motivo del ajuste.' });
    }
    
    // Verificar que el motivo es válido
    const validReasons = [
        'manual_adjustment', 
        'promo_earn', 
        'birthday_bonus', 
        'correction', 
        'other'
    ];
    
    if (!validReasons.includes(reason)) {
        return res.status(400).json({ 
            message: `Motivo inválido. Debe ser uno de: ${validReasons.join(', ')}.` 
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el cliente existe y obtener puntos actuales
        const [customerCheck] = await connection.execute(
            `SELECT c.user_id, c.loyalty_points
             FROM Customers c
             JOIN Users u ON c.user_id = u.user_id
             JOIN Roles r ON u.role_id = r.role_id
             WHERE c.user_id = ? AND r.role_name = 'cliente' AND u.is_active = TRUE`,
            [customerUserId]
        );
        
        if (customerCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Cliente con ID ${customerUserId} no encontrado o no activo.` });
        }
        
        const currentPoints = customerCheck[0].loyalty_points || 0;
        const newPoints = currentPoints + pointsChangeValue;
        
        // Validar que los puntos no queden negativos
        if (newPoints < 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El ajuste resultaría en puntos negativos. Puntos actuales: ${currentPoints}, Cambio: ${pointsChangeValue}.` 
            });
        }
        
        // Actualizar puntos del cliente
        await connection.execute(
            'UPDATE Customers SET loyalty_points = ? WHERE user_id = ?',
            [newPoints, customerUserId]
        );
        
        // Registrar transacción de puntos
        await connection.execute(
            `INSERT INTO LoyaltyTransactions 
            (customer_user_id, transaction_date, points_change, reason, notes) 
            VALUES (?, NOW(), ?, ?, ?)`,
            [customerUserId, pointsChangeValue, reason, notes || null]
        );
        
        await connection.commit();
        
        console.log(`Puntos ajustados para cliente ID ${customerUserId} por admin ID ${adminUserId}. Cambio: ${pointsChangeValue}, Nuevo total: ${newPoints}.`);
        
        res.status(200).json({ 
            message: 'Puntos de fidelidad ajustados correctamente.',
            previous_points: currentPoints,
            points_change: pointsChangeValue,
            new_points: newPoints
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en adjustLoyaltyPoints:', error);
        res.status(500).json({ 
            message: 'Error interno al ajustar puntos de fidelidad.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Cliente canjea puntos de fidelidad por descuento
 * POST /api/customers/me/redeem-points
 * Body: { points_to_redeem: 100 }
 */
const redeemPoints = async (req, res) => {
    const customerUserId = req.user.id; // El propio cliente solicita el canje
    const { points_to_redeem } = req.body;
    
    console.log(`POST /api/customers/me/redeem-points por User ID: ${customerUserId}`);
    console.log("Datos recibidos:", req.body);
    
    // Validaciones de entrada
    if (!points_to_redeem || isNaN(parseInt(points_to_redeem)) || parseInt(points_to_redeem) <= 0) {
        return res.status(400).json({ message: 'Se requiere especificar una cantidad válida de puntos a canjear.' });
    }
    
    const pointsToRedeemValue = parseInt(points_to_redeem);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar puntos actuales del cliente
        const [customerCheck] = await connection.execute(
            `SELECT c.loyalty_points
             FROM Customers c
             JOIN Users u ON c.user_id = u.user_id
             WHERE c.user_id = ? AND u.is_active = TRUE`,
            [customerUserId]
        );
        
        if (customerCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Cliente no encontrado o no activo.' });
        }
        
        const currentPoints = customerCheck[0].loyalty_points || 0;
        
        // Obtener parámetros del sistema para canje de puntos
        const [configRows] = await connection.execute(
            `SELECT 
                (SELECT config_value FROM Configuration WHERE config_key = 'points_min_redeem') as min_points,
                (SELECT config_value FROM Configuration WHERE config_key = 'points_discount_value') as discount_value
            `
        );
        
        const minPointsToRedeem = parseInt(configRows[0].min_points) || 100; // Valor predeterminado si no existe
        const discountValuePerPoint = parseFloat(configRows[0].discount_value) || 0.1; // Valor predeterminado si no existe
        
        // Validar mínimo de puntos para canje
        if (pointsToRedeemValue < minPointsToRedeem) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `Debe canjear al menos ${minPointsToRedeem} puntos. Usted solicitó canjear ${pointsToRedeemValue}.` 
            });
        }
        
        // Validar que el cliente tiene suficientes puntos
        if (currentPoints < pointsToRedeemValue) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `Puntos insuficientes. Tiene ${currentPoints} puntos, solicitó canjear ${pointsToRedeemValue}.` 
            });
        }
        
        // Calcular valor del descuento
        const discountAmount = pointsToRedeemValue * discountValuePerPoint;
        
        // Actualizar puntos del cliente
        const newPoints = currentPoints - pointsToRedeemValue;
        await connection.execute(
            'UPDATE Customers SET loyalty_points = ? WHERE user_id = ?',
            [newPoints, customerUserId]
        );
        
        // Registrar transacción de puntos
        const [transactionResult] = await connection.execute(
            `INSERT INTO LoyaltyTransactions 
            (customer_user_id, transaction_date, points_change, reason, notes) 
            VALUES (?, NOW(), ?, 'redemption_spend', ?)`,
            [customerUserId, -pointsToRedeemValue, `Canje por descuento de ${discountAmount.toFixed(2)} PEN`]
        );
        
        const transactionId = transactionResult.insertId;
        
        // Aquí se podría crear un voucher de descuento o aplicarlo directamente a una orden
        // Por ahora, simplemente registramos el canje
        
        await connection.commit();
        
        console.log(`Puntos canjeados por cliente ID ${customerUserId}. Puntos: ${pointsToRedeemValue}, Descuento: ${discountAmount.toFixed(2)}.`);
        
        res.status(200).json({ 
            message: 'Puntos canjeados exitosamente.',
            previous_points: currentPoints,
            points_redeemed: pointsToRedeemValue,
            new_points: newPoints,
            discount_amount: discountAmount.toFixed(2),
            transaction_id: transactionId,
            // voucher_code: "XXX" // Si se implementa sistema de vales
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en redeemPoints:', error);
        res.status(500).json({ 
            message: 'Error interno al canjear puntos.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener estadísticas del programa de fidelización
 * GET /api/customers/loyalty/stats
 */
const getLoyaltyStats = async (req, res) => {
    const adminUserId = req.user.id;
    console.log(`GET /api/customers/loyalty/stats por User ID: ${adminUserId}`);
    
    try {
        // Estadísticas generales del programa de fidelidad
        const [statsRows] = await pool.execute(
            `SELECT 
                COUNT(DISTINCT c.user_id) as total_customers,
                SUM(c.loyalty_points) as total_points_outstanding,
                AVG(c.loyalty_points) as avg_points_per_customer,
                MAX(c.loyalty_points) as max_points
            FROM 
                Customers c
                JOIN Users u ON c.user_id = u.user_id
            WHERE 
                u.is_active = TRUE`
        );
        
        // Distribución de puntos por tipo de cliente
        const [distributionRows] = await pool.execute(
            `SELECT 
                c.customer_type,
                COUNT(c.user_id) as customer_count,
                SUM(c.loyalty_points) as total_points,
                AVG(c.loyalty_points) as avg_points
            FROM 
                Customers c
                JOIN Users u ON c.user_id = u.user_id
            WHERE 
                u.is_active = TRUE
            GROUP BY 
                c.customer_type
            ORDER BY 
                total_points DESC`
        );
        
        // Transacciones recientes
        const [recentTransactionsRows] = await pool.execute(
            `SELECT 
                lt.reason,
                COUNT(lt.loyalty_tx_id) as transaction_count,
                SUM(lt.points_change) as total_points_change
            FROM 
                LoyaltyTransactions lt
            WHERE 
                lt.transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            GROUP BY 
                lt.reason
            ORDER BY 
                total_points_change DESC`
        );
        
        // Clientes con más puntos
        const [topCustomersRows] = await pool.execute(
            `SELECT 
                u.user_id,
                u.full_name,
                c.loyalty_points,
                c.customer_type
            FROM 
                Customers c
                JOIN Users u ON c.user_id = u.user_id
            WHERE 
                u.is_active = TRUE
            ORDER BY 
                c.loyalty_points DESC
            LIMIT 10`
        );
        
        // Estructurar respuesta completa
        const result = {
            general_stats: statsRows[0],
            distribution_by_type: distributionRows,
            recent_activity: recentTransactionsRows,
            top_customers: topCustomersRows
        };
        
        res.status(200).json(result);
        
    } catch (error) {
        console.error('Error en getLoyaltyStats:', error);
        res.status(500).json({ 
            message: 'Error interno al obtener estadísticas de fidelización.', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    listCustomers,
    getCustomerDetails,
    getUpcomingBirthdays,
    setSpecialPrices,
    clearSpecialPrices,
    adjustLoyaltyPoints,
    redeemPoints,
    getLoyaltyStats
};