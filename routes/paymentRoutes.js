// routes/paymentRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, query } = require('express-validator');

const {
    uploadProof,
    getPendingPayments,
    verifyPayment,
    uploadReceiptFile,
    listUploadedReceipts,
    getOrderPaymentHistory,
    searchOrderForReceipt
} = require('../controllers/paymentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, idParamValidationRules, verifyPaymentValidationRules } = require('../validation/validationRules');

// --- Configuración Multer para Archivos de Pago ---
const UPLOADS_FOLDER_PROOFS = './uploads/payment_proofs/';
const UPLOADS_FOLDER_RECEIPTS = './uploads/receipts/';

// Crear carpetas si no existen
if (!fs.existsSync(UPLOADS_FOLDER_PROOFS)) { 
    fs.mkdirSync(UPLOADS_FOLDER_PROOFS, { recursive: true }); 
    console.log(`Carpeta creada: ${UPLOADS_FOLDER_PROOFS}`); 
}
if (!fs.existsSync(UPLOADS_FOLDER_RECEIPTS)) {
    fs.mkdirSync(UPLOADS_FOLDER_RECEIPTS, { recursive: true });
    console.log(`Carpeta creada: ${UPLOADS_FOLDER_RECEIPTS}`);
}

// Configuración para almacenamiento de comprobantes de pago
const storageProofs = multer.diskStorage({ 
    destination: function(req, file, cb) { 
        cb(null, UPLOADS_FOLDER_PROOFS); 
    }, 
    filename: function(req, file, cb) { 
        const userId = req.user?.id || 'UNK'; 
        const uniqueSuffix = Date.now(); 
        const ext = path.extname(file.originalname);
        cb(null, `user-${userId}-proof-${uniqueSuffix}${ext}`); 
    } 
});

// Configuración para almacenamiento de recibos/facturas
const storageReceipts = multer.diskStorage({ 
    destination: function(req, file, cb) { 
        cb(null, UPLOADS_FOLDER_RECEIPTS); 
    }, 
    filename: function(req, file, cb) { 
        const orderId = req.params.orderId || 'UNK'; 
        const uniqueSuffix = Date.now(); 
        const ext = path.extname(file.originalname);
        cb(null, `order-${orderId}-receipt-${uniqueSuffix}${ext}`); 
    } 
});

// Filtros para tipos de archivos
const fileFilterImages = function(req, file, cb) {
    // Validar que sea una imagen
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('El archivo debe ser una imagen (JPG, PNG, etc).'), false);
    }
};

const fileFilterPdf = function(req, file, cb) {
    // Validar que sea un PDF
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('El archivo debe ser un PDF.'), false);
    }
};

// Middlewares multer configurados
const uploadProofMw = multer({ 
    storage: storageProofs, 
    fileFilter: fileFilterImages, 
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    } 
});

const uploadReceiptMw = multer({ 
    storage: storageReceipts, 
    fileFilter: fileFilterPdf, 
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    } 
});

// --- Definición del Router ---
const router = express.Router();

/**
 * @route POST /api/payments/proof
 * @desc Cliente sube comprobante de pago (imagen)
 * @access Private - Solo clientes
 */
router.post('/proof',
    protect,
    restrictTo('cliente'),
    uploadProofMw.single('paymentProof'),
    [
        body('orderId').notEmpty().withMessage('ID del pedido requerido').isInt({ min: 1 }).withMessage('ID de pedido inválido'),
        body('paymentMethod').notEmpty().withMessage('Método de pago requerido')
            .isIn(['yape_plin', 'transfer', 'other']).withMessage('Método de pago inválido'),
        body('amount').notEmpty().withMessage('Monto requerido').isNumeric().withMessage('Monto debe ser numérico'),
        body('transactionReference').optional().isString().withMessage('Referencia de transacción debe ser texto'),
        body('notes').optional().isString().withMessage('Notas deben ser texto'),
        validate
    ],
    uploadProof
);

/**
 * @route GET /api/payments/pending-verification
 * @desc Contabilidad obtiene pagos pendientes de verificar
 * @access Private - Solo contabilidad
 */
router.get('/pending-verification',
    protect,
    restrictTo('contabilidad'),
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
        query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
        validate
    ],
    getPendingPayments
);

/**
 * @route GET /api/payments/search-order-for-receipt
 * @desc Buscar pedido para adjuntar recibo
 * @access Private - Solo contabilidad
 */
router.get('/search-order-for-receipt',
    protect,
    restrictTo('contabilidad'),
    [
        query('term').notEmpty().withMessage('Término de búsqueda requerido')
            .isString().withMessage('Término de búsqueda inválido'),
        validate
    ],
    searchOrderForReceipt
);

/**
 * @route GET /api/payments/order/:orderId/history
 * @desc Obtener historial de pagos de un pedido
 * @access Private - Usuarios autenticados
 */
router.get('/order/:orderId/history',
    protect,
    idParamValidationRules('orderId'),
    validate,
    getOrderPaymentHistory
);

/**
 * @route PUT /api/payments/:paymentId/verify
 * @desc Contabilidad verifica/rechaza un pago
 * @access Private - Solo contabilidad
 */
router.put('/:paymentId/verify',
    protect,
    restrictTo('contabilidad'),
    idParamValidationRules('paymentId'),
    verifyPaymentValidationRules(),
    verifyPayment
);

/**
 * @route POST /api/payments/receipt/:orderId
 * @desc Contabilidad sube recibo/factura (PDF)
 * @access Private - Solo contabilidad
 */
router.post('/receipt/:orderId',
    protect,
    restrictTo('contabilidad'),
    idParamValidationRules('orderId'),
    uploadReceiptMw.single('receiptFile'),
    uploadReceiptFile
);

/**
 * @route GET /api/payments/receipts
 * @desc Listar recibos/facturas subidos
 * @access Private - Solo contabilidad
 */
router.get('/receipts',
    protect,
    restrictTo('contabilidad'),
    [
        query('startDate').optional().isDate().withMessage('Fecha inicial inválida'),
        query('endDate').optional().isDate().withMessage('Fecha final inválida'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
        query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
        validate
    ],
    listUploadedReceipts
);

module.exports = router;