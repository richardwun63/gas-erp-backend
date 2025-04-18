// routes/deliveryRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    getMyAssignedDelivery,
    startDelivery,
    completeDelivery,
    reportDeliveryIssue,
    getPendingCollections,
    registerCollectedPayment,
    getMyDailyHistory // <-- Nueva
} = require('../controllers/deliveryController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// --- Configuración de Multer ---
const UPLOADS_FOLDER_PAYMENTS = './uploads/payment_proofs/';
if (!fs.existsSync(UPLOADS_FOLDER_PAYMENTS)){ fs.mkdirSync(UPLOADS_FOLDER_PAYMENTS, { recursive: true }); console.log(`Carpeta creada: ${UPLOADS_FOLDER_PAYMENTS}`); }
const storagePayments = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_FOLDER_PAYMENTS); },
  filename: function (req, file, cb) { const orderId = req.params.orderId || 'ORD_UNK'; const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); const extension = path.extname(file.originalname); cb(null, `order-${orderId}-${uniqueSuffix}${extension}`); }
});
const fileFilterPayments = (req, file, cb) => { if (file.mimetype.startsWith('image/')) { cb(null, true); } else { cb(new Error('Solo imágenes.'), false); } };
const upload = multer({ storage: storagePayments, fileFilter: fileFilterPayments, limits: { fileSize: 5 * 1024 * 1024 } });

// --- Definición de Rutas ---
const router = express.Router();

// GET /api/deliveries/assigned/me : Obtener mi entrega asignada
router.get('/assigned/me', protect, restrictTo('repartidor'), getMyAssignedDelivery);

// GET /api/deliveries/my-daily-history : Obtener mi historial de hoy (Repartidor)
router.get('/my-daily-history', protect, restrictTo('repartidor'), getMyDailyHistory); // <-- NUEVA RUTA

// GET /api/deliveries/pending-collection : Ver cobros pendientes
router.get('/pending-collection', protect, restrictTo('repartidor', 'base'), getPendingCollections);

// PUT /api/deliveries/:orderId/start : Marcar inicio de ruta
router.put('/:orderId/start', protect, restrictTo('repartidor'), startDelivery);

// POST /api/deliveries/:orderId/complete : Marcar entrega completada
router.post('/:orderId/complete', protect, restrictTo('repartidor'), upload.single('paymentProof'), completeDelivery );

// POST /api/deliveries/:orderId/issue : Repartidor reporta un problema
router.post('/:orderId/issue', protect, restrictTo('repartidor'), reportDeliveryIssue);

// POST /api/deliveries/:orderId/collect-payment : Registrar cobro de pendiente
router.post('/:orderId/collect-payment', protect, restrictTo('repartidor'), registerCollectedPayment);


module.exports = router;