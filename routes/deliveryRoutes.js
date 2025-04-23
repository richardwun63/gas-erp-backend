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
const { validate, idParamValidationRules } = require('../validation/validationRules');

// --- Configuración de Multer ---
const UPLOADS_FOLDER_PAYMENTS = './uploads/payment_proofs/';
if (!fs.existsSync(UPLOADS_FOLDER_PAYMENTS)){ 
    fs.mkdirSync(UPLOADS_FOLDER_PAYMENTS, { recursive: true }); 
    console.log(`Carpeta creada: ${UPLOADS_FOLDER_PAYMENTS}`); 
}

const storagePayments = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_FOLDER_PAYMENTS); },
  filename: function (req, file, cb) { 
      const orderId = req.params.orderId || 'ORD_UNK'; 
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); 
      const extension = path.extname(file.originalname); 
      cb(null, `order-${orderId}-${uniqueSuffix}${extension}`); 
  }
});

const fileFilterPayments = (req, file, cb) => { 
    if (file.mimetype.startsWith('image/')) { 
        cb(null, true); 
    } else { 
        cb(new Error('Solo imágenes.'), false); 
    } 
};

const upload = multer({ 
    storage: storagePayments, 
    fileFilter: fileFilterPayments, 
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// --- Definición de Rutas ---
const router = express.Router();

/**
 * @route GET /api/deliveries/assigned/me
 * @desc Obtener mi entrega asignada
 * @access Private - Solo repartidor
 */
router.get('/assigned/me', protect, restrictTo('repartidor'), getMyAssignedDelivery);

/**
 * @route GET /api/deliveries/my-daily-history
 * @desc Obtener mi historial de hoy (Repartidor)
 * @access Private - Solo repartidor
 */
router.get('/my-daily-history', protect, restrictTo('repartidor'), getMyDailyHistory);

/**
 * @route GET /api/deliveries/pending-collection
 * @desc Ver cobros pendientes
 * @access Private - Repartidor, Base
 */
router.get('/pending-collection', protect, restrictTo('repartidor', 'base'), getPendingCollections);

/**
 * @route PUT /api/deliveries/:orderId/start
 * @desc Marcar inicio de ruta
 * @access Private - Solo repartidor
 */
router.put('/:orderId/start', 
    protect, 
    restrictTo('repartidor'), 
    idParamValidationRules('orderId'),
    validate,
    startDelivery
);

/**
 * @route POST /api/deliveries/:orderId/complete
 * @desc Marcar entrega completada
 * @access Private - Solo repartidor
 */
router.post('/:orderId/complete', 
    protect, 
    restrictTo('repartidor'), 
    idParamValidationRules('orderId'),
    validate,
    upload.single('paymentProof'), // Middleware multer para subir imagen de comprobante
    completeDelivery
);

/**
 * @route POST /api/deliveries/:orderId/issue
 * @desc Repartidor reporta un problema
 * @access Private - Solo repartidor
 */
router.post('/:orderId/issue', 
    protect, 
    restrictTo('repartidor'),
    idParamValidationRules('orderId'),
    validate,
    reportDeliveryIssue
);

/**
 * @route POST /api/deliveries/:orderId/collect-payment
 * @desc Registrar cobro de pendiente
 * @access Private - Solo repartidor
 */
router.post('/:orderId/collect-payment', 
    protect, 
    restrictTo('repartidor'),
    idParamValidationRules('orderId'),
    validate,
    registerCollectedPayment
);

module.exports = router;