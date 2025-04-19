// controllers/orderController.js
const pool = require('../db/db');
const { calculatePoints } = require('../utils/helpers');

// --- CREAR PEDIDO (CLIENTE) ---
const createOrder = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- OBTENER HISTORIAL DE PEDIDOS (CLIENTE) ---
const getMyOrderHistory = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- OBTENER DETALLES DE UN PEDIDO ---
const getOrderById = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- OBTENER PEDIDOS PENDIENTES (BASE/REPARTIDOR) ---
const getPendingOrders = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- OBTENER PEDIDOS ACTIVOS (BASE/GERENTE) ---
const getActiveOrders = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- ASIGNAR PEDIDO A REPARTIDOR (BASE) ---
const assignOrder = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- TOMAR PEDIDO (REPARTIDOR) ---
// Esta función permite a un repartidor auto-asignarse un pedido pendiente
const takeOrder = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// --- CANCELAR PEDIDO (CLIENTE, BASE, GERENTE) ---
const cancelOrder = async (req, res) => {
    // Implementación existente
    // [Contenido mantenido como original]
};

// Eliminado searchOrderForReceipt, ya que ahora solo existe en paymentController

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
    const offset = (page - 1) * limit;
    
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
            LIMIT ? OFFSET ?`,
            [parseInt(limit), parseInt(offset)]
        );
        
        // Obtener el recuento total para información de paginación
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM Orders WHERE order_status = 'pending_approval'`
        );
        
        const totalOrders = countRows[0].total;
        const totalPages = Math.ceil(totalOrders / limit);
        
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