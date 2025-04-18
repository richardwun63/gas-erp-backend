// routes/inventoryRoutes.js
const express = require('express');
const { 
    viewStockByWarehouse, 
    viewTotalStock, 
    viewSupplierLoans, 
    addSupplierLoan, 
    returnSupplierLoan,
    adjustStock,
    viewInventoryLog,
    transferStock
} = require('../controllers/inventoryController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { 
    validate, 
    idParamValidationRules, 
    adjustStockValidationRules 
} = require('../validation/validationRules');
const { body, query } = require('express-validator');

const router = express.Router();

/**
 * @route GET /api/inventory/stock
 * @desc Ver stock actual por almacén
 * @access Private - Base, Contabilidad, Gerente
 */
router.get('/stock', 
    protect, 
    restrictTo('base', 'contabilidad', 'gerente', 'repartidor'),
    [
        query('warehouseId').optional().isInt({ min: 1 }).withMessage('ID de almacén inválido'),
        validate
    ],
    viewStockByWarehouse
);

/**
 * @route GET /api/inventory/stock/total
 * @desc Ver stock total consolidado de todos los almacenes
 * @access Private - Base, Contabilidad, Gerente
 */
router.get('/stock/total', 
    protect, 
    restrictTo('base', 'contabilidad', 'gerente'),
    viewTotalStock
);

/**
 * @route GET /api/inventory/supplier-loans
 * @desc Ver préstamos actuales del proveedor
 * @access Private - Contabilidad, Gerente
 */
router.get('/supplier-loans', 
    protect, 
    restrictTo('contabilidad', 'gerente'),
    viewSupplierLoans
);

/**
 * @route GET /api/inventory/log
 * @desc Ver log de movimientos de inventario
 * @access Private - Gerente, Contabilidad
 */
router.get('/log', 
    protect, 
    restrictTo('gerente', 'contabilidad'),
    [
        query('warehouseId').notEmpty().withMessage('ID de almacén requerido').isInt({ min: 1 }).withMessage('ID de almacén inválido'),
        query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('Límite debe ser entre 1 y 500'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset debe ser un número positivo'),
        validate
    ],
    viewInventoryLog
);

/**
 * @route POST /api/inventory/supplier-loans
 * @desc Registrar nuevo préstamo de proveedor
 * @access Private - Gerente
 */
router.post('/supplier-loans', 
    protect, 
    restrictTo('gerente'),
    [
        body('cylinder_type_id').notEmpty().withMessage('ID del tipo de cilindro requerido').isInt({ min: 1 }).withMessage('ID de tipo de cilindro inválido'),
        body('quantity').notEmpty().withMessage('Cantidad requerida').isInt({ min: 1 }).withMessage('Cantidad debe ser un número positivo'),
        body('loan_date').optional().isDate().withMessage('Fecha inválida'),
        body('supplier_info').optional().isString().withMessage('Información de proveedor debe ser texto'),
        body('notes').optional().isString().withMessage('Notas deben ser texto'),
        validate
    ],
    addSupplierLoan
);

/**
 * @route DELETE /api/inventory/supplier-loans/:loanId
 * @desc Registrar devolución de préstamo de proveedor
 * @access Private - Gerente
 */
router.delete('/supplier-loans/:loanId', 
    protect, 
    restrictTo('gerente'), 
    idParamValidationRules('loanId'),
    returnSupplierLoan
);

/**
 * @route POST /api/inventory/adjust
 * @desc Ajustar stock de inventario
 * @access Private - Gerente
 */
router.post('/adjust', 
    protect, 
    restrictTo('gerente'),
    adjustStockValidationRules(),
    adjustStock
);

/**
 * @route POST /api/inventory/transfer
 * @desc Transferir stock entre almacenes
 * @access Private - Gerente
 */
router.post('/transfer', 
    protect, 
    restrictTo('gerente'),
    [
        body('source_warehouse_id').notEmpty().withMessage('Almacén origen requerido').isInt({ min: 1 }).withMessage('ID de almacén origen inválido'),
        body('target_warehouse_id').notEmpty().withMessage('Almacén destino requerido').isInt({ min: 1 }).withMessage('ID de almacén destino inválido'),
        body('item_id').notEmpty().withMessage('ID del item requerido').isInt({ min: 1 }).withMessage('ID de item inválido'),
        body('item_type').notEmpty().withMessage('Tipo de item requerido').isIn(['cylinder', 'other_product']).withMessage('Tipo de item debe ser cylinder o other_product'),
        body('status').notEmpty().withMessage('Estado requerido').isString().withMessage('Estado debe ser texto'),
        body('quantity').notEmpty().withMessage('Cantidad requerida').isInt({ min: 1 }).withMessage('Cantidad debe ser número positivo'),
        body('notes').optional().isString().withMessage('Notas deben ser texto'),
        validate
    ],
    transferStock
);

module.exports = router;