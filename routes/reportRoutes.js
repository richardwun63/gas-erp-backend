// routes/reportRoutes.js
const express = require('express');
const { query } = require('express-validator');
const { 
    getSalesReport, 
    getCashReconciliation, 
    getOverduePaymentsReport, 
    getStockLevelReport, 
    getDeliveryPerformanceReport, 
    getPointsUsageReport, 
    getDailySummary, 
    getKpiSummary, 
    getMonthlySalesForChart, 
    getReconciliationDetail, 
    getAdvancedPlaceholder,
    getGerenteDashboardData
} = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate } = require('../validation/validationRules');

const router = express.Router();

// Middleware de protección para todas las rutas
router.use(protect);

// Middlewares de autorización por tipo de acceso
const canViewReports = restrictTo('contabilidad', 'gerente', 'base');
const canViewAdvanced = restrictTo('gerente');
// Modificado: Permitir al repartidor acceder al detalle de reconciliación
const canViewDetailRecon = restrictTo('contabilidad', 'gerente', 'base', 'repartidor');
// Nuevo: Permitir al repartidor acceder a su propio reporte de conciliación
const canViewRecon = restrictTo('contabilidad', 'gerente', 'base', 'repartidor');

/**
 * @route GET /api/reports/kpi-summary
 * @desc Obtener resumen de KPIs para dashboard
 * @access Private - Solo gerente
 */
router.get('/kpi-summary', 
    canViewAdvanced, 
    getKpiSummary
);

/**
 * @route GET /api/reports/monthly-sales-chart
 * @desc Obtener datos para gráfico de ventas mensuales
 * @access Private - Solo gerente
 */
router.get('/monthly-sales-chart', 
    canViewAdvanced, 
    getMonthlySalesForChart
);

/**
 * @route GET /api/reports/dashboard/gerente
 * @desc Obtiene datos para el dashboard del gerente
 * @access Private - Solo gerente
 */
router.get('/dashboard/gerente', 
    canViewAdvanced, 
    getGerenteDashboardData
);

/**
 * @route GET /api/reports/daily-summary
 * @desc Obtener resumen diario consolidado
 * @access Private - Roles con acceso a reportes
 */
router.get('/daily-summary', 
    canViewReports, 
    [
        query('date').optional().isDate().withMessage('Fecha debe tener formato YYYY-MM-DD'),
        validate
    ],
    getDailySummary
);

/**
 * @route GET /api/reports/sales
 * @desc Obtener reporte de ventas por periodo
 * @access Private - Roles con acceso a reportes
 */
router.get('/sales', 
    canViewReports, 
    [
        query('startDate').notEmpty().withMessage('Fecha inicial requerida').isDate().withMessage('Fecha inicial inválida'),
        query('endDate').notEmpty().withMessage('Fecha final requerida').isDate().withMessage('Fecha final inválida'),
        validate
    ],
    getSalesReport
);

/**
 * @route GET /api/reports/reconciliation
 * @desc Obtener reporte de conciliación de caja
 * @access Private - Roles con acceso a reportes incluyendo repartidor
 */
router.get('/reconciliation', 
    canViewRecon, // Cambiado: Permitir al repartidor acceder
    [
        query('date').optional().isDate().withMessage('Fecha debe tener formato YYYY-MM-DD'),
        query('repartidorId').optional().isInt({ min: 1 }).withMessage('ID de repartidor inválido'),
        validate
    ],
    getCashReconciliation
);

/**
 * @route GET /api/reports/reconciliation/detail
 * @desc Obtener detalle de conciliación por repartidor
 * @access Private - Roles específicos incluyendo repartidor (que ve su propio detalle)
 */
router.get('/reconciliation/detail', 
    canViewDetailRecon, 
    [
        query('date').optional().isDate().withMessage('Fecha debe tener formato YYYY-MM-DD'),
        query('repartidorId').notEmpty().withMessage('ID de repartidor requerido')
            .isInt({ min: 1 }).withMessage('ID de repartidor inválido'),
        validate
    ],
    getReconciliationDetail
);

/**
 * @route GET /api/reports/morosos
 * @desc Obtener reporte de clientes con pagos atrasados
 * @access Private - Contabilidad, Gerente
 */
router.get('/morosos', 
    restrictTo('contabilidad', 'gerente'), 
    [
        query('minDays').optional().isInt({ min: 1 }).withMessage('Días mínimos debe ser un número positivo'),
        validate
    ],
    getOverduePaymentsReport
);

/**
 * @route GET /api/reports/stock-levels
 * @desc Obtener reporte de niveles de stock por almacén
 * @access Private - Roles con acceso a reportes
 */
router.get('/stock-levels', 
    canViewReports, 
    [
        query('warehouseId').optional().isInt({ min: 1 }).withMessage('ID de almacén inválido'),
        query('onlyLowStock').optional().isBoolean().withMessage('onlyLowStock debe ser true o false'),
        validate
    ],
    getStockLevelReport
);

/**
 * @route GET /api/reports/delivery-performance
 * @desc Obtener reporte de desempeño de repartidores
 * @access Private - Base, Gerente
 */
router.get('/delivery-performance', 
    restrictTo('base', 'gerente'), 
    [
        query('startDate').notEmpty().withMessage('Fecha inicial requerida').isDate().withMessage('Fecha inicial inválida'),
        query('endDate').notEmpty().withMessage('Fecha final requerida').isDate().withMessage('Fecha final inválida'),
        query('repartidorId').optional().isInt({ min: 1 }).withMessage('ID de repartidor inválido'),
        validate
    ],
    getDeliveryPerformanceReport
);

/**
 * @route GET /api/reports/points-usage
 * @desc Obtener reporte de uso de puntos de fidelidad
 * @access Private - Contabilidad, Gerente
 */
router.get('/points-usage', 
    restrictTo('contabilidad', 'gerente'), 
    [
        query('startDate').notEmpty().withMessage('Fecha inicial requerida').isDate().withMessage('Fecha inicial inválida'),
        query('endDate').notEmpty().withMessage('Fecha final requerida').isDate().withMessage('Fecha final inválida'),
        validate
    ],
    getPointsUsageReport
);

/**
 * @route GET /api/reports/advanced-placeholder
 * @desc Placeholder para reportes avanzados (a implementar)
 * @access Private - Solo gerente
 */
router.get('/advanced-placeholder', 
    canViewAdvanced, 
    getAdvancedPlaceholder
);

module.exports = router;