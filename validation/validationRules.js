// validation/validationRules.js
// Reglas de validación para entradas de datos
const { body, param, query, validationResult } = require('express-validator');

// --- Middleware de Validación ---
/**
 * Verifica errores de validación y devuelve respuesta de error si los hay
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función next de Express
 * @returns {void}
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            message: 'Error de validación', 
            errors: errors.array().map(err => ({ field: err.param, message: err.msg }))
        });
    }
    next();
};

// --- Reglas para Validación de IDs en Parámetros ---
/**
 * Valida que un parámetro de URL sea un ID numérico válido
 * @param {string} paramName - Nombre del parámetro a validar
 * @returns {Array} - Array de middlewares de validación
 */
const idParamValidationRules = (paramName) => {
    return [
        param(paramName)
            .notEmpty().withMessage(`El parámetro ${paramName} es requerido`)
            .isInt({ min: 1 }).withMessage(`El parámetro ${paramName} debe ser un número entero positivo`),
        validate
    ];
};

// --- Reglas para Validación de Parámetros de Paginación ---
/**
 * Valida parámetros comunes de paginación (page, limit, sort)
 * @returns {Array} - Array de middlewares de validación
 */
const listPaginationValidationRules = () => {
    return [
        query('page').optional().isInt({ min: 1 }).withMessage('El número de página debe ser un entero positivo'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe ser un entero entre 1 y 100'),
        query('sortBy').optional().isString().withMessage('El campo de ordenamiento debe ser un texto válido'),
        query('sortOrder').optional().isIn(['ASC', 'DESC', 'asc', 'desc']).withMessage('El orden debe ser ASC o DESC'),
        validate
    ];
};

// --- Reglas para Validación de Creación de Pedidos ---
/**
 * Valida datos para la creación de un nuevo pedido
 * @returns {Array} - Array de middlewares de validación
 */
const createOrderValidationRules = () => {
    return [
        body('cylinder_type_id')
            .optional()
            .isInt({ min: 1 }).withMessage('El tipo de cilindro debe ser un ID válido'),
        
        body('action_type')
            .optional()
            .isIn(['exchange', 'new_purchase', 'loan_purchase']).withMessage('Tipo de acción inválido'),
        
        body('cylinder_quantity')
            .optional()
            .isInt({ min: 0, max: 10 }).withMessage('La cantidad debe ser entre 0 y 10'),
        
        body('delivery_address_text')
            .notEmpty().withMessage('La dirección de entrega es requerida')
            .isString().withMessage('La dirección debe ser texto válido')
            .isLength({ min: 5, max: 255 }).withMessage('La dirección debe tener entre 5 y 255 caracteres'),
        
        body('other_items')
            .optional()
            .isArray().withMessage('Los otros productos deben ser un array'),
        
        body('other_items.*.product_id')
            .optional()
            .isInt({ min: 1 }).withMessage('ID de producto inválido'),
        
        body('other_items.*.quantity')
            .optional()
            .isInt({ min: 1, max: 20 }).withMessage('La cantidad debe ser entre 1 y 20'),
        
        validate
    ];
};

// --- Reglas para Validación de Ajuste de Stock ---
/**
 * Valida datos para ajuste de inventario
 * @returns {Array} - Array de middlewares de validación
 */
const adjustStockValidationRules = () => {
    return [
        body('warehouse_id')
            .notEmpty().withMessage('ID del almacén es requerido')
            .isInt({ min: 1 }).withMessage('ID de almacén inválido'),
        
        body('item_id')
            .notEmpty().withMessage('ID del item es requerido')
            .isInt({ min: 1 }).withMessage('ID de item inválido'),
        
        body('item_type')
            .notEmpty().withMessage('Tipo de item es requerido')
            .isIn(['cylinder', 'other_product']).withMessage('Tipo de item debe ser cylinder o other_product'),
        
        body('status')
            .notEmpty().withMessage('Estado del item es requerido')
            .isString().withMessage('Estado debe ser texto válido'),
        
        body('quantity_change')
            .notEmpty().withMessage('Cambio de cantidad es requerido')
            .isInt().withMessage('Cambio de cantidad debe ser un número entero'),
        
        body('reason')
            .notEmpty().withMessage('Motivo del ajuste es requerido')
            .isString().withMessage('Motivo debe ser texto válido')
            .isLength({ min: 3, max: 255 }).withMessage('Motivo debe tener entre 3 y 255 caracteres'),
        
        validate
    ];
};

// --- Reglas para Validación de Reportes de Problemas ---
/**
 * Valida datos para reportar problemas de entrega
 * @returns {Array} - Array de middlewares de validación
 */
const reportIssueValidationRules = () => {
    return [
        body('issue_notes')
            .notEmpty().withMessage('La descripción del problema es requerida')
            .isString().withMessage('La descripción debe ser texto válido')
            .isLength({ min: 5, max: 500 }).withMessage('La descripción debe tener entre 5 y 500 caracteres'),
        
        validate
    ];
};

// --- Reglas para Validación de Verificación de Pagos ---
/**
 * Valida datos para verificar/aprobar un pago
 * @returns {Array} - Array de middlewares de validación
 */
const verifyPaymentValidationRules = () => {
    return [
        body('approved')
            .notEmpty().withMessage('El estatus de aprobación es requerido')
            .isBoolean().withMessage('El valor debe ser true o false'),
        
        body('notes')
            .optional()
            .isString().withMessage('Las notas deben ser texto válido')
            .isLength({ max: 255 }).withMessage('Las notas no deben exceder 255 caracteres'),
        
        validate
    ];
};

// --- Reglas para Validación de Redención de Puntos ---
/**
 * Valida datos para canjeo de puntos de fidelidad
 * @returns {Array} - Array de middlewares de validación
 */
const redeemPointsValidationRules = () => {
    return [
        body('points_to_redeem')
            .notEmpty().withMessage('La cantidad de puntos es requerida')
            .isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero positivo'),
        
        validate
    ];
};

// --- Reglas para Validación de Precios Especiales ---
/**
 * Valida datos para establecer precios especiales a clientes
 * @returns {Array} - Array de middlewares de validación
 */
const setPricesValidationRules = () => {
    return [
        body('prices')
            .isArray().withMessage('Los precios deben ser un array'),
        
        body('prices.*.cylinder_type_id')
            .isInt({ min: 1 }).withMessage('ID de tipo de cilindro inválido'),
        
        body('prices.*.price_exchange')
            .isFloat({ min: 0.01 }).withMessage('El precio debe ser un número positivo'),
        
        validate
    ];
};

// --- Reglas para Validación de Ajuste de Puntos ---
/**
 * Valida datos para ajuste de puntos de fidelidad
 * @returns {Array} - Array de middlewares de validación
 */
const adjustPointsValidationRules = () => {
    return [
        body('points_change')
            .notEmpty().withMessage('El cambio de puntos es requerido')
            .isInt().withMessage('El cambio debe ser un número entero'),
        
        body('reason')
            .notEmpty().withMessage('El motivo es requerido')
            .isIn(['manual_adjustment', 'promo_earn', 'birthday_bonus', 'correction']).withMessage('Motivo inválido'),
        
        body('notes')
            .optional()
            .isString().withMessage('Las notas deben ser texto válido'),
        
        validate
    ];
};

// --- Reglas para Validación de Actualización de Usuario ---
/**
 * Valida datos para actualización de usuario (empleado)
 * @returns {Array} - Array de middlewares de validación
 */
const updateUserValidationRules = () => {
    return [
        body('full_name')
            .optional()
            .isString().withMessage('El nombre debe ser texto válido')
            .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres'),
        
        body('username')
            .optional()
            .isString().withMessage('El usuario debe ser texto válido')
            .isLength({ min: 3, max: 50 }).withMessage('El usuario debe tener entre 3 y 50 caracteres')
            .matches(/^[a-zA-Z0-9_]+$/).withMessage('El usuario solo puede contener letras, números y guion bajo'),
        
        body('phone_number_primary')
            .optional()
            .isString().withMessage('El teléfono debe ser texto válido')
            .matches(/^\d{9,15}$/).withMessage('El teléfono debe tener entre 9 y 15 dígitos'),
        
        body('email')
            .optional()
            .isEmail().withMessage('Debe ser un email válido'),
        
        body('default_warehouse_id')
            .optional()
            .isInt({ min: 1 }).withMessage('ID de almacén inválido'),
        
        validate
    ];
};

// --- Reglas para Validación de Creación de Empleado ---
/**
 * Valida datos para creación de un nuevo empleado
 * @returns {Array} - Array de middlewares de validación
 */
const createEmployeeValidationRules = () => {
    return [
        body('full_name')
            .notEmpty().withMessage('El nombre completo es requerido')
            .isString().withMessage('El nombre debe ser texto válido')
            .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres'),
        
        body('username')
            .notEmpty().withMessage('El nombre de usuario es requerido')
            .isString().withMessage('El usuario debe ser texto válido')
            .isLength({ min: 3, max: 50 }).withMessage('El usuario debe tener entre 3 y 50 caracteres')
            .matches(/^[a-zA-Z0-9_]+$/).withMessage('El usuario solo puede contener letras, números y guion bajo'),
        
        body('password')
            .notEmpty().withMessage('La contraseña es requerida')
            .isString().withMessage('La contraseña debe ser texto válido')
            .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
        
        body('role_name')
            .notEmpty().withMessage('El rol es requerido')
            .isIn(['repartidor', 'base', 'contabilidad', 'gerente']).withMessage('Rol inválido'),
        
        validate
    ];
};

// --- Exportar Funciones ---
module.exports = {
    validate,
    idParamValidationRules,
    listPaginationValidationRules,
    createOrderValidationRules,
    adjustStockValidationRules,
    reportIssueValidationRules,
    verifyPaymentValidationRules,
    redeemPointsValidationRules,
    setPricesValidationRules,
    adjustPointsValidationRules,
    updateUserValidationRules,
    createEmployeeValidationRules
};