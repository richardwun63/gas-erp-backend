// controllers/orderController.js
const pool = require('../db/db');
const { calculatePoints } = require('../utils/helpers');

// --- CREAR PEDIDO (CLIENTE) ---
const createOrder = async (req, res) => {
    const userId = req.user.id;
    const {
        cylinder_type_id, 
        action_type, 
        cylinder_quantity,
        delivery_address_text,
        delivery_instructions,
        other_items = []
    } = req.body;
    
    console.log(`POST /api/orders por User ID: ${userId}`);
    console.log("Datos recibidos:", req.body);
    
    // Validaciones iniciales
    if (!delivery_address_text) {
        return res.status(400).json({
            status: 'error',
            message: 'La dirección de entrega es obligatoria'
        });
    }
    
    // Verificar que hay al menos un producto (cilindro u otro producto)
    if ((!cylinder_type_id || cylinder_quantity <= 0) && (!other_items || other_items.length === 0)) {
        return res.status(400).json({
            status: 'error',
            message: 'Debe seleccionar al menos un balón u otro producto'
        });
    }
    
    // Validar tipo de acción para cilindros
    if (cylinder_type_id && cylinder_quantity > 0) {
        const validActions = ['exchange', 'new_purchase', 'loan_purchase'];
        if (!action_type || !validActions.includes(action_type)) {
            return res.status(400).json({
                status: 'error',
                message: 'Tipo de acción para balón no válido'
            });
        }
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Obtener almacén más cercano disponible (por defecto el primer almacén activo)
        const [warehousesResult] = await connection.execute(
            `SELECT warehouse_id FROM warehouses WHERE is_active = 1 LIMIT 1`
        );
        
        if (warehousesResult.length === 0) {
            await connection.rollback();
            return res.status(500).json({
                status: 'error',
                message: 'No hay almacenes disponibles para procesar su pedido'
            });
        }
        
        const warehouseId = warehousesResult[0].warehouse_id;
        
        // Cálculo de montos
        let subtotalAmount = 0;
        let discountAmount = 0;
        
        // 1. Crear cabecera del pedido
        const [orderResult] = await connection.execute(
            `INSERT INTO orders (
                customer_user_id, 
                order_date, 
                order_status, 
                warehouse_id, 
                delivery_address_text, 
                delivery_instructions, 
                subtotal_amount, 
                discount_amount, 
                total_amount
            ) VALUES (?, NOW(), 'pending_approval', ?, ?, ?, 0, 0, 0)`,
            [
                userId, 
                warehouseId,
                delivery_address_text, 
                delivery_instructions || null
            ]
        );
        
        const orderId = orderResult.insertId;
        
        if (!orderId) {
            await connection.rollback();
            return res.status(500).json({
                status: 'error',
                message: 'Error al crear el pedido'
            });
        }
        
        // 2. Procesar ítem de cilindro si se especificó
        if (cylinder_type_id && cylinder_quantity > 0) {
            // Obtener precio del tipo de cilindro según acción
            const [cylinderTypeResult] = await connection.execute(
                `SELECT 
                    name, 
                    price_new, 
                    price_exchange, 
                    price_loan 
                FROM cylindertypes 
                WHERE cylinder_type_id = ? AND is_available = 1`,
                [cylinder_type_id]
            );
            
            if (cylinderTypeResult.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    status: 'error',
                    message: 'El tipo de balón seleccionado no está disponible'
                });
            }
            
            const cylinderType = cylinderTypeResult[0];
            
            // Determinar precio según acción
            let unitPrice = 0;
            switch (action_type) {
                case 'new_purchase':
                    unitPrice = parseFloat(cylinderType.price_new);
                    break;
                case 'loan_purchase':
                    unitPrice = parseFloat(cylinderType.price_loan || cylinderType.price_new * 0.6);
                    break;
                case 'exchange':
                default:
                    unitPrice = parseFloat(cylinderType.price_exchange);
                    break;
            }
            
            // Verificar si hay un precio especial para este cliente
            const [specialPriceResult] = await connection.execute(
                `SELECT price_exchange 
                 FROM customerspecificprices 
                 WHERE customer_user_id = ? AND cylinder_type_id = ?`,
                [userId, cylinder_type_id]
            );
            
            if (specialPriceResult.length > 0 && action_type === 'exchange') {
                unitPrice = parseFloat(specialPriceResult[0].price_exchange);
            }
            
            const itemSubtotal = unitPrice * cylinder_quantity;
            subtotalAmount += itemSubtotal;
            
            // Insertar item del cilindro
            await connection.execute(
                `INSERT INTO orderitems (
                    order_id, 
                    item_id, 
                    item_type, 
                    quantity, 
                    action_type, 
                    unit_price, 
                    item_subtotal
                ) VALUES (?, ?, 'cylinder', ?, ?, ?, ?)`,
                [
                    orderId, 
                    cylinder_type_id, 
                    cylinder_quantity, 
                    action_type, 
                    unitPrice, 
                    itemSubtotal
                ]
            );
        }
        
        // 3. Procesar otros productos
        if (Array.isArray(other_items) && other_items.length > 0) {
            for (const item of other_items) {
                // Verificar que el producto existe y está disponible
                const [productResult] = await connection.execute(
                    `SELECT product_id, name, price 
                     FROM otherproducts 
                     WHERE product_id = ? AND is_available = 1`,
                    [item.product_id]
                );
                
                if (productResult.length === 0) {
                    continue; // Ignorar productos no disponibles
                }
                
                const product = productResult[0];
                const quantity = parseInt(item.quantity) || 1;
                const unitPrice = parseFloat(product.price);
                const itemSubtotal = unitPrice * quantity;
                
                subtotalAmount += itemSubtotal;
                
                // Insertar item del producto
                await connection.execute(
                    `INSERT INTO orderitems (
                        order_id, 
                        item_id, 
                        item_type, 
                        quantity, 
                        action_type, 
                        unit_price, 
                        item_subtotal
                    ) VALUES (?, ?, 'other_product', ?, 'sale', ?, ?)`,
                    [
                        orderId, 
                        item.product_id, 
                        quantity, 
                        unitPrice, 
                        itemSubtotal
                    ]
                );
            }
        }
        
        // 4. Calcular puntos a ganar (si existe la función)
        let pointsEarned = 0;
        try {
            if (typeof calculatePoints === 'function') {
                pointsEarned = calculatePoints(subtotalAmount);
            } else {
                // Cálculo básico si la función no está disponible
                pointsEarned = Math.floor(subtotalAmount * 0.2); // 0.2 puntos por sol
            }
        } catch (pointsError) {
            console.error("Error al calcular puntos:", pointsError);
            // Continuar sin agregar puntos si hay error
            pointsEarned = 0;
        }
        
        // 5. Actualizar totales en la cabecera
        const totalAmount = subtotalAmount - discountAmount;
        
        await connection.execute(
            `UPDATE orders SET 
                subtotal_amount = ?, 
                discount_amount = ?, 
                total_amount = ?,
                points_earned = ?
             WHERE order_id = ?`,
            [
                subtotalAmount, 
                discountAmount, 
                totalAmount,
                pointsEarned,
                orderId
            ]
        );
        
        // Confirmar la transacción
        await connection.commit();
        
        console.log(`Pedido ID ${orderId} creado exitosamente por User ID ${userId}`);
        
        // Retornar respuesta con detalles del pedido
        res.status(201).json({
            status: 'success',
            message: 'Pedido creado exitosamente',
            orderId,
            subtotal: subtotalAmount,
            discount: discountAmount,
            total: totalAmount,
            points_earned: pointsEarned
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en createOrder:', error);
        
        res.status(500).json({
            status: 'error',
            message: 'Error interno al procesar su pedido: ' + (error.message || 'Error desconocido'),
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// --- OBTENER HISTORIAL DE PEDIDOS (CLIENTE) ---
const getMyOrderHistory = async (req, res) => {
    const userId = req.user.id; // Obtenido del token JWT en el middleware 'protect'
    const { limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`GET /api/orders/my-history por User ID: ${userId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Consulta para obtener pedidos del cliente con paginación
        const [orders] = await connection.execute(
            `SELECT 
                o.order_id, 
                o.order_date, 
                o.order_status, 
                o.payment_status, 
                o.total_amount,
                o.receipt_url
             FROM orders o
             WHERE o.customer_user_id = ?
             ORDER BY o.order_date DESC
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [userId]
        );
        
        // Obtener cantidad total de pedidos para info de paginación
        const [countResult] = await connection.execute(
            `SELECT COUNT(*) as total FROM orders WHERE customer_user_id = ?`,
            [userId]
        );
        
        const totalOrders = countResult[0].total;
        const totalPages = Math.ceil(totalOrders / parseInt(limit));
        
        console.log(`Historial de pedidos para User ID ${userId}: ${orders.length} pedidos encontrados`);
        
        // Formatear respuesta
        res.status(200).json({
            orders,
            pagination: {
                total: totalOrders,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: totalPages
            }
        });
        
    } catch (error) {
        console.error('Error en getMyOrderHistory:', error);
        res.status(500).json({ 
            message: 'Error al obtener el historial de pedidos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- OBTENER PEDIDOS PENDIENTES (BASE/REPARTIDOR) ---
const getPendingOrders = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status = 'pending_assignment', warehouseId, limit = 10, page = 1 } = req.query;
    console.log(`GET /api/orders/pending por User ID: ${userId} (${userRole}), status: ${status}, warehouseId: ${warehouseId}`);
    
    // Validar parametros
    const validatedLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 50); // Entre 1 y 50
    const validatedPage = Math.max(parseInt(page) || 1, 1); // Mínimo 1
    const offset = (validatedPage - 1) * validatedLimit;
    
    // Se construye la consulta SQL de manera dinámica pero segura
    let queryParams = [];
    let warehouseFilter = '';
    
    // Si se especificó un almacén, filtrar por él
    if (warehouseId && warehouseId !== 'undefined' && parseInt(warehouseId) > 0) {
        warehouseFilter = ` AND o.warehouse_id = ?`;
        queryParams.push(parseInt(warehouseId));
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Construir y ejecutar la consulta base con los filtros aplicados
        let query = `
            SELECT o.order_id, o.order_date, o.order_status, o.total_amount,
                   u.full_name as customer_name, u.phone_number_primary as customer_phone,
                   o.delivery_address_text, o.delivery_instructions,
                   (SELECT GROUP_CONCAT(CONCAT(
                        CASE WHEN oi.item_type = 'cylinder' THEN ct.name ELSE op.name END,
                        ' x ', oi.quantity)
                    SEPARATOR ', ')
                    FROM OrderItems oi
                    LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
                    LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
                    WHERE oi.order_id = o.order_id
                   ) as order_summary
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            WHERE o.order_status = ?${warehouseFilter}
            ORDER BY o.order_date ASC
            LIMIT ${validatedLimit} OFFSET ${offset}
        `;
        
        // Añadir el parametro del estado
        queryParams.unshift(status);
        
        const [pendingOrders] = await connection.execute(query, queryParams);
        
        // Contar total de registros para paginación (reutilizando los mismos filtros)
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM Orders o 
            WHERE o.order_status = ?${warehouseFilter}
        `;
        
        const [countResult] = await connection.execute(countQuery, queryParams);
        const totalOrders = countResult[0].total;
        const totalPages = Math.ceil(totalOrders / validatedLimit);
        
        console.log(`Pedidos pendientes encontrados: ${pendingOrders.length}`);
        
        res.status(200).json({
            orders: pendingOrders,
            pagination: {
                total: totalOrders,
                page: validatedPage,
                limit: validatedLimit,
                total_pages: totalPages
            }
        });
    } catch (error) {
        console.error('Error en getPendingOrders:', error);
        res.status(500).json({ 
            message: 'Error al obtener pedidos pendientes.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- OBTENER DETALLES DE UN PEDIDO ---
const getOrderById = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`GET /api/orders/${orderId} por User ID: ${userId} (${userRole})`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Obtener información básica del pedido
        const [orderRows] = await connection.execute(
            `SELECT o.*, 
                    u.full_name as customer_name,
                    u.phone_number_primary as customer_phone
             FROM Orders o
             JOIN Users u ON o.customer_user_id = u.user_id
             WHERE o.order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        // Verificar permisos de acceso si es cliente
        if (userRole === 'cliente' && order.customer_user_id !== userId) {
            return res.status(403).json({ message: 'No tienes permiso para ver este pedido.' });
        }
        
        // Obtener items del pedido
        const [itemRows] = await connection.execute(
            `SELECT i.*, 
                    CASE WHEN i.item_type = 'cylinder' 
                        THEN (SELECT name FROM CylinderTypes WHERE cylinder_type_id = i.item_id)
                        ELSE (SELECT name FROM OtherProducts WHERE product_id = i.item_id)
                    END as name
             FROM OrderItems i
             WHERE i.order_id = ?`,
            [orderId]
        );
        
        // Obtener información de entrega si existe
        const [deliveryRows] = await connection.execute(
            `SELECT d.*, u.full_name as delivery_person_name
             FROM Deliveries d
             LEFT JOIN Users u ON d.delivery_person_user_id = u.user_id
             WHERE d.order_id = ?`,
            [orderId]
        );
        
        const delivery = deliveryRows.length > 0 ? deliveryRows[0] : null;
        
        // Obtener pagos asociados
        const [paymentRows] = await connection.execute(
            `SELECT payment_id, payment_date, amount, payment_method, status
             FROM Payments
             WHERE order_id = ?
             ORDER BY payment_date DESC`,
            [orderId]
        );
        
        // Combinar toda la información
        const orderDetails = {
            ...order,
            items: itemRows,
            delivery,
            payments: paymentRows
        };
        
        res.status(200).json(orderDetails);
    } catch (error) {
        console.error('Error en getOrderById:', error);
        res.status(500).json({ 
            message: 'Error al obtener detalles del pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- OBTENER PEDIDOS ACTIVOS (BASE/GERENTE) ---
const getActiveOrders = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { warehouseId, limit = 20, page = 1 } = req.query;
    console.log(`GET /api/orders/active por User ID: ${userId} (${userRole})`);
    
    const activeStatuses = ['pending_assignment', 'assigned', 'delivering'];
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let queryParams = [];
    let warehouseFilter = '';
    
    // Si se especificó un almacén, filtrar por él
    if (warehouseId && warehouseId !== 'undefined' && parseInt(warehouseId) > 0) {
        warehouseFilter = ' AND o.warehouse_id = ?';
        queryParams.push(parseInt(warehouseId));
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Crear consulta con los filtros necesarios
        const query = `
            SELECT o.order_id, o.order_date, o.order_status, o.payment_status, o.total_amount,
                   c.full_name as customer_name, c.phone_number_primary as customer_phone,
                   d.delivery_person_user_id, u.full_name as delivery_person_name,
                   (SELECT GROUP_CONCAT(CONCAT(
                        CASE WHEN oi.item_type = 'cylinder' THEN ct.name ELSE op.name END,
                        ' x ', oi.quantity)
                    SEPARATOR ', ')
                    FROM OrderItems oi
                    LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
                    LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
                    WHERE oi.order_id = o.order_id
                   ) as order_summary
            FROM Orders o
            JOIN Users c ON o.customer_user_id = c.user_id
            LEFT JOIN Deliveries d ON o.order_id = d.order_id
            LEFT JOIN Users u ON d.delivery_person_user_id = u.user_id
            WHERE o.order_status IN (?, ?, ?)${warehouseFilter}
            ORDER BY o.order_date DESC
            LIMIT ${parseInt(limit)} OFFSET ${offset}
        `;
        
        // Añadir los estados activos como parámetros
        queryParams.unshift(...activeStatuses);
        
        const [activeOrders] = await connection.execute(query, queryParams);
        
        // Contar total para paginación
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM Orders o 
            WHERE o.order_status IN (?, ?, ?)${warehouseFilter}
        `;
        
        const [countResult] = await connection.execute(countQuery, queryParams);
        const totalOrders = countResult[0].total;
        const totalPages = Math.ceil(totalOrders / parseInt(limit));
        
        console.log(`Pedidos activos encontrados: ${activeOrders.length}`);
        
        res.status(200).json({
            orders: activeOrders,
            pagination: {
                total: totalOrders,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: totalPages
            }
        });
    } catch (error) {
        console.error('Error en getActiveOrders:', error);
        res.status(500).json({ 
            message: 'Error al obtener pedidos activos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- ASIGNAR PEDIDO A REPARTIDOR (BASE) ---
const assignOrder = async (req, res) => {
    const orderId = req.params.id;
    const { deliveryPersonUserId } = req.body;
    const assignedBy = req.user.id;
    
    console.log(`PUT /api/orders/${orderId}/assign por User ID: ${assignedBy}`);
    
    if (!deliveryPersonUserId) {
        return res.status(400).json({ message: 'Se requiere ID del repartidor.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y está pendiente de asignación
        const [orderRows] = await connection.execute(
            `SELECT order_id, order_status, warehouse_id 
             FROM Orders 
             WHERE order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        if (order.order_status !== 'pending_assignment' && order.order_status !== 'pending_approval') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede asignar el pedido porque su estado actual es '${order.order_status}'.` 
            });
        }
        
        // Verificar que el repartidor existe y está activo
        const [repartidorRows] = await connection.execute(
            `SELECT u.user_id, r.role_name 
             FROM Users u
             JOIN Roles r ON u.role_id = r.role_id
             WHERE u.user_id = ? AND u.is_active = 1`,
            [deliveryPersonUserId]
        );
        
        if (repartidorRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Repartidor ID ${deliveryPersonUserId} no encontrado o inactivo.` });
        }
        
        if (repartidorRows[0].role_name !== 'repartidor') {
            await connection.rollback();
            return res.status(400).json({ message: 'El usuario seleccionado no es un repartidor.' });
        }
        
        // Actualizar el estado del pedido si es necesario
        if (order.order_status === 'pending_approval') {
            await connection.execute(
                `UPDATE Orders 
                SET order_status = 'pending_assignment', updated_at = CURRENT_TIMESTAMP 
                WHERE order_id = ?`,
                [orderId]
            );
        }
        
        // Crear o actualizar registro de entrega
        const [deliveryRows] = await connection.execute(
            `SELECT delivery_id FROM Deliveries WHERE order_id = ?`,
            [orderId]
        );
        
        if (deliveryRows.length > 0) {
            // Actualizar entrega existente
            await connection.execute(
                `UPDATE Deliveries 
                 SET delivery_person_user_id = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                 WHERE order_id = ?`,
                [deliveryPersonUserId, orderId]
            );
        } else {
            // Crear nueva entrega
            await connection.execute(
                `INSERT INTO Deliveries (order_id, delivery_person_user_id, assigned_at) 
                 VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [orderId, deliveryPersonUserId]
            );
        }
        
        // Actualizar estado del pedido
        await connection.execute(
            `UPDATE Orders 
             SET order_status = 'assigned', updated_at = CURRENT_TIMESTAMP 
             WHERE order_id = ?`,
            [orderId]
        );
        
        await connection.commit();
        
        console.log(`Pedido ${orderId} asignado al repartidor ${deliveryPersonUserId} por ${assignedBy}`);
        
        res.status(200).json({
            message: 'Pedido asignado correctamente.',
            order_id: parseInt(orderId),
            delivery_person_id: parseInt(deliveryPersonUserId)
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en assignOrder:', error);
        res.status(500).json({ 
            message: 'Error al asignar el pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- TOMAR PEDIDO (REPARTIDOR) ---
const takeOrder = async (req, res) => {
    const orderId = req.params.id;
    const repartidorId = req.user.id;
    
    console.log(`PUT /api/orders/${orderId}/take por Repartidor ID: ${repartidorId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y está pendiente de asignación
        const [orderRows] = await connection.execute(
            `SELECT order_id, order_status, warehouse_id 
             FROM Orders 
             WHERE order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        if (order.order_status !== 'pending_assignment') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede tomar este pedido porque su estado actual es '${order.order_status}'.` 
            });
        }
        
        // Verificar que el usuario es un repartidor activo
        const [userCheck] = await connection.execute(
            `SELECT u.*, r.role_name 
             FROM Users u 
             JOIN Roles r ON u.role_id = r.role_id
             WHERE u.user_id = ? AND u.is_active = 1`,
            [repartidorId]
        );
        
        if (userCheck.length === 0 || userCheck[0].role_name !== 'repartidor') {
            await connection.rollback();
            return res.status(403).json({ message: 'No tienes permisos para tomar pedidos como repartidor.' });
        }
        
        // Verificar que el repartidor no tiene ya otro pedido asignado
        const [activeAssignment] = await connection.execute(
            `SELECT d.order_id 
             FROM Deliveries d 
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.delivery_person_user_id = ? 
             AND o.order_status IN ('assigned', 'delivering')
             LIMIT 1`,
            [repartidorId]
        );
        
        if (activeAssignment.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: 'No puedes tomar este pedido porque ya tienes un pedido activo asignado.' 
            });
        }
        
        // Crear registro de entrega
        await connection.execute(
            `INSERT INTO Deliveries (order_id, delivery_person_user_id, assigned_at) 
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE 
                delivery_person_user_id = VALUES(delivery_person_user_id),
                assigned_at = VALUES(assigned_at)`,
            [orderId, repartidorId]
        );
        
        // Actualizar estado del pedido
        await connection.execute(
            `UPDATE Orders 
             SET order_status = 'assigned', updated_at = CURRENT_TIMESTAMP 
             WHERE order_id = ?`,
            [orderId]
        );
        
        await connection.commit();
        
        console.log(`Pedido ${orderId} tomado por repartidor ${repartidorId}`);
        
        res.status(200).json({
            message: 'Pedido tomado correctamente.',
            order_id: parseInt(orderId)
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en takeOrder:', error);
        res.status(500).json({ 
            message: 'Error al tomar el pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

// --- CANCELAR PEDIDO (CLIENTE, BASE, GERENTE) ---
const cancelOrder = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { cancel_reason } = req.body;
    
    console.log(`PUT /api/orders/${orderId}/cancel por User ID: ${userId} (${userRole})`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe
        const [orderRows] = await connection.execute(
            `SELECT order_id, customer_user_id, order_status 
             FROM Orders 
             WHERE order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        // Verificar permisos si es cliente
        if (userRole === 'cliente' && order.customer_user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ message: 'No tienes permiso para cancelar este pedido.' });
        }
        
        // Verificar que el pedido está en un estado que permite cancelación
        const cancelableStates = ['pending_approval', 'pending_assignment', 'assigned'];
        if (!cancelableStates.includes(order.order_status)) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede cancelar el pedido porque su estado actual es '${order.order_status}'.` 
            });
        }
        
        // Actualizar el estado del pedido
        await connection.execute(
            `UPDATE Orders 
             SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
             WHERE order_id = ?`,
            [orderId]
        );
        
        // Registrar motivo de cancelación si se proporcionó
        if (cancel_reason) {
            // Asumiendo que existe una tabla o campo para registrar esto
            // En este caso, lo añadimos como nota en el pedido
            await connection.execute(
                `UPDATE Orders 
                 SET notes = CONCAT(IFNULL(notes, ''), ' [Cancelado: ', ?, ']')
                 WHERE order_id = ?`,
                [cancel_reason, orderId]
            );
        }
        
        await connection.commit();
        
        console.log(`Pedido ${orderId} cancelado por ${userId}`);
        
        res.status(200).json({
            message: 'Pedido cancelado correctamente.',
            order_id: parseInt(orderId)
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en cancelOrder:', error);
        res.status(500).json({ 
            message: 'Error al cancelar el pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtener detalles de entrega de un pedido
 * GET /api/orders/:id/delivery
 */
const getOrderDeliveryDetails = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`GET /api/orders/${orderId}/delivery por User ID: ${userId} (${userRole})`);
    
    try {
        // Consultar detalles de entrega
        const [deliveryRows] = await pool.execute(
            `SELECT 
                d.*,
                u.full_name as delivery_person_name,
                u.phone_number_primary as delivery_person_phone,
                o.order_status,
                o.payment_status,
                o.total_amount,
                o.customer_user_id
            FROM Deliveries d
            LEFT JOIN Users u ON d.delivery_person_user_id = u.user_id
            JOIN Orders o ON d.order_id = o.order_id
            WHERE d.order_id = ?`,
            [orderId]
        );
        
        if (deliveryRows.length === 0) {
            return res.status(404).json({ 
                message: `No se encontró información de entrega para el pedido #${orderId}.` 
            });
        }
        
        const delivery = deliveryRows[0];
        
        // Verificar permisos de acceso según el rol
        if (userRole === 'cliente' && delivery.customer_user_id !== userId) {
            return res.status(403).json({ 
                message: 'No tienes permiso para ver detalles de esta entrega.' 
            });
        }
        
        if (userRole === 'repartidor' && delivery.delivery_person_user_id !== userId) {
            return res.status(403).json({ 
                message: 'Esta entrega no está asignada a ti.' 
            });
        }
        
        // Formatear tiempos para respuesta
        const formatDateTime = (dateTime) => {
            if (!dateTime) return null;
            return new Date(dateTime).toISOString().replace('T', ' ').substring(0, 19);
        };
        
        const response = {
            order_id: delivery.order_id,
            delivery_id: delivery.delivery_id,
            delivery_person: {
                id: delivery.delivery_person_user_id,
                name: delivery.delivery_person_name || 'No asignado',
                phone: delivery.delivery_person_phone
            },
            timeline: {
                assigned_at: formatDateTime(delivery.assigned_at),
                departed_at: formatDateTime(delivery.departed_at),
                completed_at: formatDateTime(delivery.completed_at)
            },
            status: {
                order_status: delivery.order_status,
                payment_status: delivery.payment_status,
                has_issue: delivery.has_issue ? true : false
            },
            payment: {
                total_amount: parseFloat(delivery.total_amount).toFixed(2),
                amount_collected: delivery.amount_collected ? parseFloat(delivery.amount_collected).toFixed(2) : null,
                collection_method: delivery.collection_method || 'pendiente',
                scheduled_collection_time: delivery.scheduled_collection_time || null
            },
            notes: delivery.delivery_notes || '',
            issue_notes: delivery.issue_notes || ''
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('Error en getOrderDeliveryDetails:', error);
        res.status(500).json({ 
            message: 'Error al obtener detalles de entrega.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener pedidos pendientes de aprobación
 * GET /api/orders/pending-approval
 */
const getPendingApprovalOrders = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`GET /api/orders/pending-approval por User ID: ${userId} (${userRole})`);
    
    try {
        const [orders] = await pool.execute(
            `SELECT o.order_id, o.order_date, o.total_amount,
                   u.full_name as customer_name, u.phone_number_primary as customer_phone,
                   o.delivery_address_text, o.delivery_instructions,
                   (SELECT GROUP_CONCAT(CONCAT(
                        CASE WHEN oi.item_type = 'cylinder' THEN ct.name ELSE op.name END,
                        ' x ', oi.quantity)
                    SEPARATOR ', ')
                    FROM OrderItems oi
                    LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
                    LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
                    WHERE oi.order_id = o.order_id
                   ) as order_summary
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            WHERE o.order_status = 'pending_approval'
            ORDER BY o.order_date ASC
            LIMIT ${parseInt(limit)} OFFSET ${offset}`,
            []
        );
        
        // Obtener el recuento total para información de paginación
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM Orders WHERE order_status = 'pending_approval'`
        );
        
        const totalOrders = countRows[0].total;
        const totalPages = Math.ceil(totalOrders / parseInt(limit));
        
        console.log(`Pedidos pendientes de aprobación: ${orders.length} encontrados.`);
        
        res.status(200).json({
            orders,
            pagination: {
                total: totalOrders,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: totalPages
            }
        });
        
    } catch (error) {
        console.error('Error en getPendingApprovalOrders:', error);
        res.status(500).json({ 
            message: 'Error al obtener pedidos pendientes de aprobación.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Aprobar múltiples pedidos a la vez
 * POST /api/orders/bulk-approve
 */
const bulkApproveOrders = async (req, res) => {
    const { order_ids } = req.body;
    const userId = req.user.id;
    
    console.log(`POST /api/orders/bulk-approve por User ID: ${userId}`);
    
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.status(400).json({
            message: 'Se requiere un array de IDs de pedidos.'
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Actualizar estado de los pedidos
        const [result] = await connection.execute(
            `UPDATE Orders 
             SET order_status = 'pending_assignment', 
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id IN (?) 
                 AND order_status = 'pending_approval'`,
            [order_ids]
        );
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: 'No se encontraron pedidos pendientes para aprobar con los IDs proporcionados.'
            });
        }
        
        // Registrar en un log de actividad (opcional)
        // Esta parte sería implementada si existe una tabla de logs
        
        await connection.commit();
        
        console.log(`${result.affectedRows} pedidos aprobados por User ID ${userId}.`);
        
        res.status(200).json({
            message: 'Pedidos aprobados exitosamente.',
            approved_count: result.affectedRows,
            order_ids: order_ids
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en bulkApproveOrders:', error);
        res.status(500).json({ 
            message: 'Error al aprobar pedidos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

module.exports = {
    createOrder,
    getMyOrderHistory,
    getPendingOrders,
    assignOrder,
    takeOrder,
    getOrderById,
    cancelOrder,
    getActiveOrders,
    getOrderDeliveryDetails,
    getPendingApprovalOrders,
    bulkApproveOrders
};