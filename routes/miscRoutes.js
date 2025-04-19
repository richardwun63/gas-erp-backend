// routes/miscRoutes.js
const express = require('express');
const {
    submitMaintenanceRequest,
    listMaintenanceRequests,
    updateMaintenanceRequest,
    getMaintenanceRequestById // <-- Nuevo
} = require('../controllers/miscController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// --- Rutas Misceláneas ---

// POST /api/misc/maintenance-request : Cliente envía solicitud
router.post('/maintenance-request', protect, restrictTo('cliente'), submitMaintenanceRequest);

// GET /api/misc/maintenance-requests : Ver solicitudes (Base/Gerente)
router.get('/maintenance-requests', protect, restrictTo('base', 'gerente'), listMaintenanceRequests);

// GET /api/misc/maintenance-requests/:requestId : Ver detalle solicitud (Base/Gerente)
router.get('/maintenance-requests/:requestId', protect, restrictTo('base', 'gerente'), getMaintenanceRequestById); // <-- NUEVA RUTA

// PUT /api/misc/maintenance-requests/:requestId : Actualizar solicitud (Base/Gerente)
router.put('/maintenance-requests/:requestId', protect, restrictTo('base', 'gerente'), updateMaintenanceRequest);


module.exports = router;