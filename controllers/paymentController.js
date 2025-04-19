// controllers/paymentController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');
const fs = require('fs');
const path = require('path');

/**
 * Subir comprobante de pago (Cliente)
 * POST /api/payments/proof
 */
const uploadProof = async (req, res) => {
    const customerId = req.user.id;
    const { orderId, amount, paymentMethod, transactionReference } = req.body;
    
    console.log(`POST /api/payments/proof por Cliente ID: ${customerId}`);
    console.log("Datos recibidos:", { orderId, amount, paymentMethod, transactionReference });
    
    // Verificar si se adjuntó un archivo
    if (!req.file) {
        return res.status(400).json({ 
            message: 'Debes adjuntar un comprobante de pago (imagen).'
        });
    }
    
    // Validaciones de datos requeridos
    if (!orderId) {
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        return res.status(400).json({ message: 'El ID del pedido es requerido.' });
    }
    
    // Validar método de pago
    const validMethods = ['yape_plin', 'transfer', 'other'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        return res.status(400).json({ 
            message: `Método de pago inválido. Debe ser uno de: ${validMethods.join(', ')}.`
        });
    }
    
    // Validar monto (debe ser un número positivo)
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        return res.status(400).json({ 
            message: 'El monto debe ser un número positivo.'
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pedido existe y pertenece al cliente
        const [orderCheck] = await connection.execute(
            `SELECT o.order_id, o.customer_user_id, o.total_amount, o.order_status, o.payment_status
             FROM Orders o
             WHERE o.order_id = ? AND o.customer_user_id = ?`,
            [orderId, customerId]
        );
        
        if (orderCheck.length === 0) {
            await connection.rollback();
            // Eliminar el archivo subido si hay error
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
                });
            }
            return res.status(404).json({ 
                message: `Pedido #${orderId} no encontrado o no pertenece a este cliente.` 
            });
        }
        
        const order = orderCheck[0];
        
        // Verificar que el pedido no esté ya pagado completamente
        if (order.payment_status === 'paid') {
            await connection.rollback();
            // Eliminar el archivo subido si hay error
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
                });
            }
            return res.status(400).json({ 
                message: `Este pedido (#${orderId}) ya está completamente pagado.` 
            });
        }
        
        // Verificar que el estado del pedido permite pagos
        const validOrderStatuses = ['pending_approval', 'pending_assignment', 'assigned', 'delivering', 'delivered', 'payment_pending'];
        if (!validOrderStatuses.includes(order.order_status)) {
            await connection.rollback();
            // Eliminar el archivo subido si hay error
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
                });
            }
            return res.status(400).json({ 
                message: `El estado actual del pedido (#${orderId}: ${order.order_status}) no permite pagos.` 
            });
        }
        
        // Ruta relativa del archivo (para guardar en BD y servir después)
        const relativeFilePath = '/uploads/payment_proofs/' + path.basename(req.file.path);
        
        // Registrar el pago
        const [paymentResult] = await connection.execute(
            `INSERT INTO Payments (
                order_id, payment_date, amount, payment_method, 
                transaction_reference, payment_proof_url_customer
            ) VALUES (?, NOW(), ?, ?, ?, ?)`,
            [orderId, paymentAmount, paymentMethod, transactionReference || null, relativeFilePath]
        );
        
        const paymentId = paymentResult.insertId;
        
        // Actualizar estado del pedido si corresponde
        // Si el monto pagado es igual o mayor al total, marcar como pagado
        // De lo contrario, marcar como parcialmente pagado
        
        // Primero, obtener la suma de todos los pagos (incluyendo el nuevo)
        const [paymentSum] = await connection.execute(
            `SELECT SUM(amount) as total_paid FROM Payments WHERE order_id = ?`,
            [orderId]
        );
        
        const totalPaid = parseFloat(paymentSum[0].total_paid || 0);
        const totalAmount = parseFloat(order.total_amount || 0);
        
        let newPaymentStatus = 'pending';
        
        if (totalPaid >= totalAmount) {
            newPaymentStatus = 'paid';
        } else if (totalPaid > 0) {
            newPaymentStatus = 'partially_paid';
        }
        
        // Actualizar estado de pago del pedido
        await connection.execute(
            `UPDATE Orders SET 
                payment_status = ?, 
                updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [newPaymentStatus, orderId]
        );
        
        await connection.commit();
        
        console.log(`Comprobante pago subido para Pedido #${orderId}. PaymentID: ${paymentId}, Cliente: ${customerId}, Monto: ${paymentAmount}`);
        
        res.status(201).json({
            message: 'Comprobante de pago cargado correctamente.',
            paymentId: paymentId,
            paymentStatus: newPaymentStatus,
            details: {
                orderAmount: totalAmount,
                amountPaid: totalPaid,
                pendingAmount: Math.max(0, totalAmount - totalPaid)
            }
        });
        
    } catch (error) {
        // Deshacer la transacción en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        
        console.error('Error en uploadProof:', error);
        
        // Mensajes específicos para errores comunes
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'El pedido especificado no existe.' });
        }
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Ya existe un comprobante para este pedido y método de pago.' });
        }
        
        res.status(500).json({ 
            message: 'Error al subir el comprobante de pago.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener pagos pendientes de verificación (Contabilidad)
 * GET /api/payments/pending-verification
 */
const getPendingPayments = async (req, res) => {
    console.log(`GET /api/payments/pending-verification por User ID: ${req.user.id}`);
    
    try {
        const [pendingPayments] = await pool.execute(
            `SELECT 
                p.payment_id, 
                p.order_id, 
                u.full_name as customer_name,
                o.total_amount,
                p.amount, 
                p.payment_method,
                DATE_FORMAT(p.payment_date, '%Y-%m-%d %H:%i') as payment_date,
                p.transaction_reference,
                p.payment_proof_url_customer,
                p.payment_proof_url
            FROM Payments p
            JOIN Orders o ON p.order_id = o.order_id
            JOIN Users u ON o.customer_user_id = u.user_id
            WHERE p.verified_by_user_id IS NULL
            ORDER BY p.payment_date DESC`
        );
        
        // Para cada pago, añadir la ruta completa del comprobante si existe
        pendingPayments.forEach(payment => {
            // Añadir propiedades adicionales si son necesarias para el frontend
            payment.payment_status = 'pending_verification';
            
            // Convertir amount a número para consistencia
            payment.amount = parseFloat(payment.amount);
            
            // Elegir la URL de comprobante más apropiada (cliente o repartidor)
            if (!payment.payment_proof_url && !payment.payment_proof_url_customer) {
                payment.has_proof = false;
            } else {
                payment.has_proof = true;
            }
        });
        
        res.status(200).json(pendingPayments);
        
    } catch (error) {
        console.error('Error en getPendingPayments:', error);
        res.status(500).json({ 
            message: 'Error al obtener pagos pendientes de verificación.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Verificar un pago (Contabilidad)
 * PUT /api/payments/:paymentId/verify
 */
const verifyPayment = async (req, res) => {
    const paymentId = req.params.paymentId;
    const { approved, notes } = req.body;
    const verifierUserId = req.user.id;
    
    console.log(`PUT /api/payments/${paymentId}/verify por User ID: ${verifierUserId}`);
    console.log("Datos:", { approved, notes });
    
    // Validar que se incluye el estado de aprobación
    if (approved === undefined) {
        return res.status(400).json({ message: 'El campo "approved" (true/false) es requerido.' });
    }
    
    // Asegurar que approved es un booleano
    const isApproved = Boolean(approved);
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el pago existe y no ha sido verificado previamente
        const [paymentCheck] = await connection.execute(
            `SELECT 
                p.payment_id, p.order_id, p.amount, p.verified_by_user_id, 
                o.payment_status, o.total_amount, o.customer_user_id
            FROM Payments p
            JOIN Orders o ON p.order_id = o.order_id
            WHERE p.payment_id = ?`,
            [paymentId]
        );
        
        if (paymentCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Pago con ID ${paymentId} no encontrado.` });
        }
        
        const payment = paymentCheck[0];
        
        // Verificar que el pago no haya sido verificado previamente
        if (payment.verified_by_user_id !== null) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `Este pago ya fue verificado previamente.` 
            });
        }
        
        // Si se aprueba el pago
        if (isApproved) {
            // Marcar como verificado
            await connection.execute(
                `UPDATE Payments 
                 SET verified_by_user_id = ?, 
                     verified_at = NOW(), 
                     status = 'approved',
                     notes = ?
                 WHERE payment_id = ?`,
                [verifierUserId, notes || null, paymentId]
            );
            
            // Obtener todos los pagos aprobados para el pedido para calcular el total pagado
            const [payments] = await connection.execute(
                `SELECT SUM(amount) as total_paid 
                 FROM Payments 
                 WHERE order_id = ? AND (verified_by_user_id IS NOT NULL OR payment_id = ?)`,
                [payment.order_id, paymentId]
            );
            
            const totalPaid = parseFloat(payments[0].total_paid || 0);
            const totalAmount = parseFloat(payment.total_amount || 0);
            
            // Determinar el nuevo estado de pago
            let newPaymentStatus = 'pending';
            
            if (totalPaid >= totalAmount) {
                newPaymentStatus = 'paid';
            } else if (totalPaid > 0) {
                newPaymentStatus = 'partially_paid';
            }
            
            // Actualizar el estado de pago del pedido
            await connection.execute(
                `UPDATE Orders 
                 SET payment_status = ?, 
                     updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = ?`,
                [newPaymentStatus, payment.order_id]
            );
            
            // Registrar puntos de fidelidad si el pedido está completamente pagado
            if (newPaymentStatus === 'paid') {
                // Obtener configuración de puntos por sol
                const [configRows] = await connection.execute(
                    `SELECT config_value FROM Configuration WHERE config_key = 'points_per_sol'`
                );
                
                const pointsPerSol = parseFloat(configRows[0]?.config_value || 0);
                
                // Si hay configuración de puntos, añadirlos
                if (pointsPerSol > 0) {
                    // Calcular puntos a asignar
                    const pointsToAdd = Math.floor(totalAmount * pointsPerSol);
                    
                    if (pointsToAdd > 0) {
                        // Añadir transacción de puntos
                        await connection.execute(
                            `INSERT INTO LoyaltyTransactions (
                                customer_user_id, points_change, reason, related_order_id
                            ) VALUES (?, ?, 'purchase_earn', ?)`,
                            [payment.customer_user_id, pointsToAdd, payment.order_id]
                        );
                        
                        // Actualizar puntos en la tabla Customers
                        await connection.execute(
                            `UPDATE Customers 
                             SET loyalty_points = loyalty_points + ?, 
                                 last_purchase_date = CURRENT_DATE()
                             WHERE user_id = ?`,
                            [pointsToAdd, payment.customer_user_id]
                        );
                        
                        // Actualizar puntos ganados en el pedido
                        await connection.execute(
                            `UPDATE Orders 
                             SET points_earned = ? 
                             WHERE order_id = ?`,
                            [pointsToAdd, payment.order_id]
                        );
                        
                        console.log(`Añadidos ${pointsToAdd} puntos al cliente ID ${payment.customer_user_id} por pedido #${payment.order_id}`);
                    }
                }
            }
            
            console.log(`Pago ID ${paymentId} APROBADO por User ID ${verifierUserId}. Nuevo estado pedido: ${newPaymentStatus}`);
            
            // Respuesta exitosa - Aprobado
            await connection.commit();
            res.status(200).json({
                message: 'Pago verificado y aprobado correctamente.',
                payment_status: newPaymentStatus,
                order_id: payment.order_id,
                details: {
                    total_amount: totalAmount,
                    total_paid: totalPaid,
                    pending_amount: Math.max(0, totalAmount - totalPaid),
                    is_fully_paid: newPaymentStatus === 'paid'
                }
            });
            
        } else {
            // Si se rechaza el pago
            // Marcar como rechazado
            await connection.execute(
                `UPDATE Payments 
                 SET verified_by_user_id = ?, 
                     verified_at = NOW(), 
                     status = 'rejected',
                     notes = ?
                 WHERE payment_id = ?`,
                [verifierUserId, notes || null, paymentId]
            );
            
            // No se modifica el estado del pedido al rechazar
            
            console.log(`Pago ID ${paymentId} RECHAZADO por User ID ${verifierUserId}.`);
            
            // Respuesta exitosa - Rechazado
            await connection.commit();
            res.status(200).json({
                message: 'Pago verificado y rechazado correctamente.',
                payment_status: payment.payment_status,
                order_id: payment.order_id
            });
        }
        
    } catch (error) {
        // Deshacer la transacción en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en verifyPayment:', error);
        
        res.status(500).json({ 
            message: 'Error al verificar el pago.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Subir recibo/factura en PDF (Contabilidad)
 * POST /api/payments/receipt/:orderId
 */
const uploadReceiptFile = async (req, res) => {
    const orderId = req.params.orderId;
    const uploadedByUserId = req.user.id;
    
    console.log(`POST /api/payments/receipt/${orderId} por User ID: ${uploadedByUserId}`);
    
    // Verificar si se adjuntó un archivo
    if (!req.file) {
        return res.status(400).json({ 
            message: 'Debes adjuntar un recibo/factura (PDF).'
        });
    }
    
    // Validar tipo MIME del archivo (debe ser PDF)
    if (req.file.mimetype !== 'application/pdf') {
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        return res.status(400).json({ 
            message: 'El archivo debe ser un PDF.'
        });
    }
    
    try {
        // Verificar que el pedido existe
        const [orderCheck] = await pool.execute(
            `SELECT o.order_id, o.customer_user_id, o.total_amount, o.order_status, o.payment_status, o.receipt_url
             FROM Orders o
             WHERE o.order_id = ?`,
            [orderId]
        );
        
        if (orderCheck.length === 0) {
            // Eliminar el archivo subido si hay error
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
                });
            }
            return res.status(404).json({ 
                message: `Pedido #${orderId} no encontrado.` 
            });
        }
        
        const order = orderCheck[0];
        
        // Verificar si ya existe un recibo para este pedido
        if (order.receipt_url) {
            // Si existe, eliminar el archivo anterior si es posible
            const oldFilePath = path.join(process.cwd(), order.receipt_url);
            if (fs.existsSync(oldFilePath)) {
                try {
                    fs.unlinkSync(oldFilePath);
                    console.log(`Archivo previo eliminado: ${oldFilePath}`);
                } catch (unlinkError) {
                    console.error(`Error al eliminar archivo previo: ${unlinkError.message}`);
                    // Continuar aunque no se pueda eliminar
                }
            }
        }
        
        // Ruta relativa del archivo (para guardar en BD y servir después)
        const relativeFilePath = '/uploads/receipts/' + path.basename(req.file.path);
        
        // Actualizar la información del recibo en el pedido
        await pool.execute(
            `UPDATE Orders 
             SET receipt_url = ?, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [relativeFilePath, orderId]
        );
        
        console.log(`Recibo subido para pedido #${orderId} por User ID ${uploadedByUserId}: ${relativeFilePath}`);
        
        res.status(201).json({
            message: 'Recibo/factura subido exitosamente.',
            order_id: orderId,
            receipt_url: relativeFilePath
        });
        
    } catch (error) {
        // Eliminar el archivo subido si hay error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error(`Error eliminando archivo temporal: ${err.message}`);
            });
        }
        
        console.error('Error en uploadReceiptFile:', error);
        
        res.status(500).json({ 
            message: 'Error al subir el recibo/factura.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Listar recibos subidos (Contabilidad)
 * GET /api/payments/receipts?startDate=...&endDate=...
 */
const listUploadedReceipts = async (req, res) => {
    const { startDate, endDate } = req.query;
    
    console.log(`GET /api/payments/receipts por User ID: ${req.user.id}`);
    console.log("Filtros:", { startDate, endDate });
    
    try {
        let query = `
            SELECT
                o.order_id,
                DATE_FORMAT(o.order_date, '%Y-%m-%d') as order_date,
                u.full_name as customer_name,
                u.phone_number_primary as customer_phone,
                c.dni_ruc as customer_document,
                o.total_amount,
                o.receipt_url,
                DATE_FORMAT(o.updated_at, '%Y-%m-%d %H:%i') as upload_date
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            LEFT JOIN Customers c ON u.user_id = c.user_id
            WHERE o.receipt_url IS NOT NULL
        `;
        
        const params = [];
        
        // Aplicar filtros de fecha si se especifican
        if (startDate && endDate) {
            query += ' AND DATE(o.updated_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND DATE(o.updated_at) >= ?';
            params.push(startDate);
        } else if (endDate) {
            query += ' AND DATE(o.updated_at) <= ?';
            params.push(endDate);
        }
        
        // Ordenamiento y límite
        query += ' ORDER BY o.updated_at DESC LIMIT 100';
        
        const [receipts] = await pool.execute(query, params);
        
        // Formatear datos para la respuesta
        receipts.forEach(receipt => {
            // Convertir total_amount a número para consistencia
            receipt.total_amount = parseFloat(receipt.total_amount);
            
            // Añadir información de estado del recibo
            receipt.status = 'processed'; // Por defecto asumimos procesado
        });
        
        console.log(`Recibos encontrados: ${receipts.length}`);
        
        res.status(200).json(receipts);
        
    } catch (error) {
        console.error('Error en listUploadedReceipts:', error);
        res.status(500).json({ 
            message: 'Error al obtener lista de recibos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener historial de pagos de un pedido
 * GET /api/payments/order/:orderId/history
 */
const getOrderPaymentHistory = async (req, res) => {
    const orderId = req.params.orderId;
    
    console.log(`GET /api/payments/order/${orderId}/history por User ID: ${req.user.id}`);
    
    try {
        // Verificar que el pedido existe y tiene permisos para verlo
        const [orderCheck] = await pool.execute(
            `SELECT o.order_id, o.customer_user_id, o.total_amount, o.payment_status
             FROM Orders o
             WHERE o.order_id = ?`,
            [orderId]
        );
        
        if (orderCheck.length === 0) {
            return res.status(404).json({ 
                message: `Pedido #${orderId} no encontrado.` 
            });
        }
        
        const order = orderCheck[0];
        
        // Si es cliente, verificar que sea dueño del pedido
        if (req.user.role === 'cliente' && order.customer_user_id !== req.user.id) {
            return res.status(403).json({ 
                message: 'No tienes permiso para ver los pagos de este pedido.' 
            });
        }
        
        // Obtener historial de pagos
        const [payments] = await pool.execute(
            `SELECT 
                p.payment_id, 
                p.amount, 
                p.payment_method,
                DATE_FORMAT(p.payment_date, '%Y-%m-%d %H:%i') as payment_date,
                p.transaction_reference,
                p.payment_proof_url_customer,
                p.payment_proof_url,
                p.status,
                p.notes,
                u.full_name as verified_by,
                DATE_FORMAT(p.verified_at, '%Y-%m-%d %H:%i') as verified_at
            FROM Payments p
            LEFT JOIN Users u ON p.verified_by_user_id = u.user_id
            WHERE p.order_id = ?
            ORDER BY p.payment_date DESC`,
            [orderId]
        );
        
        // Formatear datos para la respuesta
        payments.forEach(payment => {
            // Convertir amount a número para consistencia
            payment.amount = parseFloat(payment.amount);
            
            // Añadir estado si no existe
            if (!payment.status) {
                payment.status = payment.verified_by ? 'approved' : 'pending';
            }
            
            // Determinar la URL del comprobante a usar (cliente o repartidor)
            payment.proof_url = payment.payment_proof_url_customer || payment.payment_proof_url || null;
            
            // Determinar si tiene comprobante
            payment.has_proof = !!payment.proof_url;
        });
        
        res.status(200).json({
            order_id: orderId,
            total_amount: parseFloat(order.total_amount),
            payment_status: order.payment_status,
            payments: payments
        });
        
    } catch (error) {
        console.error('Error en getOrderPaymentHistory:', error);
        res.status(500).json({ 
            message: 'Error al obtener historial de pagos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Buscar pedido para adjuntar recibo (Contabilidad)
 * GET /api/payments/search-order-for-receipt?term=...
 */
const searchOrderForReceipt = async (req, res) => {
    const { term } = req.query;
    
    console.log(`GET /api/payments/search-order-for-receipt?term=${term} por User ID: ${req.user.id}`);
    
    if (!term || term.trim().length < 3) {
        return res.status(400).json({ 
            message: 'El término de búsqueda debe tener al menos 3 caracteres.' 
        });
    }
    
    try {
        const searchTerm = `%${term.trim()}%`;
        
        // Buscar por ID de pedido, nombre de cliente, DNI/RUC o teléfono
        const [results] = await pool.execute(
            `SELECT 
                o.order_id, 
                u.full_name as customer_name,
                c.dni_ruc,
                u.phone_number_primary as customer_phone,
                o.total_amount,
                DATE_FORMAT(o.order_date, '%Y-%m-%d') as order_date,
                o.payment_status,
                o.receipt_url
            FROM Orders o
            JOIN Users u ON o.customer_user_id = u.user_id
            LEFT JOIN Customers c ON u.user_id = c.user_id
            WHERE (o.order_id = ? OR u.full_name LIKE ? OR c.dni_ruc LIKE ? OR u.phone_number_primary LIKE ?)
                AND o.payment_status = 'paid'
            ORDER BY o.order_id DESC
            LIMIT 10`,
            [term, searchTerm, searchTerm, searchTerm]
        );
        
        if (results.length === 0) {
            return res.status(404).json({ 
                message: 'No se encontraron pedidos que coincidan con la búsqueda.' 
            });
        }
        
        // Si hay más de un resultado, devolver la lista para que el usuario seleccione
        if (results.length > 1) {
            // Formatear datos para la respuesta
            results.forEach(result => {
                // Convertir total_amount a número para consistencia
                result.total_amount = parseFloat(result.total_amount);
                
                // Añadir estado del recibo
                result.has_receipt = !!result.receipt_url;
            });
            
            return res.status(200).json({
                message: 'Múltiples resultados encontrados.',
                multiple: true,
                results: results
            });
        }
        
        // Si solo hay un resultado, devolver ese
        const order = results[0];
        order.total_amount = parseFloat(order.total_amount);
        order.has_receipt = !!order.receipt_url;
        
        res.status(200).json(order);
        
    } catch (error) {
        console.error('Error en searchOrderForReceipt:', error);
        res.status(500).json({ 
            message: 'Error al buscar pedido.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    uploadProof,
    getPendingPayments,
    verifyPayment,
    uploadReceiptFile,
    listUploadedReceipts,
    getOrderPaymentHistory,
    searchOrderForReceipt
};