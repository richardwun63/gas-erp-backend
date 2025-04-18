// controllers/orderController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');
const { calculatePoints } = require('../utils/helpers');

// --- CREAR PEDIDO (CLIENTE) ---
const createOrder = async (req, res) => {
    const customerUserId = req.user.id; // Obtenido del token JWT
    const {
        cylinder_type_id,          // ID del tipo de balón
        action_type,               // 'exchange', 'new_purchase', 'loan_purchase'
        cylinder_quantity,         // Cantidad de balones
        delivery_address_text,     // Dirección de entrega (texto)
        delivery_latitude,         // Latitud (opcional)
        delivery_longitude,        // Longitud (opcional)
        delivery_instructions,     // Instrucciones especiales (opcional)
        other_items,               // Array de { product_id, quantity } (opcional)
        voucher_code,              // Código de descuento (opcional)
        redeem_points              // Usar puntos acumulados (opcional)
    } = req.body;

    console.log(`POST /api/orders por User ID: ${customerUserId}`);
    console.log("Datos recibidos:", req.body);

    // Validación básica
    if (!delivery_address_text) {
        return res.status(400).json({ message: 'La dirección de entrega es obligatoria.' });
    }

    // Debe tener al menos balones o productos adicionales
    if ((!cylinder_type_id || !cylinder_quantity || cylinder_quantity <= 0) && 
        (!other_items || !Array.isArray(other_items) || other_items.length === 0)) {
        return res.status(400).json({ 
            message: 'El pedido debe incluir al menos un balón de gas o producto adicional.' 
        });
    }

    // Configuración por defecto (asignación a almacén)
    // En un sistema de producción, usar geolocalización o criterios para elegir el mejor almacén
    let defaultWarehouseId = 1; // Por defecto almacén principal

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Obtener los datos del cliente (para precios especiales, puntos, etc.)
        const [customerRows] = await connection.execute(
            `SELECT c.*, u.full_name FROM Customers c 
             JOIN Users u ON c.user_id = u.user_id 
             WHERE c.user_id = ?`, 
            [customerUserId]
        );

        if (customerRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }

        const customer = customerRows[0];
        let subtotalAmount = 0;
        let discountAmount = 0;
        let totalAmount = 0;
        const orderItems = [];

        // 2. Procesar balón principal (si se solicitó)
        if (cylinder_type_id && cylinder_quantity > 0) {
            // Validación: el tipo de balón existe y está disponible
            const [cylinderTypeRows] = await connection.execute(
                `SELECT ct.*, 
                (SELECT price_exchange FROM CustomerSpecificPrices 
                 WHERE customer_user_id = ? AND cylinder_type_id = ct.cylinder_type_id) as special_price
                FROM CylinderTypes ct 
                WHERE ct.cylinder_type_id = ? AND ct.is_available = TRUE`,
                [customerUserId, cylinder_type_id]
            );

            if (cylinderTypeRows.length === 0) {
                await connection.rollback();
                return res.status(400).json({ 
                    message: `El tipo de balón solicitado (ID: ${cylinder_type_id}) no existe o no está disponible.` 
                });
            }

            const cylinderType = cylinderTypeRows[0];

            // Determinar precio según acción y si tiene precio especial
            let unitPrice;
            switch(action_type) {
                case 'new_purchase':
                    unitPrice = cylinderType.price_new;
                    break;
                case 'loan_purchase':
                    unitPrice = cylinderType.price_loan || cylinderType.price_new; // Fallback si no hay precio de préstamo
                    break;
                case 'exchange':
                default:
                    // Usar precio especial si existe, si no el precio estándar
                    unitPrice = cylinderType.special_price || cylinderType.price_exchange;
            }

            // 3. Verificar disponibilidad de stock
            if (action_type === 'exchange' || action_type === 'new_purchase' || action_type === 'loan_purchase') {
                // Para intercambio o nuevos, necesitamos balones llenos
                const [stockResult] = await connection.execute(
                    `SELECT SUM(quantity) as available_stock FROM InventoryStock 
                     WHERE warehouse_id = ? AND item_id = ? AND item_type = 'cylinder' AND status = 'full'`,
                    [defaultWarehouseId, cylinder_type_id]
                );

                const availableStock = stockResult[0]?.available_stock || 0;
                
                if (availableStock < cylinder_quantity) {
                    await connection.rollback();
                    return res.status(400).json({ 
                        message: `Stock insuficiente. Disponible: ${availableStock}, Solicitado: ${cylinder_quantity}` 
                    });
                }
            }

            // Añadir a subtotal
            const itemSubtotal = unitPrice * cylinder_quantity;
            subtotalAmount += itemSubtotal;

            // Guardar para insertar en OrderItems luego
            orderItems.push({
                type: 'cylinder',
                id: cylinder_type_id,
                quantity: cylinder_quantity,
                action_type: action_type || 'exchange', // Default a 'exchange'
                unit_price: unitPrice,
                subtotal: itemSubtotal
            });
        }

        // 4. Procesar productos adicionales
        if (other_items && Array.isArray(other_items) && other_items.length > 0) {
            for (const item of other_items) {
                if (!item.product_id || !item.quantity || item.quantity <= 0) continue;

                // Validación: el producto existe y está disponible
                const [productRows] = await connection.execute(
                    `SELECT * FROM OtherProducts WHERE product_id = ? AND is_available = TRUE`,
                    [item.product_id]
                );

                if (productRows.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({ 
                        message: `El producto solicitado (ID: ${item.product_id}) no existe o no está disponible.` 
                    });
                }

                const product = productRows[0];
                
                // 5. Verificar disponibilidad de stock para producto
                const [stockResult] = await connection.execute(
                    `SELECT SUM(quantity) as available_stock FROM InventoryStock 
                     WHERE warehouse_id = ? AND item_id = ? AND item_type = 'other_product' AND status = 'available'`,
                    [defaultWarehouseId, item.product_id]
                );

                const availableStock = stockResult[0]?.available_stock || 0;
                
                if (availableStock < item.quantity) {
                    await connection.rollback();
                    return res.status(400).json({ 
                        message: `Stock insuficiente del producto "${product.name}". Disponible: ${availableStock}, Solicitado: ${item.quantity}` 
                    });
                }

                // Añadir a subtotal
                const itemSubtotal = product.price * item.quantity;
                subtotalAmount += itemSubtotal;

                // Guardar para insertar en OrderItems luego
                orderItems.push({
                    type: 'other_product',
                    id: item.product_id,
                    quantity: item.quantity,
                    action_type: 'sale', // Siempre 'sale' para otros productos
                    unit_price: product.price,
                    subtotal: itemSubtotal
                });
            }
        }

        // 6. Aplicar descuentos si hay (voucher o puntos canjeados)
        const pointsRedeemed = parseInt(redeem_points) || 0;
        
        if (pointsRedeemed > 0) {
            // Validar si tiene suficientes puntos
            if (pointsRedeemed > customer.loyalty_points) {
                await connection.rollback();
                return res.status(400).json({ 
                    message: `Puntos insuficientes. Disponible: ${customer.loyalty_points}, Solicitado: ${pointsRedeemed}` 
                });
            }

            // Obtener valor por punto
            const [configRows] = await connection.execute(
                `SELECT config_value FROM Configuration WHERE config_key = 'points_discount_value'`
            );
            
            const pointsDiscountValue = parseFloat(configRows[0]?.config_value) || 0.1; // Valor por defecto 0.1 sol por punto
            const pointsDiscount = pointsRedeemed * pointsDiscountValue;
            
            // No permitir que el descuento sea mayor que el subtotal
            discountAmount += Math.min(pointsDiscount, subtotalAmount);
        }

        // Aplicar voucher (si se implementa en el futuro)
        if (voucher_code) {
            // Lógica para aplicar voucher iría aquí
            // Por ahora lo ignoramos
        }

        totalAmount = Math.max(0, subtotalAmount - discountAmount);
        totalAmount = parseFloat(totalAmount.toFixed(2)); // Redondear a 2 decimales

        // 7. Calcular puntos a ganar por este pedido
        const [pointsConfigRows] = await connection.execute(
            `SELECT config_value FROM Configuration WHERE config_key = 'points_per_sol'`
        );
        
        const pointsPerSol = parseFloat(pointsConfigRows[0]?.config_value || '0');
        const pointsEarned = calculatePoints(totalAmount, pointsPerSol);

        // 8. Crear el pedido en la base de datos
        const [orderResult] = await connection.execute(
            `INSERT INTO Orders (
                customer_user_id, warehouse_id, delivery_address_text, 
                delivery_latitude, delivery_longitude, delivery_instructions,
                subtotal_amount, discount_amount, total_amount, 
                payment_status, points_earned, points_redeemed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerUserId, defaultWarehouseId, delivery_address_text,
                delivery_latitude || null, delivery_longitude || null, delivery_instructions || null,
                subtotalAmount, discountAmount, totalAmount,
                'pending', pointsEarned, pointsRedeemed
            ]
        );

        const orderId = orderResult.insertId;
        
        // 9. Crear items del pedido
        for (const item of orderItems) {
            await connection.execute(
                `INSERT INTO OrderItems (
                    order_id, item_id, item_type, quantity, 
                    action_type, unit_price, item_subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderId, item.id, item.type, item.quantity,
                    item.action_type, item.unit_price, item.subtotal
                ]
            );

            // 10. Actualizar el inventario (reducir stock)
            if (item.type === 'cylinder' && item.action_type !== 'exchange') {
                // Para compras nuevas o préstamos, solo reducimos balones llenos
                await connection.execute(
                    `UPDATE InventoryStock 
                     SET quantity = quantity - ? 
                     WHERE warehouse_id = ? AND item_id = ? AND item_type = 'cylinder' AND status = 'full'`,
                    [item.quantity, defaultWarehouseId, item.id]
                );
                
                // Registrar movimiento en InventoryLog
                await connection.execute(
                    `INSERT INTO InventoryLog (
                        warehouse_id, item_id, item_type, status_changed_from, 
                        status_changed_to, quantity_change, transaction_type, 
                        related_order_id, user_id, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        defaultWarehouseId, item.id, 'cylinder', 'full', 
                        'sold', -item.quantity, 'sale', 
                        orderId, customerUserId, `Venta orden #${orderId}`
                    ]
                );
            } else if (item.type === 'other_product') {
                // Reducir stock de productos adicionales
                await connection.execute(
                    `UPDATE InventoryStock 
                     SET quantity = quantity - ? 
                     WHERE warehouse_id = ? AND item_id = ? AND item_type = 'other_product' AND status = 'available'`,
                    [item.quantity, defaultWarehouseId, item.id]
                );
                
                // Registrar movimiento en InventoryLog
                await connection.execute(
                    `INSERT INTO InventoryLog (
                        warehouse_id, item_id, item_type, status_changed_from, 
                        status_changed_to, quantity_change, transaction_type, 
                        related_order_id, user_id, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        defaultWarehouseId, item.id, 'other_product', 'available', 
                        'sold', -item.quantity, 'sale', 
                        orderId, customerUserId, `Venta orden #${orderId}`
                    ]
                );
            }
        }

        // 11. Si se canjearon puntos, actualizar saldo de puntos del cliente y registrar transacción
        if (pointsRedeemed > 0) {
            await connection.execute(
                `UPDATE Customers SET loyalty_points = loyalty_points - ? WHERE user_id = ?`,
                [pointsRedeemed, customerUserId]
            );
            
            await connection.execute(
                `INSERT INTO LoyaltyTransactions (
                    customer_user_id, points_change, reason, related_order_id, notes
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    customerUserId, -pointsRedeemed, 'redemption_spend', orderId,
                    `Puntos canjeados en orden #${orderId}`
                ]
            );
        }

        // 12. Si se ganaron puntos, registrar transacción de puntos (pero aún no añadirlos al saldo)
        // Los puntos se acreditarán cuando se complete la entrega y el pago
        if (pointsEarned > 0) {
            await connection.execute(
                `INSERT INTO LoyaltyTransactions (
                    customer_user_id, points_change, reason, related_order_id, notes
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    customerUserId, pointsEarned, 'purchase_earn', orderId,
                    `Puntos ganados en orden #${orderId} (pendientes de confirmación)`
                ]
            );
        }

        // 13. Todo correcto, confirmar la transacción
        await connection.commit();
        
        console.log(`Pedido #${orderId} creado exitosamente por cliente ${customerUserId}.`);
        res.status(201).json({ 
            message: 'Pedido creado exitosamente.', 
            orderId: orderId,
            total: totalAmount,
            pointsEarned: pointsEarned,
            pointsRedeemed: pointsRedeemed
        });

    } catch (error) {
        // Deshacer cambios en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en createOrder:', error);
        
        // Respuestas de error estructuradas según el tipo
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                message: 'Uno de los productos o balones referenciados no existe.' 
            });
        } else if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                message: 'Error de duplicidad en la base de datos.' 
            });
        }
        
        res.status(500).json({ 
            message: 'Error interno al crear el pedido. Por favor, inténtelo de nuevo.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};

// --- OBTENER HISTORIAL DE PEDIDOS (CLIENTE) ---
const getMyOrderHistory = async (req, res) => {
    const customerUserId = req.user.id;
    const { limit = 20, page = 1, status } = req.query; // Paginación y filtro opcionales
    const offset = (page - 1) * limit;
    
    console.log(`GET /api/orders/my-history por User ID: ${customerUserId}`);
    
    try {
        let query = `
            SELECT o.order_id, o.order_date, o.order_status, o.payment_status, o.total_amount,
                   o.points_earned, o.points_redeemed, o.receipt_url
            FROM Orders o
            WHERE o.customer_user_id = ?`;
        
        const params = [customerUserId];
        
        // Filtrar por estado si se especifica
        if (status && status !== 'all') {
            query += ` AND o.order_status = ?`;
            params.push(status);
        }
        
        // Ordenar por fecha descendente y aplicar paginación
        query += ` ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [orders] = await pool.execute(query, params);
        
        // Opcionalmente obtener el total para info de paginación
        /*
        const [totalRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM Orders WHERE customer_user_id = ?` +
            (status && status !== 'all' ? ` AND order_status = ?` : ``),
            status && status !== 'all' ? [customerUserId, status] : [customerUserId]
        );
        const totalOrders = totalRows[0].total;
        */
        
        console.log(`Historial cliente ${customerUserId}: ${orders.length} pedidos encontrados.`);
        res.status(200).json(orders);
        
    } catch (error) {
        console.error('Error en getMyOrderHistory:', error);
        res.status(500).json({ 
            message: 'Error al obtener el historial de pedidos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- OBTENER DETALLES DE UN PEDIDO ---
const getOrderById = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`GET /api/orders/${orderId} por User ID: ${userId} (${userRole})`);
    
    try {
        // Construir consulta base para obtener el pedido
        const query = `
            SELECT o.*, 
                   u.full_name as customer_name, u.phone_number_primary as customer_phone,
                   c.address_text as customer_default_address,
                   dr.user_id as delivery_person_id, dr.full_name as delivery_person_name
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            LEFT JOIN Customers c ON u.user_id = c.user_id
            LEFT JOIN Deliveries d ON o.order_id = d.order_id
            LEFT JOIN Users dr ON d.delivery_person_user_id = dr.user_id
            WHERE o.order_id = ?`;
        
        const [orderRows] = await pool.execute(query, [orderId]);
        
        if (orderRows.length === 0) {
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        // Verificar acceso: sólo el cliente propietario, base, contabilidad o gerente pueden ver cualquier pedido
        if (userRole === 'cliente' && order.customer_user_id !== userId) {
            return res.status(403).json({ message: 'No tienes permiso para ver este pedido.' });
        } else if (userRole === 'repartidor' && order.delivery_person_id !== userId) {
            // El repartidor sólo puede ver sus pedidos asignados
            return res.status(403).json({ message: 'Este pedido no está asignado a ti.' });
        }
        
        // Obtener los items del pedido
        const [itemRows] = await pool.execute(
            `SELECT oi.*, 
                    CASE 
                        WHEN oi.item_type = 'cylinder' THEN ct.name
                        WHEN oi.item_type = 'other_product' THEN op.name
                        ELSE 'Desconocido'
                    END as item_name
             FROM OrderItems oi
             LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
             LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        
        // Obtener historial de pagos si existen
        const [paymentRows] = await pool.execute(
            `SELECT p.*, u.full_name as verified_by_name
             FROM Payments p
             LEFT JOIN Users u ON p.verified_by_user_id = u.user_id
             WHERE p.order_id = ?
             ORDER BY p.payment_date DESC`,
            [orderId]
        );
        
        // Obtener datos de entrega si existe
        const [deliveryRows] = await pool.execute(
            `SELECT * FROM Deliveries WHERE order_id = ?`,
            [orderId]
        );
        
        // Construir respuesta completa con toda la información
        const response = {
            ...order,
            items: itemRows,
            payments: paymentRows,
            delivery: deliveryRows.length > 0 ? deliveryRows[0] : null
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('Error en getOrderById:', error);
        res.status(500).json({ 
            message: 'Error al obtener detalles del pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- OBTENER PEDIDOS PENDIENTES (BASE/REPARTIDOR) ---
const getPendingOrders = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status, warehouseId, limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    console.log(`GET /api/orders/pending por User ID: ${userId} (${userRole})`);
    
    try {
        let query = `
            SELECT o.order_id, o.order_date, o.order_status, o.total_amount,
                   u.full_name as customer_name, u.phone_number_primary as customer_phone,
                   o.delivery_address_text, o.delivery_latitude, o.delivery_longitude,
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
            WHERE 1=1`;
        
        const params = [];
        
        // Filtrar por estado si se especifica
        if (status && status !== 'all') {
            query += ` AND o.order_status = ?`;
            params.push(status);
        } else {
            // Por defecto, mostrar pedidos en estados iniciales (pendientes)
            query += ` AND o.order_status IN ('pending_approval', 'pending_assignment')`;
        }
        
        // Filtrar por almacén si se especifica
        if (warehouseId) {
            query += ` AND o.warehouse_id = ?`;
            params.push(warehouseId);
        }
        
        // Ordenar y paginar
        query += ` ORDER BY o.order_date ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [orders] = await pool.execute(query, params);
        
        console.log(`Pedidos pendientes: ${orders.length} encontrados.`);
        res.status(200).json(orders);
        
    } catch (error) {
        console.error('Error en getPendingOrders:', error);
        res.status(500).json({ 
            message: 'Error al obtener pedidos pendientes.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- OBTENER PEDIDOS ACTIVOS (BASE/GERENTE) ---
const getActiveOrders = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { warehouseId, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    console.log(`GET /api/orders/active por User ID: ${userId} (${userRole})`);
    
    try {
        let query = `
            SELECT o.order_id, o.order_date, o.order_status, o.payment_status, o.total_amount,
                   u.full_name as customer_name, 
                   dr.full_name as delivery_person_name,
                   d.assigned_at, d.departed_at, d.completed_at
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            LEFT JOIN Deliveries d ON o.order_id = d.order_id
            LEFT JOIN Users dr ON d.delivery_person_user_id = dr.user_id
            WHERE o.order_status IN ('pending_assignment', 'assigned', 'delivering')`;
        
        const params = [];
        
        // Filtrar por almacén si se especifica
        if (warehouseId) {
            query += ` AND o.warehouse_id = ?`;
            params.push(warehouseId);
        }
        
        // Ordenar y paginar (pedidos más antiguos primero)
        query += ` ORDER BY o.order_date ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [orders] = await pool.execute(query, params);
        
        console.log(`Pedidos activos: ${orders.length} encontrados.`);
        res.status(200).json(orders);
        
    } catch (error) {
        console.error('Error en getActiveOrders:', error);
        res.status(500).json({ 
            message: 'Error al obtener pedidos activos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// --- ASIGNAR PEDIDO A REPARTIDOR (BASE) ---
const assignOrder = async (req, res) => {
    const orderId = req.params.id;
    const { deliveryPersonUserId } = req.body;
    const assignerUserId = req.user.id;
    
    console.log(`PUT /api/orders/${orderId}/assign por User ID: ${assignerUserId}`);
    
    if (!deliveryPersonUserId) {
        return res.status(400).json({ message: 'Se requiere ID del repartidor.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // 1. Verificar que el pedido existe y está en estado pendiente_asignación
        const [orderRows] = await connection.execute(
            `SELECT * FROM Orders WHERE order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        if (order.order_status !== 'pending_approval' && order.order_status !== 'pending_assignment') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El pedido #${orderId} no está en estado pendiente de asignación (estado actual: ${order.order_status}).` 
            });
        }
        
        // 2. Verificar que el repartidor existe y está activo
        const [repartidorRows] = await connection.execute(
            `SELECT u.*, r.role_name FROM Users u 
             JOIN Roles r ON u.role_id = r.role_id
             WHERE u.user_id = ? AND u.is_active = TRUE`,
            [deliveryPersonUserId]
        );
        
        if (repartidorRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Repartidor ID ${deliveryPersonUserId} no encontrado o inactivo.` });
        }
        
        if (repartidorRows[0].role_name !== 'repartidor') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El usuario ID ${deliveryPersonUserId} no es un repartidor (rol actual: ${repartidorRows[0].role_name}).` 
            });
        }
        
        // 3. Verificar si el repartidor está dentro de su horario (si tiene configurado)
        const repartidor = repartidorRows[0];
        if (repartidor.schedule_start && repartidor.schedule_end) {
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes(); // Tiempo en minutos
            
            const scheduleStart = repartidor.schedule_start.split(':');
            const scheduleEnd = repartidor.schedule_end.split(':');
            
            const startTime = parseInt(scheduleStart[0]) * 60 + parseInt(scheduleStart[1]);
            const endTime = parseInt(scheduleEnd[0]) * 60 + parseInt(scheduleEnd[1]);
            
            // Verificar si el tiempo actual está dentro del horario
            if (currentTime < startTime || currentTime > endTime) {
                // Opcional: Podríamos permitir asignar fuera de horario, pero con advertencia
                console.warn(`Advertencia: Asignación fuera de horario para repartidor ${deliveryPersonUserId}`);
            }
        }
        
        // 4. Verificar si el repartidor ya tiene una entrega activa asignada
        const [activeDeliveryRows] = await connection.execute(
            `SELECT d.* FROM Deliveries d
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.delivery_person_user_id = ? 
             AND o.order_status IN ('assigned', 'delivering')`,
            [deliveryPersonUserId]
        );
        
        if (activeDeliveryRows.length > 0) {
            // En un sistema de producción, podríamos permitir múltiples asignaciones
            // Por ahora, solo una advertencia
            console.warn(`Advertencia: Repartidor ${deliveryPersonUserId} ya tiene ${activeDeliveryRows.length} entregas activas.`);
        }
        
        // 5. Crear o actualizar registro de entrega
        const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // Formato MySQL datetime
        
        // Verificar si ya existe un registro de entrega para este pedido
        const [deliveryRows] = await connection.execute(
            `SELECT * FROM Deliveries WHERE order_id = ?`,
            [orderId]
        );
        
        if (deliveryRows.length === 0) {
            // Crear nuevo registro de entrega
            await connection.execute(
                `INSERT INTO Deliveries (
                    order_id, delivery_person_user_id, assigned_at
                ) VALUES (?, ?, ?)`,
                [orderId, deliveryPersonUserId, now]
            );
        } else {
            // Actualizar registro existente
            await connection.execute(
                `UPDATE Deliveries 
                 SET delivery_person_user_id = ?, assigned_at = ?
                 WHERE order_id = ?`,
                [deliveryPersonUserId, now, orderId]
            );
        }
        
        // 6. Actualizar estado del pedido
        await connection.execute(
            `UPDATE Orders SET order_status = 'assigned' WHERE order_id = ?`,
            [orderId]
        );
        
        // 7. Registrar la acción para auditoría
        // En un sistema de producción, añadiríamos una tabla de logs de acciones
        
        // 8. Confirmar la transacción
        await connection.commit();
        
        console.log(`Pedido #${orderId} asignado a repartidor ID ${deliveryPersonUserId}.`);
        res.status(200).json({ 
            message: 'Pedido asignado exitosamente.',
            order_id: orderId,
            delivery_person_id: deliveryPersonUserId,
            assigned_at: now
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en assignOrder:', error);
        res.status(500).json({ 
            message: 'Error al asignar pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// --- TOMAR PEDIDO (REPARTIDOR) ---
// Esta función permite a un repartidor auto-asignarse un pedido pendiente
const takeOrder = async (req, res) => {
    const orderId = req.params.id;
    const deliveryPersonUserId = req.user.id;
    
    console.log(`PUT /api/orders/${orderId}/take por Repartidor ID: ${deliveryPersonUserId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // La lógica es similar a assignOrder, pero el repartidor se lo asigna a sí mismo
        
        // 1. Verificar que el pedido existe y está en estado pendiente_asignación
        const [orderRows] = await connection.execute(
            `SELECT * FROM Orders WHERE order_id = ?`,
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
                message: `El pedido #${orderId} no está disponible para tomar (estado actual: ${order.order_status}).` 
            });
        }
        
        // 2. Verificar si el repartidor ya tiene una entrega activa asignada
        const [activeDeliveryRows] = await connection.execute(
            `SELECT d.* FROM Deliveries d
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.delivery_person_user_id = ? 
             AND o.order_status IN ('assigned', 'delivering')`,
            [deliveryPersonUserId]
        );
        
        if (activeDeliveryRows.length > 0) {
            // Advertencia o limitación configurable
            console.warn(`Repartidor ${deliveryPersonUserId} ya tiene ${activeDeliveryRows.length} entregas activas.`);
        }
        
        // 3. Crear registro de entrega
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // Verificar si ya existe
        const [deliveryRows] = await connection.execute(
            `SELECT * FROM Deliveries WHERE order_id = ?`,
            [orderId]
        );
        
        if (deliveryRows.length === 0) {
            await connection.execute(
                `INSERT INTO Deliveries (
                    order_id, delivery_person_user_id, assigned_at
                ) VALUES (?, ?, ?)`,
                [orderId, deliveryPersonUserId, now]
            );
        } else {
            await connection.execute(
                `UPDATE Deliveries 
                 SET delivery_person_user_id = ?, assigned_at = ?
                 WHERE order_id = ?`,
                [deliveryPersonUserId, now, orderId]
            );
        }
        
        // 4. Actualizar estado del pedido
        await connection.execute(
            `UPDATE Orders SET order_status = 'assigned' WHERE order_id = ?`,
            [orderId]
        );
        
        // 5. Confirmar transacción
        await connection.commit();
        
        console.log(`Pedido #${orderId} tomado por repartidor ID ${deliveryPersonUserId}.`);
        res.status(200).json({ 
            message: 'Pedido tomado exitosamente.',
            order_id: orderId,
            assigned_at: now
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en takeOrder:', error);
        res.status(500).json({ 
            message: 'Error al tomar pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// --- CANCELAR PEDIDO (CLIENTE, BASE, GERENTE) ---
const cancelOrder = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { reason } = req.body; // Opcional: motivo de cancelación
    
    console.log(`PUT /api/orders/${orderId}/cancel por User ID: ${userId} (${userRole})`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // 1. Verificar que el pedido existe
        const [orderRows] = await connection.execute(
            `SELECT * FROM Orders WHERE order_id = ?`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pedido #${orderId} no encontrado.` });
        }
        
        const order = orderRows[0];
        
        // 2. Verificar permisos según rol
        if (userRole === 'cliente' && order.customer_user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ message: 'No tienes permiso para cancelar este pedido.' });
        }
        
        // 3. Verificar que el pedido esté en un estado que permita cancelación
        const cancellableStates = ['pending_approval', 'pending_assignment', 'assigned'];
        if (!cancellableStates.includes(order.order_status)) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El pedido #${orderId} no puede ser cancelado en su estado actual (${order.order_status}).` 
            });
        }
        
        // 4. Si ya hay pagos registrados, verificar
        const [paymentsRows] = await connection.execute(
            `SELECT * FROM Payments WHERE order_id = ? AND verified_by_user_id IS NOT NULL`,
            [orderId]
        );
        
        if (paymentsRows.length > 0 && userRole === 'cliente') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El pedido #${orderId} ya tiene pagos verificados y no puede ser cancelado por el cliente.` 
            });
        }
        
        // 5. Actualizar estado del pedido
        await connection.execute(
            `UPDATE Orders SET order_status = 'cancelled', 
             updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [orderId]
        );
        
        // 6. Si había puntos canjeados, devolverlos al cliente
        if (order.points_redeemed > 0) {
            await connection.execute(
                `UPDATE Customers SET loyalty_points = loyalty_points + ? 
                 WHERE user_id = ?`,
                [order.points_redeemed, order.customer_user_id]
            );
            
            // Registrar transacción de devolución de puntos
            await connection.execute(
                `INSERT INTO LoyaltyTransactions (
                    customer_user_id, points_change, reason, related_order_id, notes
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    order.customer_user_id, order.points_redeemed, 'refund', orderId,
                    `Devolución por cancelación de pedido #${orderId}`
                ]
            );
        }
        
        // 7. Obtener items del pedido para restaurar inventario si es necesario
        const [orderItemsRows] = await connection.execute(
            `SELECT * FROM OrderItems WHERE order_id = ?`,
            [orderId]
        );
        
        // 8. Restaurar inventario si aún no ha sido entregado
        if (order.order_status !== 'delivered') {
            for (const item of orderItemsRows) {
                if (item.item_type === 'cylinder' && item.action_type !== 'exchange') {
                    // Para compras o préstamos, devolver al inventario
                    await connection.execute(
                        `UPDATE InventoryStock 
                         SET quantity = quantity + ? 
                         WHERE warehouse_id = ? AND item_id = ? AND item_type = 'cylinder' AND status = 'full'`,
                        [item.quantity, order.warehouse_id, item.item_id]
                    );
                    
                    // Registrar en log
                    await connection.execute(
                        `INSERT INTO InventoryLog (
                            warehouse_id, item_id, item_type, status_changed_from, 
                            status_changed_to, quantity_change, transaction_type, 
                            related_order_id, user_id, notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            order.warehouse_id, item.item_id, 'cylinder', 'sold', 
                            'full', item.quantity, 'order_cancel', 
                            orderId, userId, `Cancelación pedido #${orderId}${reason ? ': '+reason : ''}`
                        ]
                    );
                } else if (item.item_type === 'other_product') {
                    // Devolver productos al inventario
                    await connection.execute(
                        `UPDATE InventoryStock 
                         SET quantity = quantity + ? 
                         WHERE warehouse_id = ? AND item_id = ? AND item_type = 'other_product' AND status = 'available'`,
                        [item.quantity, order.warehouse_id, item.item_id]
                    );
                    
                    // Registrar en log
                    await connection.execute(
                        `INSERT INTO InventoryLog (
                            warehouse_id, item_id, item_type, status_changed_from, 
                            status_changed_to, quantity_change, transaction_type, 
                            related_order_id, user_id, notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            order.warehouse_id, item.item_id, 'other_product', 'sold', 
                            'available', item.quantity, 'order_cancel', 
                            orderId, userId, `Cancelación pedido #${orderId}${reason ? ': '+reason : ''}`
                        ]
                    );
                }
            }
        }
        
        // 9. Confirmar transacción
        await connection.commit();
        
        console.log(`Pedido #${orderId} cancelado por User ID ${userId}.`);
        res.status(200).json({ 
            message: 'Pedido cancelado exitosamente.',
            order_id: orderId
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en cancelOrder:', error);
        res.status(500).json({ 
            message: 'Error al cancelar pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// --- BUSCAR PEDIDO PARA ASOCIARLE RECIBO (CONTABILIDAD) ---
const searchOrderForReceipt = async (req, res) => {
    const { term } = req.query; // Puede ser ID, nombre cliente, DNI/RUC
    
    if (!term) {
        return res.status(400).json({ message: 'Se requiere un término de búsqueda.' });
    }
    
    console.log(`GET /api/orders/search-for-receipt?term=${term} por User ID: ${req.user.id}`);
    
    try {
        let query = `
            SELECT o.order_id, o.order_date, o.order_status, o.payment_status, o.total_amount,
                   u.full_name as customer_name, c.dni_ruc, o.receipt_url
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            LEFT JOIN Customers c ON u.user_id = c.user_id
            WHERE (o.order_id = ? OR
                   u.full_name LIKE ? OR
                   c.dni_ruc LIKE ?) AND
                  o.payment_status IN ('paid', 'partially_paid') AND
                  o.receipt_url IS NULL
            LIMIT 1`;
        
        const [orderRows] = await pool.execute(query, [
            term,                        // Búsqueda exacta por ID
            `%${term}%`,                 // Búsqueda parcial por nombre
            `%${term}%`                  // Búsqueda parcial por DNI/RUC
        ]);
        
        if (orderRows.length === 0) {
            return res.status(404).json({ 
                message: 'No se encontró ningún pedido sin recibo para ese criterio.' 
            });
        }
        
        res.status(200).json(orderRows[0]);
        
    } catch (error) {
        console.error('Error en searchOrderForReceipt:', error);
        res.status(500).json({ 
            message: 'Error al buscar pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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
    searchOrderForReceipt
};