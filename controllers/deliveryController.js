// controllers/deliveryController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');

/**
 * Obtener entrega actualmente asignada al repartidor autenticado
 * GET /api/deliveries/assigned/me
 */
const getMyAssignedDelivery = async (req, res) => {
    const repartidorUserId = req.user.id;
    console.log(`GET /api/deliveries/assigned/me por Repartidor ID: ${repartidorUserId}`);
    
    try {
        // Buscar pedido asignado al repartidor que esté en estado 'assigned' o 'delivering'
        const [deliveries] = await pool.execute(
            `SELECT 
                d.order_id, 
                d.assigned_at,
                d.departed_at,
                o.order_status,
                o.payment_status,
                o.warehouse_id,
                c.full_name as customer_name,
                c.phone_number_primary as customer_phone,
                o.delivery_address_text as delivery_address,
                o.delivery_instructions,
                DATE_FORMAT(o.order_date, '%Y-%m-%d %H:%i') as order_date_formatted,
                (
                    SELECT CONCAT(
                        CASE 
                            WHEN oi.item_type = 'cylinder' THEN 
                                CONCAT(ct.name, ' x', oi.quantity, ' (', oi.action_type, ')')
                            ELSE 
                                CONCAT(op.name, ' x', oi.quantity)
                        END
                    )
                    FROM OrderItems oi
                    LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
                    LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
                    WHERE oi.order_id = o.order_id
                    LIMIT 1
                ) as order_summary
            FROM 
                Deliveries d
                JOIN Orders o ON d.order_id = o.order_id
                JOIN Users c ON o.customer_user_id = c.user_id
            WHERE 
                d.delivery_person_user_id = ?
                AND o.order_status IN ('assigned', 'delivering')
            LIMIT 1`,
            [repartidorUserId]
        );
        
        if (deliveries.length === 0) {
            return res.status(404).json({ message: "No tienes entregas asignadas actualmente." });
        }
        
        // Entregar datos de la primera asignación (debería ser única por el estado)
        res.status(200).json(deliveries[0]);
        
    } catch (error) {
        console.error('Error en getMyAssignedDelivery:', error);
        res.status(500).json({
            message: 'Error al obtener la entrega asignada.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Marcar inicio de la entrega por el repartidor
 * PUT /api/deliveries/:orderId/start
 */
const startDelivery = async (req, res) => {
    const orderId = req.params.orderId;
    const repartidorUserId = req.user.id;
    console.log(`PUT /api/deliveries/${orderId}/start por Repartidor ID: ${repartidorUserId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y está asignado a este repartidor
        const [deliveries] = await connection.execute(
            `SELECT d.delivery_id, o.order_status 
             FROM Deliveries d
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.order_id = ? AND d.delivery_person_user_id = ?`,
            [orderId, repartidorUserId]
        );
        
        if (deliveries.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: `La entrega para el pedido #${orderId} no está asignada a ti.`
            });
        }
        
        const delivery = deliveries[0];
        
        // Verificar que el estado actual del pedido es 'assigned' (no 'delivering', 'delivered', etc.)
        if (delivery.order_status !== 'assigned') {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede iniciar la entrega porque el pedido está en estado '${delivery.order_status}'.`
            });
        }
        
        // Actualizar la entrega con la hora de salida
        await connection.execute(
            `UPDATE Deliveries 
             SET departed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE delivery_id = ?`,
            [delivery.delivery_id]
        );
        
        // Actualizar el estado del pedido a 'delivering'
        await connection.execute(
            `UPDATE Orders 
             SET order_status = 'delivering',
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [orderId]
        );
        
        await connection.commit();
        console.log(`Entrega para pedido ${orderId} iniciada por repartidor ${repartidorUserId}.`);
        
        res.status(200).json({
            message: 'Entrega iniciada correctamente.'
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error en startDelivery:', error);
        res.status(500).json({
            message: 'Error al iniciar la entrega.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Completar entrega por el repartidor
 * POST /api/deliveries/:orderId/complete
 */
const completeDelivery = async (req, res) => {
    const orderId = req.params.orderId;
    const repartidorUserId = req.user.id;
    const { 
        collection_method, 
        amount_collected, 
        scheduled_collection_time,
        delivery_notes,
        schedule_later // Nueva opción para programar hora de cobro
    } = req.body;
    
    console.log(`POST /api/deliveries/${orderId}/complete por Repartidor ID: ${repartidorUserId}`);
    console.log('Datos recibidos:', { ...req.body, file: req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'Ninguno' });
    
    // Validar colección de pago
    if (!collection_method) {
        return res.status(400).json({ message: 'El método de cobro es requerido.' });
    }
    
    const validCollectionMethods = ['cash', 'yape_plin', 'transfer', 'cobro_pendiente', 'not_collected'];
    if (!validCollectionMethods.includes(collection_method)) {
        return res.status(400).json({ 
            message: `Método de cobro inválido. Opciones: ${validCollectionMethods.join(', ')}.`
        });
    }
    
    // Validar monto cobrado para métodos que requieren monto
    if (['cash', 'yape_plin', 'transfer'].includes(collection_method) && 
        (amount_collected === undefined || amount_collected === null || amount_collected < 0)) {
        return res.status(400).json({ 
            message: 'Monto de cobro inválido. Debe ser un número positivo.'
        });
    }
    
    // Validar hora de cobro programada
    let collectionTimeToStore = null;
    if (collection_method === 'cobro_pendiente' && schedule_later === 'true' && scheduled_collection_time) {
        // Validar formato de hora HH:MM
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduled_collection_time)) {
            return res.status(400).json({ message: 'Formato de hora inválido. Usar HH:MM.' });
        }
        collectionTimeToStore = scheduled_collection_time;
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y está en proceso de entrega por este repartidor
        const [deliveries] = await connection.execute(
            `SELECT d.delivery_id, o.order_id, o.order_status, o.total_amount, o.customer_user_id, o.payment_status
             FROM Deliveries d
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.order_id = ? AND d.delivery_person_user_id = ?`,
            [orderId, repartidorUserId]
        );
        
        if (deliveries.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: `La entrega para el pedido #${orderId} no está asignada a ti.`
            });
        }
        
        const delivery = deliveries[0];
        
        // Verificar que el pedido está en estado válido para completar (assigned/delivering)
        const validOrderStates = ['assigned', 'delivering'];
        if (!validOrderStates.includes(delivery.order_status)) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede completar la entrega porque el pedido está en estado '${delivery.order_status}'.`
            });
        }
        
        // Procesar imagen de comprobante si se adjuntó
        let paymentProofUrl = null;
        if (req.file) {
            // El archivo ya fue guardado por multer en la ruta configurada
            paymentProofUrl = `/uploads/payment_proofs/${req.file.filename}`;
            
            // En producción, aquí podrías subir a un CDN/S3 y obtener la URL
        }
        
        // Determinar el estado del pedido y del pago basado en el método de cobro
        let newOrderStatus = 'delivered';
        let newPaymentStatus = 'pending';
        
        if (['cash', 'yape_plin', 'transfer'].includes(collection_method)) {
            // Si se recibió pago completo
            newPaymentStatus = 'paid';
        } else if (collection_method === 'cobro_pendiente') {
            newPaymentStatus = 'late_payment_scheduled';
        }
        
        // Actualizar la entrega como completada con la información de cobro
        await connection.execute(
            `UPDATE Deliveries 
             SET completed_at = CURRENT_TIMESTAMP,
                 collection_method = ?,
                 amount_collected = ?,
                 payment_proof_url = ?,
                 scheduled_collection_time = ?,
                 delivery_notes = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE delivery_id = ?`,
            [
                collection_method,
                (amount_collected !== undefined && amount_collected !== null) ? amount_collected : null,
                paymentProofUrl,
                collectionTimeToStore,
                delivery_notes || null,
                delivery.delivery_id
            ]
        );
        
        // Actualizar el estado del pedido y su pago
        await connection.execute(
            `UPDATE Orders 
             SET order_status = ?,
                 payment_status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [newOrderStatus, newPaymentStatus, orderId]
        );
        
        // Si se cobró, registrar el pago en la tabla de pagos
        if ((['cash', 'yape_plin', 'transfer'].includes(collection_method)) && 
            amount_collected && amount_collected > 0) {
            
            await connection.execute(
                `INSERT INTO Payments (
                    order_id, payment_date, amount, payment_method, 
                    transaction_reference, payment_proof_url_customer
                ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
                [
                    orderId,
                    amount_collected,
                    collection_method,
                    'Pago a repartidor', // Referencia estándar
                    paymentProofUrl
                ]
            );
        }
        
        // Actualizar inventario si hay intercambio de cilindro (se implementaría en una fase posterior)
        // Por ahora, asumimos que el inventario ya fue verificado al asignar el pedido
        
        await connection.commit();
        console.log(`Entrega completada para pedido ${orderId} por repartidor ${repartidorUserId}.`);
        
        res.status(200).json({
            message: 'Entrega completada correctamente.',
            details: {
                order_id: orderId,
                collection_method,
                payment_status: newPaymentStatus
            }
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        
        // Si hubo error y se subió un archivo, intentar eliminar
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
                console.log(`Archivo eliminado debido a error: ${req.file.path}`);
            } catch (unlinkError) {
                console.error('Error eliminando archivo temporal:', unlinkError);
            }
        }
        
        console.error('Error en completeDelivery:', error);
        res.status(500).json({
            message: 'Error al completar la entrega.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Reportar problema con la entrega
 * POST /api/deliveries/:orderId/issue
 */
const reportDeliveryIssue = async (req, res) => {
    const orderId = req.params.orderId;
    const repartidorUserId = req.user.id;
    const { issue_notes } = req.body;
    
    console.log(`POST /api/deliveries/${orderId}/issue por Repartidor ID: ${repartidorUserId}`);
    
    if (!issue_notes) {
        return res.status(400).json({ message: 'La descripción del problema es requerida.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y está asignado a este repartidor
        const [deliveries] = await connection.execute(
            `SELECT d.delivery_id, o.order_status 
             FROM Deliveries d
             JOIN Orders o ON d.order_id = o.order_id
             WHERE d.order_id = ? AND d.delivery_person_user_id = ?`,
            [orderId, repartidorUserId]
        );
        
        if (deliveries.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: `La entrega para el pedido #${orderId} no está asignada a ti.`
            });
        }
        
        const delivery = deliveries[0];
        
        // Verificar que el pedido está en estado válido para reportar problema
        const validOrderStates = ['assigned', 'delivering'];
        if (!validOrderStates.includes(delivery.order_status)) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `No se puede reportar problema porque el pedido está en estado '${delivery.order_status}'.`
            });
        }
        
        // Marcar problema en la entrega
        await connection.execute(
            `UPDATE Deliveries 
             SET has_issue = TRUE,
                 issue_notes = ?,
                 completed_at = CURRENT_TIMESTAMP, /* Se marca como completada pero con problema */
                 updated_at = CURRENT_TIMESTAMP
             WHERE delivery_id = ?`,
            [issue_notes, delivery.delivery_id]
        );
        
        // Actualizar estado del pedido para seguimiento por base/gerencia
        await connection.execute(
            `UPDATE Orders 
             SET order_status = 'delivery_issue',
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [orderId]
        );
        
        // Aquí se podría implementar una notificación a los usuarios de base/gerencia
        
        await connection.commit();
        console.log(`Problema reportado para pedido ${orderId} por repartidor ${repartidorUserId}: ${issue_notes.substring(0, 30)}...`);
        
        res.status(200).json({
            message: 'Problema reportado correctamente. Un supervisor revisará el caso.',
            details: {
                order_id: orderId,
                issue_notes: issue_notes
            }
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error en reportDeliveryIssue:', error);
        res.status(500).json({
            message: 'Error al reportar el problema con la entrega.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener lista de cobros pendientes
 * GET /api/deliveries/pending-collection
 */
const getPendingCollections = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Filtrar por repartidor específico si el rol es 'repartidor'
    const deliveryPersonFilter = userRole === 'repartidor' ? userId : null;
    
    console.log(`GET /api/deliveries/pending-collection por User ID: ${userId}, Role: ${userRole}`);
    
    try {
        let query = `
            SELECT 
                d.order_id,
                c.full_name as customer_name,
                c.phone_number_primary as customer_phone,
                u.full_name as delivery_person_name,
                u.user_id as delivery_person_user_id,
                o.total_amount as amount_pending,
                d.scheduled_collection_time,
                DATE_FORMAT(d.completed_at, '%Y-%m-%d') as delivery_date,
                d.delivery_notes,
                o.delivery_address_text as address
            FROM 
                Deliveries d
                JOIN Orders o ON d.order_id = o.order_id
                JOIN Users c ON o.customer_user_id = c.user_id
                JOIN Users u ON d.delivery_person_user_id = u.user_id
            WHERE 
                d.collection_method = 'cobro_pendiente'
                AND o.payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled')
        `;
        
        const params = [];
        
        // Añadir filtro de repartidor si es necesario
        if (deliveryPersonFilter) {
            query += ' AND d.delivery_person_user_id = ?';
            params.push(deliveryPersonFilter);
        }
        
        // Ordenar por fecha de entrega (más recientes primero)
        query += ' ORDER BY d.completed_at DESC';
        
        const [collections] = await pool.execute(query, params);
        
        console.log(`Cobros pendientes encontrados: ${collections.length}`);
        res.status(200).json(collections);
        
    } catch (error) {
        console.error('Error en getPendingCollections:', error);
        res.status(500).json({
            message: 'Error al obtener lista de cobros pendientes.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Registrar cobro de pago pendiente
 * POST /api/deliveries/:orderId/collect-payment
 */
const registerCollectedPayment = async (req, res) => {
    const orderId = req.params.orderId;
    const repartidorUserId = req.user.id;
    const { amount_collected, payment_method, payment_notes } = req.body;
    
    console.log(`POST /api/deliveries/${orderId}/collect-payment por Repartidor ID: ${repartidorUserId}`);
    
    // Validaciones
    if (!amount_collected || amount_collected <= 0) {
        return res.status(400).json({ message: 'El monto cobrado debe ser mayor que cero.' });
    }
    
    if (!payment_method) {
        return res.status(400).json({ message: 'El método de pago es requerido.' });
    }
    
    const validPaymentMethods = ['cash', 'yape_plin', 'transfer'];
    if (!validPaymentMethods.includes(payment_method)) {
        return res.status(400).json({ 
            message: `Método de pago inválido. Opciones: ${validPaymentMethods.join(', ')}.`
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe, está en estado correcto y pendiente de cobro
        const [orders] = await connection.execute(
            `SELECT o.order_id, o.total_amount, o.payment_status, d.delivery_id, d.delivery_person_user_id
             FROM Orders o
             JOIN Deliveries d ON o.order_id = d.order_id
             WHERE o.order_id = ? AND o.payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled')`,
            [orderId]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: `Pedido #${orderId} no encontrado o no está pendiente de cobro.`
            });
        }
        
        const order = orders[0];
        
        // Verificar que el repartidor tiene permiso para cobrar este pedido
        if (order.delivery_person_user_id !== repartidorUserId) {
            await connection.rollback();
            return res.status(403).json({ 
                message: `No tienes permiso para cobrar el pedido #${orderId}.`
            });
        }
        
        // Registrar el pago en la tabla Payments
        await connection.execute(
            `INSERT INTO Payments (
                order_id, payment_date, amount, payment_method, 
                transaction_reference, notes
            ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
            [
                orderId,
                amount_collected,
                payment_method,
                'Cobro pendiente registrado', // Referencia estándar
                payment_notes || null
            ]
        );
        
        // Actualizar la entrega con el método de cobro y monto
        await connection.execute(
            `UPDATE Deliveries 
             SET collection_method = ?,
                 amount_collected = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE delivery_id = ?`,
            [payment_method, amount_collected, order.delivery_id]
        );
        
        // Verificar si el monto cobrado iguala al total del pedido
        let newPaymentStatus = 'partially_paid';
        
        // Si el cobro es igual o mayor que el monto pendiente (por flexibilidad), marcar como pagado
        if (amount_collected >= order.total_amount) {
            newPaymentStatus = 'paid';
        }
        
        // Actualizar estado de pago del pedido
        await connection.execute(
            `UPDATE Orders 
             SET payment_status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [newPaymentStatus, orderId]
        );
        
        await connection.commit();
        console.log(`Pago pendiente registrado para pedido ${orderId} por repartidor ${repartidorUserId}. Monto: ${amount_collected}`);
        
        res.status(200).json({
            message: 'Pago registrado correctamente.',
            details: {
                order_id: orderId,
                amount_collected,
                payment_method,
                new_payment_status: newPaymentStatus
            }
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error en registerCollectedPayment:', error);
        res.status(500).json({
            message: 'Error al registrar el cobro del pago pendiente.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener historial diario de entregas del repartidor
 * GET /api/deliveries/my-daily-history
 */
const getMyDailyHistory = async (req, res) => {
    const repartidorUserId = req.user.id;
    console.log(`GET /api/deliveries/my-daily-history por Repartidor ID: ${repartidorUserId}`);
    
    try {
        // Buscar entregas completadas o con pago pendiente/agendado para HOY por este repartidor
        const [history] = await pool.execute(
            `SELECT
                d.order_id,
                DATE_FORMAT(d.completed_at, '%H:%i') as completed_time,
                c.full_name as customer_name,
                o.order_status,
                d.collection_method,
                d.amount_collected
            FROM 
                Deliveries d
                JOIN Orders o ON d.order_id = o.order_id
                JOIN Users c ON o.customer_user_id = c.user_id
            WHERE 
                d.delivery_person_user_id = ?
                AND DATE(d.completed_at) = CURDATE()
                AND o.order_status IN ('delivered', 'paid', 'payment_pending', 'late_payment_scheduled', 'delivery_issue')
            ORDER BY 
                d.completed_at DESC`,
            [repartidorUserId]
        );
        
        console.log(`Historial diario para repartidor ${repartidorUserId}: ${history.length} entregas.`);
        res.status(200).json(history);
        
    } catch (error) {
        console.error('Error en getMyDailyHistory:', error);
        res.status(500).json({
            message: 'Error al obtener el historial diario de entregas.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getMyAssignedDelivery,
    startDelivery,
    completeDelivery,
    reportDeliveryIssue,
    getPendingCollections,
    registerCollectedPayment,
    getMyDailyHistory
};