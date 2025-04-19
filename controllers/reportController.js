// controllers/reportController.js
const pool = require('../db/db');
const { validationResult } = require('express-validator');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

/**
 * @route GET /api/reports/kpi-summary
 * @desc Obtener resumen de KPIs para dashboard
 * @access Private - Solo gerente
 */
const getKpiSummary = async (req, res) => {
    try {
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const kpiData = {
            data: {
                sales: {
                    month_total: 12580.50, // Total ventas mes
                    month_orders: 145, // Número de pedidos mes
                    growth_percentage: 12.5, // Porcentaje de crecimiento vs mes anterior
                    last_month_total: 11180.20 // Total ventas mes anterior
                },
                customers: {
                    active: 78, // Clientes activos último mes
                    active_percentage: 65, // % del total de clientes
                    total: 120, // Total clientes registrados
                    new_last_month: 8 // Nuevos clientes último mes
                },
                operations: {
                    pending_orders: 5, // Pedidos pendientes
                    pending_payments: 3, // Pagos pendientes
                    pending_amount: 450.00, // Monto total pendiente
                    low_stock_items: 2 // Items con stock bajo
                }
            }
        };

        return res.status(200).json(kpiData);
    } catch (error) {
        console.error('Error en getKpiSummary:', error);
        return res.status(500).json({ 
            message: 'Error al obtener resumen de KPIs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/monthly-sales-chart
 * @desc Obtener datos para gráfico de ventas mensuales
 * @access Private - Solo gerente
 */
const getMonthlySalesForChart = async (req, res) => {
    try {
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const chartData = {
            data: [
                { month: '2025-01', total_sales: 10240.50 },
                { month: '2025-02', total_sales: 11180.20 },
                { month: '2025-03', total_sales: 12580.50 }
            ]
        };

        return res.status(200).json(chartData);
    } catch (error) {
        console.error('Error en getMonthlySalesForChart:', error);
        return res.status(500).json({ 
            message: 'Error al obtener datos para gráfico',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/dashboard/gerente
 * @desc Obtiene datos para el dashboard del gerente
 * @access Private - Solo gerente
 */
const getGerenteDashboardData = async (req, res) => {
    try {
        // Obtener datos de resumen para el dashboard
        const data = {
            kpis: {
                // Datos de KPIs básicos
                sales: {
                    month_total: 12580.50, // Total ventas mes
                    month_orders: 145, // Número de pedidos mes
                    growth_percentage: 12.5, // Porcentaje de crecimiento vs mes anterior
                    last_month_total: 11180.20 // Total ventas mes anterior
                },
                customers: {
                    active: 78, // Clientes activos último mes
                    active_percentage: 65, // % del total de clientes
                    total: 120, // Total clientes registrados
                    new_last_month: 8 // Nuevos clientes último mes
                },
                operations: {
                    pending_orders: 5, // Pedidos pendientes
                    pending_payments: 3, // Pagos pendientes
                    pending_amount: 450.00, // Monto total pendiente
                    low_stock_items: 2 // Items con stock bajo
                }
            },
            salesData: [
                { month: '2025-01', amount: 10240.50, orders: 125 },
                { month: '2025-02', amount: 11180.20, orders: 137 },
                { month: '2025-03', amount: 12580.50, orders: 145 }
            ],
            inventoryStatus: [
                { product: 'Balón 10kg', stock: 25, minStock: 10 },
                { product: 'Balón 5kg', stock: 15, minStock: 8 },
                { product: 'Balón 15kg', stock: 8, minStock: 5 },
                { product: 'Balón 45kg', stock: 4, minStock: 3 }
            ],
            topProducts: [
                { name: 'Balón 10kg', quantity: 78, sales: 3783.00 },
                { name: 'Balón 5kg', quantity: 45, sales: 1125.00 },
                { name: 'Balón 15kg', quantity: 32, sales: 2240.00 },
                { name: 'Válvula Regular', quantity: 15, sales: 225.00 },
                { name: 'Manguera Premium', quantity: 12, sales: 96.00 }
            ],
            recentOrders: [
                { id: 1045, date: '2025-04-18', customer: 'Ana Flores', status: 'delivered', amount: 48.50 },
                { id: 1044, date: '2025-04-18', customer: 'Luis Pérez', status: 'delivering', amount: 97.00 },
                { id: 1043, date: '2025-04-17', customer: 'Restaurante El Sabor', status: 'delivered', amount: 210.00 },
                { id: 1042, date: '2025-04-17', customer: 'María Rojas', status: 'delivered', amount: 48.50 },
                { id: 1041, date: '2025-04-16', customer: 'Ana Flores', status: 'delivered', amount: 48.50 }
            ]
        };

        return res.status(200).json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error en getGerenteDashboardData:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Error al obtener datos del dashboard',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/daily-summary
 * @desc Obtener resumen diario consolidado
 * @access Private - Roles con acceso a reportes
 */
const getDailySummary = async (req, res) => {
    try {
        // Fecha específica o fecha actual
        const reportDate = req.query.date ? new Date(req.query.date) : new Date();
        
        // Formato de fecha para SQL YYYY-MM-DD
        const formattedDate = reportDate.toISOString().split('T')[0];
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const summary = {
            date: formattedDate,
            sales: {
                total_orders: 15,
                total_amount: 752.50,
                average_ticket: 50.17
            },
            inventory: {
                cylinders_sold: 18,
                accessories_sold: 5,
                cylinders_refilled: 12
            },
            deliveries: {
                completed: 14,
                pending: 1,
                reported_issues: 0
            },
            payments: {
                cash: 450.50,
                digital: 302.00,
                pending: 0.00
            }
        };

        return res.status(200).json(summary);
    } catch (error) {
        console.error('Error en getDailySummary:', error);
        return res.status(500).json({ 
            message: 'Error al obtener resumen diario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/sales
 * @desc Obtener reporte de ventas por periodo
 * @access Private - Roles con acceso a reportes
 */
const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Validación de fechas
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Fechas inicial y final son requeridas' });
        }
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const data = [
            { order_date: '2025-04-15', total_orders: 12, total_sales: 584.00 },
            { order_date: '2025-04-16', total_orders: 9, total_sales: 436.50 },
            { order_date: '2025-04-17', total_orders: 15, total_sales: 752.50 },
            { order_date: '2025-04-18', total_orders: 11, total_sales: 533.50 }
        ];
        
        const summary = {
            period: {
                startDate,
                endDate
            },
            totals: {
                orders: 47,
                sales: 2306.50
            }
        };

        return res.status(200).json({
            data,
            summary
        });
    } catch (error) {
        console.error('Error en getSalesReport:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de ventas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/reconciliation
 * @desc Obtener reporte de conciliación de caja
 * @access Private - Roles con acceso a reportes
 */
const getCashReconciliation = async (req, res) => {
    try {
        const { date, repartidorId } = req.query;
        
        // Fecha específica o fecha actual
        const reportDate = date ? new Date(date) : new Date();
        
        // Formato de fecha para SQL YYYY-MM-DD
        const formattedDate = reportDate.toISOString().split('T')[0];
        
        // Si se especifica un repartidor, filtrar solo para ese repartidor
        // De lo contrario, obtener datos consolidados de todos los repartidores
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const data = [
            {
                delivery_person_id: 11,
                delivery_person_name: "Carlos Quispe Mendoza",
                total_deliveries: 8,
                cash_collected: 291.00,
                digital_collected: 145.50,
                pending_collection: 0.00,
                expected_total: 436.50
            },
            {
                delivery_person_id: 21,
                delivery_person_name: "Miguel Torres Pérez",
                total_deliveries: 7,
                cash_collected: 230.00,
                digital_collected: 145.00,
                pending_collection: 0.00,
                expected_total: 375.00
            }
        ];
        
        // Si se especificó un repartidor, filtrar
        let filteredData = data;
        if (repartidorId) {
            filteredData = data.filter(r => r.delivery_person_id == repartidorId);
        }
        
        // Calcular totales generales
        const totals = {
            deliveries: filteredData.reduce((sum, item) => sum + item.total_deliveries, 0),
            cash: filteredData.reduce((sum, item) => sum + item.cash_collected, 0),
            digital: filteredData.reduce((sum, item) => sum + item.digital_collected, 0),
            pending: filteredData.reduce((sum, item) => sum + item.pending_collection, 0),
            expected: filteredData.reduce((sum, item) => sum + item.expected_total, 0)
        };

        return res.status(200).json({
            date: formattedDate,
            data: filteredData,
            totals
        });
    } catch (error) {
        console.error('Error en getCashReconciliation:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de conciliación',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/reconciliation/detail
 * @desc Obtener detalle de conciliación por repartidor
 * @access Private - Roles específicos incluyendo repartidor (que ve su propio detalle)
 */
const getReconciliationDetail = async (req, res) => {
    try {
        const { date, repartidorId } = req.query;
        
        // Fecha específica o fecha actual
        const reportDate = date ? new Date(date) : new Date();
        
        // Formato de fecha para SQL YYYY-MM-DD
        const formattedDate = reportDate.toISOString().split('T')[0];
        
        // Verificar permisos: repartidor solo puede ver su propio detalle
        if (req.user.role === 'repartidor' && req.user.id != repartidorId) {
            return res.status(403).json({ message: 'No tienes permiso para ver este detalle' });
        }
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const deliveryPerson = {
            id: repartidorId,
            name: "Carlos Quispe Mendoza"
        };
        
        const deliveries = [
            {
                order_id: 1042,
                time: "10:15",
                customer_name: "María Rojas",
                order_status: "delivered",
                collection_method: "cash",
                amount_collected: 48.50
            },
            {
                order_id: 1043,
                time: "11:30",
                customer_name: "Restaurante El Sabor",
                order_status: "delivered",
                collection_method: "transfer",
                amount_collected: 210.00
            },
            {
                order_id: 1044,
                time: "14:45",
                customer_name: "Luis Pérez",
                order_status: "delivered",
                collection_method: "yape_plin",
                amount_collected: 97.00
            },
            {
                order_id: 1045,
                time: "16:20",
                customer_name: "Ana Flores",
                order_status: "delivered",
                collection_method: "cash",
                amount_collected: 48.50
            }
        ];
        
        // Calcular totales
        const totals = {
            deliveries: deliveries.length,
            cash: deliveries.filter(d => d.collection_method === 'cash')
                  .reduce((sum, d) => sum + d.amount_collected, 0),
            digital: deliveries.filter(d => ['yape_plin', 'transfer'].includes(d.collection_method))
                    .reduce((sum, d) => sum + d.amount_collected, 0),
            pending: deliveries.filter(d => ['cobro_pendiente', 'not_collected'].includes(d.collection_method))
                    .reduce((sum, d) => sum + d.amount_collected, 0)
        };
        
        totals.total = totals.cash + totals.digital + totals.pending;

        return res.status(200).json({
            date: formattedDate,
            delivery_person: deliveryPerson,
            deliveries,
            totals
        });
    } catch (error) {
        console.error('Error en getReconciliationDetail:', error);
        return res.status(500).json({ 
            message: 'Error al obtener detalle de conciliación',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/morosos
 * @desc Obtener reporte de clientes con pagos atrasados
 * @access Private - Contabilidad, Gerente
 */
const getOverduePaymentsReport = async (req, res) => {
    try {
        const { minDays } = req.query;
        
        // Por defecto, considerar morosos con 3+ días de atraso
        const daysThreshold = minDays ? parseInt(minDays) : 3;
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const data = [
            {
                customer_id: 5,
                customer_name: "Luis Pérez Cárdenas",
                phone: "922222222",
                orders: [ 1022, 1035 ],
                total_amount: 145.50,
                days_overdue: 8
            },
            {
                customer_id: 7,
                customer_name: "Restaurante El Sabor",
                phone: "944444444",
                orders: [ 1038 ],
                total_amount: 210.00,
                days_overdue: 5
            }
        ];
        
        // Filtrar por el umbral de días si es necesario
        const filteredData = data.filter(item => item.days_overdue >= daysThreshold);
        
        // Calcular total
        const totalAmount = filteredData.reduce((sum, item) => sum + item.total_amount, 0);

        return res.status(200).json({
            threshold_days: daysThreshold,
            overdue_customers: filteredData.length,
            total_amount: totalAmount,
            data: filteredData
        });
    } catch (error) {
        console.error('Error en getOverduePaymentsReport:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de pagos atrasados',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/stock-levels
 * @desc Obtener reporte de niveles de stock por almacén
 * @access Private - Roles con acceso a reportes
 */
const getStockLevelReport = async (req, res) => {
    try {
        const { warehouseId, onlyLowStock } = req.query;
        
        // Por defecto, incluir todos los almacenes a menos que se especifique uno
        // Por defecto, mostrar todos los items a menos que se soliciten solo los de stock bajo
        
        let connection;
        try {
            connection = await pool.getConnection();
            
            // Consulta para obtener almacenes activos
            const [warehouses] = await connection.execute(
                `SELECT warehouse_id, name FROM warehouses WHERE is_active = 1`
            );
            
            // Datos de ejemplo (en producción, estos vendrían de la base de datos)
            const stockData = [
                {
                    warehouse_id: 1,
                    warehouse_name: "Principal (Centro)",
                    items: [
                        { id: 1, name: "Balón 5kg", type: "cylinder", status: "full", quantity: 15, min_stock: 8, is_low: false },
                        { id: 2, name: "Balón 10kg", type: "cylinder", status: "full", quantity: 25, min_stock: 10, is_low: false },
                        { id: 3, name: "Balón 15kg", type: "cylinder", status: "full", quantity: 8, min_stock: 5, is_low: false },
                        { id: 4, name: "Balón 45kg", type: "cylinder", status: "full", quantity: 4, min_stock: 3, is_low: false },
                        { id: 1, name: "Manguera Premium", type: "other", status: "available", quantity: 5, min_stock: 10, is_low: true }
                    ]
                },
                {
                    warehouse_id: 2,
                    warehouse_name: "Almacén Norte",
                    items: [
                        { id: 1, name: "Balón 5kg", type: "cylinder", status: "full", quantity: 10, min_stock: 8, is_low: false },
                        { id: 2, name: "Balón 10kg", type: "cylinder", status: "full", quantity: 12, min_stock: 10, is_low: false },
                        { id: 1, name: "Manguera Premium", type: "other", status: "available", quantity: 0, min_stock: 5, is_low: true }
                    ]
                }
            ];
            
            // Filtrar por almacén si se especifica
            let filteredData = stockData;
            if (warehouseId) {
                filteredData = stockData.filter(w => w.warehouse_id == warehouseId);
            }
            
            // Preparar datos para la respuesta
            const result = filteredData.flatMap(warehouse => {
                // Filtrar items por stock bajo si se solicita
                const filteredItems = onlyLowStock === 'true' ?
                    warehouse.items.filter(item => item.is_low) :
                    warehouse.items;
                
                // Formatear items para la respuesta
                return filteredItems.map(item => ({
                    warehouse_id: warehouse.warehouse_id,
                    warehouse_name: warehouse.warehouse_name,
                    item_id: item.id,
                    item_name: item.name,
                    item_type: item.type,
                    status: item.status,
                    quantity: item.quantity,
                    min_stock: item.min_stock,
                    is_low_stock: item.is_low
                }));
            });
            
            return res.status(200).json({
                warehouses,
                data: result,
                total_items: result.length,
                low_stock_items: result.filter(item => item.is_low_stock).length
            });
        } finally {
            if (connection) connection.release();
        }
    } catch (error) {
        console.error('Error en getStockLevelReport:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de niveles de stock',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/delivery-performance
 * @desc Obtener reporte de desempeño de repartidores
 * @access Private - Base, Gerente
 */
const getDeliveryPerformanceReport = async (req, res) => {
    try {
        const { startDate, endDate, repartidorId } = req.query;
        
        // Validación de fechas
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Fechas inicial y final son requeridas' });
        }
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const data = [
            {
                delivery_person_id: 11,
                delivery_person_name: "Carlos Quispe Mendoza",
                total_deliveries: 45,
                on_time_deliveries: 42,
                delayed_deliveries: 3,
                on_time_percentage: 93.3,
                average_time: 28, // minutos
                reported_issues: 1,
                total_collected: 2180.50,
                rating: 4.8
            },
            {
                delivery_person_id: 21,
                delivery_person_name: "Miguel Torres Pérez",
                total_deliveries: 38,
                on_time_deliveries: 35,
                delayed_deliveries: 3,
                on_time_percentage: 92.1,
                average_time: 32, // minutos
                reported_issues: 2,
                total_collected: 1845.00,
                rating: 4.6
            }
        ];
        
        // Si se especificó un repartidor, filtrar
        let filteredData = data;
        if (repartidorId) {
            filteredData = data.filter(r => r.delivery_person_id == repartidorId);
            if (filteredData.length === 0) {
                return res.status(404).json({ message: 'Repartidor no encontrado o sin datos en el período' });
            }
        }
        
        // Calcular totales y promedios
        const totals = {
            deliveries: filteredData.reduce((sum, r) => sum + r.total_deliveries, 0),
            on_time: filteredData.reduce((sum, r) => sum + r.on_time_deliveries, 0),
            delayed: filteredData.reduce((sum, r) => sum + r.delayed_deliveries, 0),
            issues: filteredData.reduce((sum, r) => sum + r.reported_issues, 0),
            collected: filteredData.reduce((sum, r) => sum + r.total_collected, 0)
        };
        
        totals.on_time_percentage = (totals.deliveries > 0) ?
            ((totals.on_time / totals.deliveries) * 100).toFixed(1) : 0;
        
        totals.avg_time = filteredData.length > 0 ? 
            (filteredData.reduce((sum, r) => sum + r.average_time, 0) / filteredData.length).toFixed(1) : 0;
        
        totals.avg_rating = filteredData.length > 0 ? 
            (filteredData.reduce((sum, r) => sum + r.rating, 0) / filteredData.length).toFixed(1) : 0;

        return res.status(200).json({
            period: {
                startDate,
                endDate
            },
            data: filteredData,
            totals
        });
    } catch (error) {
        console.error('Error en getDeliveryPerformanceReport:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de desempeño de repartidores',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/points-usage
 * @desc Obtener reporte de uso de puntos de fidelidad
 * @access Private - Contabilidad, Gerente
 */
const getPointsUsageReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Validación de fechas
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Fechas inicial y final son requeridas' });
        }
        
        // Datos de ejemplo (en producción, estos vendrían de la base de datos)
        const data = {
            earned: [
                { reason: 'purchase_earn', points: 1250, count: 85, description: 'Puntos por compras' },
                { reason: 'referral_bonus_earn', points: 150, count: 3, description: 'Bonos por referidos' },
                { reason: 'birthday_bonus', points: 100, count: 2, description: 'Bonos de cumpleaños' }
            ],
            redeemed: [
                { reason: 'redemption_spend', points: 800, count: 4, value: 80.00, description: 'Canjes de puntos por descuentos' }
            ]
        };
        
        // Calcular totales
        const totals = {
            total_earned: data.earned.reduce((sum, item) => sum + item.points, 0),
            total_redeemed: data.redeemed.reduce((sum, item) => sum + item.points, 0),
            monetary_value: data.redeemed.reduce((sum, item) => sum + (item.value || 0), 0)
        };
        
        // Calcular balance
        totals.balance = totals.total_earned - totals.total_redeemed;
        
        // Calcular porcentaje de uso (redeemed/earned)
        totals.usage_percentage = totals.total_earned > 0 ? 
            ((totals.total_redeemed / totals.total_earned) * 100).toFixed(1) : 0;

        return res.status(200).json({
            period: {
                startDate,
                endDate
            },
            data,
            totals
        });
    } catch (error) {
        console.error('Error en getPointsUsageReport:', error);
        return res.status(500).json({ 
            message: 'Error al obtener reporte de uso de puntos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route GET /api/reports/advanced-placeholder
 * @desc Placeholder para reportes avanzados (a implementar)
 * @access Private - Solo gerente
 */
const getAdvancedPlaceholder = async (req, res) => {
    try {
        return res.status(200).json({
            message: 'API para reportes avanzados (placeholder)',
            available_reports: [
                'financial_analysis',
                'customer_segmentation',
                'predictive_sales',
                'route_optimization'
            ],
            status: 'in_development'
        });
    } catch (error) {
        console.error('Error en getAdvancedPlaceholder:', error);
        return res.status(500).json({ 
            message: 'Error en placeholder de reportes avanzados',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Exportar controladores
module.exports = {
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
};