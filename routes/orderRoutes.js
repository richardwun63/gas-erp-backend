// routes/orderRoutes.js
const express = require('express');
const { body, query } = require('express-validator');

const {
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
} = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { createOrderValidationRules, idParamValidationRules, validate, listPaginationValidationRules } = require('../validation/validationRules');

const router = express.Router();

/**
 * @route POST /api/orders/
 * @desc Crear nuevo pedido de gas o productos
 * @access Private - Solo clientes
 */
router.post('/', 
    protect, 
    restrictTo('cliente'), 
    // Comenta estas líneas temporalmente
    // createOrderValidationRules(), 
    // validate,
    createOrder
);

/**
 * @route GET /api/orders/my-history
 * @desc Obtener historial de pedidos del cliente autenticado
 * @access Private - Solo clientes
 */
router.get('/my-history', 
    protect, 
    restrictTo('cliente'), 
    listPaginationValidationRules(),
    validate,
    getMyOrderHistory
);

/**
 * @route GET /api/orders/pending
 * @desc Obtener pedidos pendientes de asignación/entrega
 * @access Private - Base, Repartidor
 */
router.get('/pending', 
    protect, 
    restrictTo('base', 'repartidor'),
    [
        query('status').optional().isString().withMessage('Estado de pedido inválido'),
        query('warehouseId').optional().isInt({min: 0}).withMessage('ID de almacén inválido'),
        query('limit').optional().isInt({min: 1, max: 100}).withMessage('Límite debe ser entre 1 y 100'),
        query('page').optional().isInt({min: 1}).withMessage('Página debe ser un número positivo'),
        validate
    ], 
    getPendingOrders
);

/**
 * @route GET /api/orders/pending-approval
 * @desc Obtener pedidos pendientes de aprobación
 * @access Private - Base, Gerente
 */
router.get('/pending-approval', 
    protect, 
    restrictTo('base', 'gerente'),
    listPaginationValidationRules(),
    validate, 
    getPendingApprovalOrders
);

/**
 * @route POST /api/orders/bulk-approve
 * @desc Aprobar múltiples pedidos a la vez
 * @access Private - Base, Gerente
 */
router.post('/bulk-approve', 
    protect, 
    restrictTo('base', 'gerente'),
    [
        body('order_ids').isArray().withMessage('Se requiere un array de IDs de pedidos'),
        body('order_ids.*').isInt({ min: 1 }).withMessage('IDs de pedidos inválidos'),
        validate
    ],
    bulkApproveOrders
);

/**
 * @route GET /api/orders/active
 * @desc Obtener pedidos activos/en proceso
 * @access Private - Base, Gerente
 */
router.get('/active', 
    protect, 
    restrictTo('base', 'gerente'),
    listPaginationValidationRules(),
    validate, 
    getActiveOrders
);

/**
 * @route GET /api/orders/:id
 * @desc Obtener detalles de un pedido específico
 * @access Private - Cualquier usuario autenticado
 */
router.get('/:id', 
    protect, 
    idParamValidationRules('id'),
    validate,
    getOrderById
);

/**
 * @route GET /api/orders/:id/delivery
 * @desc Obtener detalles de entrega de un pedido
 * @access Private - Base, Repartidor, Gerente, Cliente (dueño)
 */
router.get('/:id/delivery', 
    protect,
    idParamValidationRules('id'),
    validate,
    getOrderDeliveryDetails
);

/**
 * @route PUT /api/orders/:id/assign
 * @desc Asignar pedido a un repartidor
 * @access Private - Base
 */
router.put('/:id/assign', 
    protect, 
    restrictTo('base'), 
    idParamValidationRules('id'),
    [
        body('deliveryPersonUserId')
            .notEmpty().withMessage('ID del repartidor es requerido')
            .isInt({ min: 1 }).withMessage('ID de repartidor inválido'),
        validate
    ],
    assignOrder
);

/**
 * @route PUT /api/orders/:id/take
 * @desc Repartidor toma un pedido disponible
 * @access Private - Repartidor
 */
router.put('/:id/take', 
    protect, 
    restrictTo('repartidor'), 
    idParamValidationRules('id'),
    validate,
    takeOrder
);

/**
 * @route PUT /api/orders/:id/cancel
 * @desc Cancelar un pedido
 * @access Private - Cliente (propio), Base, Gerente
 */
router.put('/:id/cancel', 
    protect, 
    restrictTo('cliente', 'base', 'gerente'), 
    idParamValidationRules('id'),
    [
        body('cancel_reason')
            .optional()
            .isString().withMessage('La razón debe ser texto válido')
            .isLength({ max: 255 }).withMessage('Razón demasiado larga'),
        validate
    ],
    cancelOrder
);

module.exports = router;