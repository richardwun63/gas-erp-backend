// controllers/miscController.js
const pool = require('../db/db');

// --- Registrar Solicitud de Mantenimiento (Cliente) ---
const submitMaintenanceRequest = async (req, res) => { const customerUserId = req.user.id; const { notes } = req.body; console.log(`POST /api/misc/maintenance-request por User ID: ${customerUserId}`); try { const [result] = await pool.execute( 'INSERT INTO MaintenanceRequests (customer_user_id, notes, status) VALUES (?, ?, ?)', [customerUserId, notes || null, 'pending'] ); console.log(`Solicitud mant. ID: ${result.insertId} Cliente ID: ${customerUserId}`); res.status(201).json({ message: 'Solicitud registrada.' }); } catch (error) { console.error('Error submitMaintenanceRequest:', error); if (error.code === 'ER_NO_REFERENCED_ROW_2') { return res.status(400).json({ message: 'ID cliente inválido.' }); } res.status(500).json({ message: 'Error al registrar solicitud.', error: error.message }); } };

// --- Listar Solicitudes de Mantenimiento (Base/Gerente) ---
const listMaintenanceRequests = async (req, res) => { const { status = 'pending' } = req.query; console.log(`GET /api/misc/maintenance-requests?status=${status} por User ID: ${req.user.id}`); try { let query = ` SELECT mr.request_id, mr.customer_user_id, u.full_name as customer_name, DATE_FORMAT(mr.request_date, '%Y-%m-%d %H:%i') as request_date_formatted, mr.status, mr.notes, DATE_FORMAT(mr.scheduled_date, '%Y-%m-%d %H:%i') as scheduled_date_formatted, mr.assigned_technician FROM MaintenanceRequests mr JOIN Users u ON mr.customer_user_id = u.user_id `; const params = []; if (status && status !== 'all') { query += ' WHERE mr.status = ?'; params.push(status); } query += ' ORDER BY mr.request_date DESC'; const [requests] = await pool.execute(query, params); console.log(`Solicitudes mant. (${status}): ${requests.length}`); res.status(200).json(requests); } catch (error) { console.error('Error listMaintenanceRequests:', error); res.status(500).json({ message: 'Error obtener solicitudes.', error: error.message }); } };

// --- Actualizar Solicitud de Mantenimiento (Base/Gerente) ---
const updateMaintenanceRequest = async (req, res) => { const requestId = req.params.requestId; const { status, scheduled_date, assigned_technician, notes } = req.body; console.log(`PUT /api/misc/maintenance-requests/${requestId} por User ID: ${req.user.id}`); const validStatus = ['pending', 'scheduled', 'completed', 'cancelled']; if (status && !validStatus.includes(status)) { return res.status(400).json({ message: `Estado inválido.` }); } let setClause = []; const params = []; if (status) { setClause.push('status = ?'); params.push(status); } if (scheduled_date !== undefined) { setClause.push('scheduled_date = ?'); params.push(scheduled_date || null); } if (assigned_technician !== undefined) { setClause.push('assigned_technician = ?'); params.push(assigned_technician || null); } if (notes !== undefined) { setClause.push('notes = ?'); params.push(notes || null); } if (status === 'completed') { setClause.push('completed_date = NOW()'); } if (setClause.length === 0) { return res.status(400).json({ message: 'No hay campos válidos.' }); } params.push(requestId); try { const [result] = await pool.execute( `UPDATE MaintenanceRequests SET ${setClause.join(', ')} WHERE request_id = ?`, params ); if (result.affectedRows === 0) { return res.status(404).json({ message: `Solicitud mant. ID ${requestId} no encontrada.` }); } console.log(`Solicitud mant. ${requestId} actualizada.`); res.status(200).json({ message: 'Solicitud mantenimiento actualizada.' }); } catch (error) { console.error('Error updateMaintenanceRequest:', error); res.status(500).json({ message: 'Error actualizar solicitud.', error: error.message }); } };

// --- NUEVO: Obtener Detalles de una Solicitud de Mantenimiento ---
const getMaintenanceRequestById = async (req, res) => {
    const requestId = req.params.requestId;
    console.log(`GET /api/misc/maintenance-requests/${requestId} por User ID: ${req.user.id}`);
    try {
        const [requestRows] = await pool.execute(
            `SELECT mr.*, u.full_name as customer_name, u.phone_number_primary as customer_phone, c.address_text as customer_address,
             DATE_FORMAT(mr.request_date, '%Y-%m-%d %H:%i') as request_date_formatted,
             DATE_FORMAT(mr.scheduled_date, '%Y-%m-%d %H:%i') as scheduled_date_formatted,
             DATE_FORMAT(mr.completed_date, '%Y-%m-%d %H:%i') as completed_date_formatted
             FROM MaintenanceRequests mr JOIN Users u ON mr.customer_user_id = u.user_id LEFT JOIN Customers c ON mr.customer_user_id = c.user_id
             WHERE mr.request_id = ?`,
            [requestId]
        );
        if (requestRows.length === 0) { return res.status(404).json({ message: `Solicitud ID ${requestId} no encontrada.` }); }
        res.status(200).json(requestRows[0]);
    } catch (error) { console.error('Error getMaintenanceRequestById:', error); res.status(500).json({ message: 'Error obtener detalles solicitud.', error: error.message }); }
};

// --- Exportar ---
module.exports = { submitMaintenanceRequest, listMaintenanceRequests, updateMaintenanceRequest, getMaintenanceRequestById }; // Añadido getMaintenanceRequestById