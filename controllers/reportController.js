// controllers/reportController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');

/**
 * Obtener Reporte de Ventas
 * GET /api/reports/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getSalesReport = async (req, res) => {
    const { startDate, endDate } = req.query;
    console.log(`GET /api/reports/sales por User ID: ${req.user.id}, Fechas: ${startDate} a ${endDate}`);
    
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false,
            message: 'Se requieren fechas de inicio y fin (startDate, endDate)' 
        });
    }
    
    try {
        const [results] = await pool.execute(
            `SELECT 
                DATE(o.order_date) as order_date,
                COUNT(o.order_id) as total_orders,
                SUM(o.total_amount) as total_sales,
                SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as paid_amount,
                SUM(CASE WHEN o.payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled') 
                    THEN o.total_amount ELSE 0 END) as pending_amount
            FROM Orders o
            WHERE DATE(o.order_date) BETWEEN ? AND ?
            GROUP BY DATE(o.order_date)
            ORDER BY DATE(o.order_date)`,
            [startDate, endDate]
        );
        
        // Formatea las fechas y valores monetarios antes de responder
        const formattedResults = results.map(row => ({
            ...row,
            order_date: row.order_date ? row.order_date.toISOString().split('T')[0] : null,
            total_sales: parseFloat(row.total_sales || 0).toFixed(2),
            paid_amount: parseFloat(row.paid_amount || 0).toFixed(2),
            pending_amount: parseFloat(row.pending_amount || 0).toFixed(2)
        }));
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                startDate,
                endDate,
                recordCount: formattedResults.length
            }
        });
        
    } catch (error) {
        console.error('Error en getSalesReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de ventas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Conciliación de Caja
 * GET /api/reports/reconciliation?date=YYYY-MM-DD&repartidorId=X
 */
const getCashReconciliation = async (req, res) => {
    const { date, repartidorId } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0]; // Hoy por defecto
    
    console.log(`GET /api/reports/reconciliation por User ID: ${req.user.id}, Fecha: ${reportDate}, RepartidorID: ${repartidorId || 'todos'}`);
    
    try {
        let query = `
            SELECT 
                u.user_id as repartidor_id,
                u.full_name as repartidor_name,
                COUNT(d.delivery_id) as total_deliveries,
                SUM(CASE WHEN d.collection_method IN ('cash', 'yape_plin', 'transfer') THEN d.amount_collected ELSE 0 END) as total_collected,
                SUM(CASE WHEN d.collection_method = 'cash' THEN d.amount_collected ELSE 0 END) as cash_collected,
                SUM(CASE WHEN d.collection_method = 'yape_plin' THEN d.amount_collected ELSE 0 END) as digital_collected,
                SUM(CASE WHEN d.collection_method = 'transfer' THEN d.amount_collected ELSE 0 END) as transfer_collected,
                SUM(CASE WHEN d.collection_method = 'cobro_pendiente' THEN o.total_amount ELSE 0 END) as pending_amount,
                COUNT(CASE WHEN d.collection_method = 'cobro_pendiente' THEN d.delivery_id END) as pending_count
            FROM 
                Users u
                LEFT JOIN Deliveries d ON u.user_id = d.delivery_person_user_id AND DATE(d.completed_at) = ?
                LEFT JOIN Orders o ON d.order_id = o.order_id
            WHERE 
                u.role_id = (SELECT role_id FROM Roles WHERE role_name = 'repartidor')
                AND u.is_active = TRUE
        `;
        
        const params = [reportDate];
        
        if (repartidorId) {
            query += ` AND u.user_id = ?`;
            params.push(repartidorId);
        }
        
        query += ` GROUP BY u.user_id, u.full_name ORDER BY u.full_name`;
        
        const [results] = await pool.execute(query, params);
        
        // Formatear valores monetarios y asegurar que no sean null
        const formattedResults = results.map(row => ({
            ...row,
            total_collected: parseFloat(row.total_collected || 0).toFixed(2),
            cash_collected: parseFloat(row.cash_collected || 0).toFixed(2),
            digital_collected: parseFloat(row.digital_collected || 0).toFixed(2),
            transfer_collected: parseFloat(row.transfer_collected || 0).toFixed(2),
            pending_amount: parseFloat(row.pending_amount || 0).toFixed(2),
            pending_count: row.pending_count || 0,
            total_deliveries: row.total_deliveries || 0
        }));
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                date: reportDate,
                repartidor_filtrado: repartidorId ? parseInt(repartidorId) : null,
                recordCount: formattedResults.length
            }
        });
        
    } catch (error) {
        console.error('Error en getCashReconciliation:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener conciliación de caja',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Reporte de Pagos Atrasados (Morosos)
 * GET /api/reports/morosos
 */
const getOverduePaymentsReport = async (req, res) => {
    const minDaysOverdue = parseInt(req.query.minDays) || 3; // Por defecto, más de 3 días
    
    console.log(`GET /api/reports/morosos por User ID: ${req.user.id}, Mín. días: ${minDaysOverdue}`);
    
    try {
        const [results] = await pool.execute(
            `SELECT 
                o.order_id,
                u.user_id as customer_id,
                u.full_name as customer_name,
                u.phone_number_primary as customer_phone,
                DATE_FORMAT(o.order_date, '%Y-%m-%d') as order_date,
                DATEDIFF(CURRENT_DATE, o.order_date) as days_overdue,
                o.total_amount,
                c.address_text
            FROM 
                Orders o
                JOIN Users u ON o.customer_user_id = u.user_id
                JOIN Customers c ON u.user_id = c.user_id
            WHERE 
                o.payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled')
                AND o.order_status = 'delivered'
                AND DATEDIFF(CURRENT_DATE, o.order_date) > ?
            ORDER BY 
                days_overdue DESC, o.total_amount DESC`,
            [minDaysOverdue]
        );
        
        // Agrupar por cliente y total pendiente
        const clientMap = new Map();
        results.forEach(row => {
            const clientKey = row.customer_id;
            
            if (!clientMap.has(clientKey)) {
                clientMap.set(clientKey, {
                    customer_id: row.customer_id,
                    customer_name: row.customer_name,
                    customer_phone: row.customer_phone,
                    address: row.address_text,
                    total_amount: 0,
                    max_days_overdue: 0,
                    orders: []
                });
            }
            
            const client = clientMap.get(clientKey);
            client.total_amount += parseFloat(row.total_amount);
            client.max_days_overdue = Math.max(client.max_days_overdue, row.days_overdue);
            client.orders.push({
                order_id: row.order_id,
                order_date: row.order_date,
                days_overdue: row.days_overdue,
                amount: parseFloat(row.total_amount)
            });
        });
        
        // Convertir Map a Array y formatear valores monetarios
        const clientList = Array.from(clientMap.values()).map(client => ({
            ...client,
            total_amount: parseFloat(client.total_amount).toFixed(2)
        }));
        
        // Ordenar por días de mora y monto total
        clientList.sort((a, b) => 
            b.max_days_overdue - a.max_days_overdue || 
            parseFloat(b.total_amount) - parseFloat(a.total_amount)
        );
        
        res.status(200).json({
            success: true,
            data: clientList,
            meta: {
                minDaysOverdue,
                totalClients: clientList.length,
                totalOrders: results.length,
                reportDate: new Date().toISOString().split('T')[0]
            }
        });
        
    } catch (error) {
        console.error('Error en getOverduePaymentsReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de morosos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Reporte de Niveles de Stock
 * GET /api/reports/stock-levels?warehouseId=X
 */
const getStockLevelReport = async (req, res) => {
    const { warehouseId } = req.query;
    console.log(`GET /api/reports/stock-levels por User ID: ${req.user.id}, AlmacénID: ${warehouseId || 'todos'}`);
    
    try {
        let query = `
            SELECT 
                w.warehouse_id,
                w.name as warehouse_name,
                it.item_type,
                it.item_id,
                CASE 
                    WHEN it.item_type = 'cylinder' THEN ct.name
                    WHEN it.item_type = 'other_product' THEN op.name
                    ELSE 'Desconocido'
                END as item_name,
                it.status,
                it.quantity,
                CASE 
                    WHEN it.item_type = 'cylinder' AND it.status = 'full' AND it.quantity < 5 THEN TRUE
                    WHEN it.item_type = 'other_product' AND it.quantity < 10 THEN TRUE
                    ELSE FALSE
                END as is_low_stock
            FROM 
                InventoryStock it
                JOIN Warehouses w ON it.warehouse_id = w.warehouse_id
                LEFT JOIN CylinderTypes ct ON it.item_type = 'cylinder' AND it.item_id = ct.cylinder_type_id
                LEFT JOIN OtherProducts op ON it.item_type = 'other_product' AND it.item_id = op.product_id
            WHERE 1=1`;
        
        const params = [];
        
        if (warehouseId) {
            query += ` AND w.warehouse_id = ?`;
            params.push(warehouseId);
        }
        
        query += ` ORDER BY w.name, it.item_type, it.item_id, it.status`;
        
        const [results] = await pool.execute(query, params);
        
        // Agrupar por almacén 
        const warehouseMap = new Map();
        results.forEach(row => {
            const warehouseKey = row.warehouse_id;
            
            if (!warehouseMap.has(warehouseKey)) {
                warehouseMap.set(warehouseKey, {
                    warehouse_id: row.warehouse_id,
                    warehouse_name: row.warehouse_name,
                    cylinders: [],
                    other_products: [],
                    low_stock_count: 0
                });
            }
            
            const warehouse = warehouseMap.get(warehouseKey);
            const item = {
                id: row.item_id,
                name: row.item_name,
                status: row.status,
                quantity: row.quantity,
                is_low_stock: row.is_low_stock
            };
            
            if (row.is_low_stock) {
                warehouse.low_stock_count++;
            }
            
            if (row.item_type === 'cylinder') {
                // Agrupar por tipo de cilindro
                const cylinderIndex = warehouse.cylinders.findIndex(c => c.id === row.item_id);
                if (cylinderIndex === -1) {
                    warehouse.cylinders.push({
                        id: row.item_id,
                        name: row.item_name,
                        status_counts: {
                            [row.status]: row.quantity
                        },
                        is_low_stock: row.status === 'full' && row.is_low_stock
                    });
                } else {
                    warehouse.cylinders[cylinderIndex].status_counts[row.status] = row.quantity;
                    if (row.status === 'full' && row.is_low_stock) {
                        warehouse.cylinders[cylinderIndex].is_low_stock = true;
                    }
                }
            } else { // other_product
                warehouse.other_products.push(item);
            }
        });
        
        // Convertir Map a Array
        const warehouseList = Array.from(warehouseMap.values());
        
        res.status(200).json({
            success: true,
            data: warehouseList,
            meta: {
                totalWarehouses: warehouseList.length,
                reportDate: new Date().toISOString().split('T')[0],
                filtered_warehouse_id: warehouseId ? parseInt(warehouseId) : null
            }
        });
        
    } catch (error) {
        console.error('Error en getStockLevelReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de niveles de stock',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Reporte de Desempeño de Entregas
 * GET /api/reports/delivery-performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&repartidorId=X
 */
const getDeliveryPerformanceReport = async (req, res) => {
    const { startDate, endDate, repartidorId } = req.query;
    console.log(`GET /api/reports/delivery-performance por User ID: ${req.user.id}`);
    
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false,
            message: 'Se requieren fechas de inicio y fin (startDate, endDate)'
        });
    }
    
    try {
        let query = `
            SELECT 
                u.user_id as repartidor_id,
                u.full_name as repartidor_name,
                COUNT(d.delivery_id) as total_deliveries,
                AVG(TIMESTAMPDIFF(MINUTE, d.assigned_at, d.departed_at)) as avg_response_time_minutes,
                AVG(TIMESTAMPDIFF(MINUTE, d.departed_at, d.completed_at)) as avg_delivery_time_minutes,
                COUNT(CASE WHEN d.has_issue = TRUE THEN d.delivery_id END) as issue_count,
                COUNT(CASE WHEN d.has_issue = TRUE THEN d.delivery_id END) / COUNT(d.delivery_id) * 100 as issue_percentage
            FROM 
                Users u
                LEFT JOIN Deliveries d ON u.user_id = d.delivery_person_user_id 
                    AND DATE(d.completed_at) BETWEEN ? AND ?
            WHERE 
                u.role_id = (SELECT role_id FROM Roles WHERE role_name = 'repartidor')
                AND u.is_active = TRUE`;
        
        const params = [startDate, endDate];
        
        if (repartidorId) {
            query += ` AND u.user_id = ?`;
            params.push(repartidorId);
        }
        
        query += ` GROUP BY u.user_id, u.full_name
                  ORDER BY total_deliveries DESC`;
        
        const [results] = await pool.execute(query, params);
        
        // Formatear resultados
        const formattedResults = results.map(row => ({
            ...row,
            avg_response_time_minutes: row.avg_response_time_minutes ? parseFloat(row.avg_response_time_minutes).toFixed(1) : null,
            avg_delivery_time_minutes: row.avg_delivery_time_minutes ? parseFloat(row.avg_delivery_time_minutes).toFixed(1) : null,
            issue_percentage: row.issue_percentage ? parseFloat(row.issue_percentage).toFixed(1) : 0,
            total_deliveries: row.total_deliveries || 0,
            issue_count: row.issue_count || 0
        }));
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                startDate,
                endDate,
                filtered_repartidor_id: repartidorId ? parseInt(repartidorId) : null,
                recordCount: formattedResults.length
            }
        });
        
    } catch (error) {
        console.error('Error en getDeliveryPerformanceReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de desempeño de entregas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Reporte de Uso de Puntos de Fidelidad
 * GET /api/reports/points-usage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getPointsUsageReport = async (req, res) => {
    const { startDate, endDate } = req.query;
    console.log(`GET /api/reports/points-usage por User ID: ${req.user.id}`);
    
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false,
            message: 'Se requieren fechas de inicio y fin (startDate, endDate)'
        });
    }
    
    try {
        // Resumen por tipo de transacción
        const [summaryResults] = await pool.execute(
            `SELECT 
                lt.reason,
                COUNT(lt.loyalty_tx_id) as transaction_count,
                SUM(lt.points_change) as total_points,
                AVG(lt.points_change) as avg_points_per_transaction
            FROM 
                LoyaltyTransactions lt
            WHERE 
                DATE(lt.transaction_date) BETWEEN ? AND ?
            GROUP BY 
                lt.reason
            ORDER BY 
                total_points DESC`,
            [startDate, endDate]
        );
        
        // Top clientes con mayor uso de puntos
        const [topCustomers] = await pool.execute(
            `SELECT 
                c.user_id as customer_id,
                u.full_name as customer_name,
                COUNT(lt.loyalty_tx_id) as transaction_count,
                SUM(CASE WHEN lt.points_change > 0 THEN lt.points_change ELSE 0 END) as points_earned,
                SUM(CASE WHEN lt.points_change < 0 THEN ABS(lt.points_change) ELSE 0 END) as points_redeemed,
                c.loyalty_points as current_balance
            FROM 
                Customers c
                JOIN Users u ON c.user_id = u.user_id
                JOIN LoyaltyTransactions lt ON c.user_id = lt.customer_user_id
            WHERE 
                DATE(lt.transaction_date) BETWEEN ? AND ?
            GROUP BY 
                c.user_id, u.full_name, c.loyalty_points
            ORDER BY 
                transaction_count DESC
            LIMIT 20`,
            [startDate, endDate]
        );
        
        // Formatear resultados
        const formattedSummary = summaryResults.map(row => ({
            ...row,
            total_points: parseInt(row.total_points),
            avg_points_per_transaction: parseFloat(row.avg_points_per_transaction).toFixed(1),
            transaction_count: parseInt(row.transaction_count)
        }));
        
        const formattedTopCustomers = topCustomers.map(row => ({
            ...row,
            points_earned: parseInt(row.points_earned),
            points_redeemed: parseInt(row.points_redeemed),
            current_balance: parseInt(row.current_balance),
            transaction_count: parseInt(row.transaction_count)
        }));
        
        // Calcular totales
        const totalEarned = formattedTopCustomers.reduce((sum, customer) => sum + customer.points_earned, 0);
        const totalRedeemed = formattedTopCustomers.reduce((sum, customer) => sum + customer.points_redeemed, 0);
        
        res.status(200).json({
            success: true,
            data: {
                summary: formattedSummary,
                topCustomers: formattedTopCustomers
            },
            meta: {
                startDate,
                endDate,
                totalEarned,
                totalRedeemed,
                netChange: totalEarned - totalRedeemed
            }
        });
        
    } catch (error) {
        console.error('Error en getPointsUsageReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de uso de puntos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Resumen Diario (Dashboard)
 * GET /api/reports/daily-summary?date=YYYY-MM-DD
 */
const getDailySummary = async (req, res) => {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0]; // Hoy por defecto
    
    console.log(`GET /api/reports/daily-summary por User ID: ${req.user.id}, Fecha: ${reportDate}`);
    
    try {
        // Obtener ventas del día
        const [salesResults] = await pool.execute(
            `SELECT 
                COUNT(order_id) as total_orders,
                SUM(total_amount) as total_sales,
                COUNT(CASE WHEN payment_status = 'paid' THEN order_id END) as paid_orders,
                SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as paid_amount
            FROM Orders
            WHERE DATE(order_date) = ?`,
            [reportDate]
        );
        
        // Obtener entregas del día
        const [deliveryResults] = await pool.execute(
            `SELECT 
                COUNT(delivery_id) as total_deliveries,
                COUNT(CASE WHEN collection_method != 'cobro_pendiente' AND collection_method != 'not_collected' 
                    THEN delivery_id END) as collected_deliveries,
                SUM(CASE WHEN collection_method IN ('cash', 'yape_plin', 'transfer') 
                    THEN amount_collected ELSE 0 END) as collected_amount
            FROM Deliveries
            WHERE DATE(completed_at) = ?`,
            [reportDate]
        );
        
        // Obtener nuevos clientes del día
        const [newCustomersResults] = await pool.execute(
            `SELECT 
                COUNT(user_id) as new_customers
            FROM Users
            WHERE DATE(created_at) = ? AND role_id = (SELECT role_id FROM Roles WHERE role_name = 'cliente')`,
            [reportDate]
        );
        
        // Combinar resultados y formatear valores monetarios
        const summary = {
            date: reportDate,
            sales: {
                total_orders: salesResults[0]?.total_orders || 0,
                total_sales: parseFloat(salesResults[0]?.total_sales || 0).toFixed(2),
                paid_orders: salesResults[0]?.paid_orders || 0,
                paid_amount: parseFloat(salesResults[0]?.paid_amount || 0).toFixed(2),
                payment_percentage: salesResults[0]?.total_sales ? 
                    (salesResults[0].paid_amount / salesResults[0].total_sales * 100).toFixed(1) : 0
            },
            deliveries: {
                total_deliveries: deliveryResults[0]?.total_deliveries || 0,
                collected_deliveries: deliveryResults[0]?.collected_deliveries || 0,
                collected_amount: parseFloat(deliveryResults[0]?.collected_amount || 0).toFixed(2),
                collection_percentage: deliveryResults[0]?.total_deliveries ? 
                    (deliveryResults[0].collected_deliveries / deliveryResults[0].total_deliveries * 100).toFixed(1) : 0
            },
            new_customers: newCustomersResults[0]?.new_customers || 0
        };
        
        res.status(200).json({
            success: true,
            data: summary
        });
        
    } catch (error) {
        console.error('Error en getDailySummary:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener resumen diario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener KPIs para Dashboard del Gerente
 * GET /api/reports/kpi-summary
 */
const getKpiSummary = async (req, res) => {
    console.log(`GET /api/reports/kpi-summary por User ID: ${req.user.id}`);
    
    try {
        // Ventas del mes actual
        const [monthlySales] = await pool.execute(
            `SELECT 
                SUM(total_amount) as month_sales,
                COUNT(order_id) as month_orders
            FROM Orders
            WHERE MONTH(order_date) = MONTH(CURRENT_DATE()) 
                AND YEAR(order_date) = YEAR(CURRENT_DATE())`
        );
        
        // Ventas del mes anterior (para comparación)
        const [lastMonthSales] = await pool.execute(
            `SELECT 
                SUM(total_amount) as last_month_sales
            FROM Orders
            WHERE MONTH(order_date) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) 
                AND YEAR(order_date) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))`
        );
        
        // Clientes activos (con pedido en últimos 30 días)
        const [activeCustomers] = await pool.execute(
            `SELECT 
                COUNT(DISTINCT customer_user_id) as active_customers
            FROM Orders
            WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`
        );
        
        // Total clientes
        const [totalCustomers] = await pool.execute(
            `SELECT 
                COUNT(user_id) as total_customers
            FROM Users
            WHERE role_id = (SELECT role_id FROM Roles WHERE role_name = 'cliente')`
        );
        
        // Pedidos pendientes
        const [pendingOrders] = await pool.execute(
            `SELECT 
                COUNT(order_id) as pending_orders
            FROM Orders
            WHERE order_status IN ('pending_approval', 'pending_assignment')`
        );
        
        // Pagos pendientes
        const [pendingPayments] = await pool.execute(
            `SELECT 
                COUNT(order_id) as pending_payments,
                SUM(total_amount) as pending_amount
            FROM Orders
            WHERE payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled')`
        );
        
        // Stock bajo
        const [lowStock] = await pool.execute(
            `SELECT 
                COUNT(*) as low_stock_count
            FROM InventoryStock
            WHERE (item_type = 'cylinder' AND status = 'full' AND quantity < 5)
                OR (item_type = 'other_product' AND quantity < 10)`
        );
        
        // Formatear los resultados
        const monthSales = parseFloat(monthlySales[0]?.month_sales || 0);
        const lastMonthSalesAmount = parseFloat(lastMonthSales[0]?.last_month_sales || 0);
        const growthPercentage = lastMonthSalesAmount > 0 ? 
            ((monthSales - lastMonthSalesAmount) / lastMonthSalesAmount * 100) : 0;
        
        const kpiSummary = {
            sales: {
                month_total: monthSales.toFixed(2),
                month_orders: monthlySales[0]?.month_orders || 0,
                last_month_total: lastMonthSalesAmount.toFixed(2),
                growth_percentage: growthPercentage.toFixed(2),
                growth_direction: growthPercentage >= 0 ? 'up' : 'down'
            },
            customers: {
                active: activeCustomers[0]?.active_customers || 0,
                total: totalCustomers[0]?.total_customers || 0,
                active_percentage: totalCustomers[0]?.total_customers ? 
                    ((activeCustomers[0]?.active_customers / totalCustomers[0]?.total_customers) * 100).toFixed(1) : 0
            },
            operations: {
                pending_orders: pendingOrders[0]?.pending_orders || 0,
                pending_payments: pendingPayments[0]?.pending_payments || 0,
                pending_amount: parseFloat(pendingPayments[0]?.pending_amount || 0).toFixed(2),
                low_stock_items: lowStock[0]?.low_stock_count || 0
            }
        };
        
        res.status(200).json({
            success: true,
            data: kpiSummary,
            meta: {
                currentMonth: new Date().toLocaleString('es-PE', { month: 'long', year: 'numeric' }),
                lastMonth: new Date(new Date().setMonth(new Date().getMonth() - 1))
                    .toLocaleString('es-PE', { month: 'long', year: 'numeric' }),
                generatedAt: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error en getKpiSummary:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener resumen de KPIs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Datos para Gráfico de Ventas Mensuales
 * GET /api/reports/monthly-sales-chart
 */
const getMonthlySalesForChart = async (req, res) => {
    console.log(`GET /api/reports/monthly-sales-chart por User ID: ${req.user.id}`);
    
    try {
        // Obtener ventas de los últimos 12 meses
        const [results] = await pool.execute(
            `SELECT 
                DATE_FORMAT(order_date, '%Y-%m') as month,
                SUM(total_amount) as total_sales,
                COUNT(order_id) as order_count
            FROM Orders
            WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(order_date, '%Y-%m')
            ORDER BY month`
        );
        
        // Formatear para presentación
        const chartData = results.map(row => {
            const monthDate = new Date(row.month + '-01'); // Añadir día para crear fecha válida
            const monthName = monthDate.toLocaleString('es-PE', { month: 'short' });
            const yearShort = monthDate.toLocaleString('es-PE', { year: '2-digit' });
            const label = `${monthName} ${yearShort}`;
            
            const totalSales = parseFloat(row.total_sales || 0);
            const orderCount = parseInt(row.order_count || 0);
            const averageTicket = orderCount > 0 ? totalSales / orderCount : 0;
            
            return {
                month: row.month,
                label: label,
                total_sales: totalSales.toFixed(2),
                order_count: orderCount,
                average_ticket: averageTicket.toFixed(2)
            };
        });
        
        res.status(200).json({
            success: true,
            data: chartData,
            meta: {
                labels: chartData.map(item => item.label),
                values: chartData.map(item => parseFloat(item.total_sales)),
                counts: chartData.map(item => item.order_count),
                start_month: chartData.length > 0 ? chartData[0].month : null,
                end_month: chartData.length > 0 ? chartData[chartData.length - 1].month : null
            }
        });
        
    } catch (error) {
        console.error('Error en getMonthlySalesForChart:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener datos para gráfico de ventas mensuales',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Detalle de Conciliación de Caja
 * GET /api/reports/reconciliation/detail?repartidorId=X&date=YYYY-MM-DD
 */
const getReconciliationDetail = async (req, res) => { 
    const reportDate = req.query.date || new Date().toISOString().split('T')[0]; 
    const repartidorId = req.query.repartidorId; 
    const requestingUser = req.user; 
    
    console.log(`GET /api/reports/reconciliation/detail por User ID: ${requestingUser.id}, Fecha: ${reportDate}, RepartidorID: ${repartidorId}`); 
    
    if (!repartidorId) {
        return res.status(400).json({ 
            success: false,
            message: 'El ID del repartidor es requerido'
        });
    }
    
    // Verificar permisos para repartidores (sólo pueden ver sus propios detalles)
    if (requestingUser.role === 'repartidor' && parseInt(requestingUser.id) !== parseInt(repartidorId)) {
        return res.status(403).json({ 
            success: false,
            message: 'No autorizado para ver detalles de otro repartidor'
        });
    }
    
    try { 
        // Obtener detalles de entregas
        const [detailRows] = await pool.execute( 
            `SELECT 
                d.order_id, 
                o.order_status, 
                o.payment_status, 
                DATE_FORMAT(d.completed_at, '%H:%i:%s') as time, 
                u.full_name as custName, 
                d.collection_method as method, 
                d.amount_collected as amount, 
                d.scheduled_collection_time as schedTime, 
                d.delivery_notes as notes, 
                d.has_issue as issue
            FROM 
                Deliveries d 
                JOIN Orders o ON d.order_id = o.order_id 
                JOIN Users u ON o.customer_user_id = u.user_id 
            WHERE 
                d.delivery_person_user_id = ? 
                AND DATE(d.completed_at) = ? 
            ORDER BY 
                d.completed_at ASC`, 
            [repartidorId, reportDate] 
        );
        
        // Obtener datos del repartidor
        const [repartidorInfo] = await pool.execute(
            `SELECT 
                u.user_id, 
                u.full_name as repartidor_name,
                u.phone_number_primary as phone
            FROM 
                Users u
            WHERE 
                u.user_id = ? 
                AND u.role_id = (SELECT role_id FROM Roles WHERE role_name = 'repartidor')`,
            [repartidorId]
        );
        
        // Calcular totales
        let totalCash = 0;
        let totalDigital = 0;
        let totalPending = 0;
        let countIssues = 0;
        
        const formattedDetails = detailRows.map(row => {
            const amount = parseFloat(row.amount || 0);
            
            // Acumular totales
            if (row.method === 'cash') totalCash += amount;
            else if (row.method === 'yape_plin' || row.method === 'transfer') totalDigital += amount;
            else if (row.method === 'cobro_pendiente') totalPending += amount;
            
            if (row.issue) countIssues++;
            
            return {
                ...row,
                amount: amount.toFixed(2),
                issue: row.issue ? true : false
            };
        });
        
        res.status(200).json({
            success: true,
            data: {
                repartidor: repartidorInfo.length > 0 ? {
                    id: repartidorInfo[0].user_id,
                    name: repartidorInfo[0].repartidor_name,
                    phone: repartidorInfo[0].phone
                } : { id: repartidorId, name: 'Repartidor desconocido' },
                details: formattedDetails,
                summary: {
                    total_cash: totalCash.toFixed(2),
                    total_digital: totalDigital.toFixed(2),
                    total_pending: totalPending.toFixed(2),
                    total_deliveries: formattedDetails.length,
                    issue_count: countIssues
                }
            },
            meta: {
                date: reportDate,
                repartidor_id: parseInt(repartidorId)
            }
        });
        
    } catch (error) { 
        console.error('Error en getReconciliationDetail:', error); 
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener detalle de conciliación',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        }); 
    } 
};

/**
 * Generar reporte avanzado (placeholder)
 * GET /api/reports/advanced-placeholder
 */
const getAdvancedPlaceholder = async (req, res) => {
    console.log(`GET /api/reports/advanced-placeholder por User ID: ${req.user.id}`);
    
    // Devolver placeholder con estructura similar a otros reportes
    res.status(200).json({
        success: true,
        data: {
            message: "Reporte avanzado disponible próximamente",
            sections: [
                { 
                    title: "Análisis de Ventas",
                    description: "Proporciona análisis detallado por segmento de cliente, zona geográfica y periodo"
                },
                { 
                    title: "Eficiencia Operativa", 
                    description: "Métricas de desempeño para identificar áreas de mejora en operaciones"
                },
                { 
                    title: "Proyecciones Financieras", 
                    description: "Estimaciones y tendencias basadas en datos históricos"
                }
            ]
        },
        meta: {
            status: "development",
            estimated_release: "Próximamente",
            contact: "Solicite más información al administrador del sistema"
        }
    });
};

/**
 * Obtener Datos para Reporte de Ventas por Producto
 * GET /api/reports/product-sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getProductSalesReport = async (req, res) => {
    const { startDate, endDate } = req.query;
    console.log(`GET /api/reports/product-sales por User ID: ${req.user.id}, Fechas: ${startDate} a ${endDate}`);
    
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false,
            message: 'Se requieren fechas de inicio y fin (startDate, endDate)' 
        });
    }
    
    try {
        // Obtener ventas por producto
        const [results] = await pool.execute(
            `SELECT 
                CASE 
                    WHEN oi.item_type = 'cylinder' THEN 
                        CONCAT(ct.name, ' (', 
                            CASE 
                                WHEN oi.action_type = 'exchange' THEN 'Intercambio'
                                WHEN oi.action_type = 'new_purchase' THEN 'Nuevo'
                                WHEN oi.action_type = 'loan_purchase' THEN 'Préstamo'
                                ELSE oi.action_type
                            END, ')')
                    ELSE op.name
                END as product_name,
                oi.item_type,
                oi.item_id,
                oi.action_type,
                SUM(oi.quantity) as quantity,
                SUM(oi.item_subtotal) as total_amount
            FROM 
                OrderItems oi
                JOIN Orders o ON oi.order_id = o.order_id
                LEFT JOIN CylinderTypes ct ON oi.item_type = 'cylinder' AND oi.item_id = ct.cylinder_type_id
                LEFT JOIN OtherProducts op ON oi.item_type = 'other_product' AND oi.item_id = op.product_id
            WHERE 
                DATE(o.order_date) BETWEEN ? AND ?
                AND o.order_status NOT IN ('cancelled')
            GROUP BY 
                oi.item_type, oi.item_id, oi.action_type
            ORDER BY 
                total_amount DESC`,
            [startDate, endDate]
        );
        
        // Calcular el total para los porcentajes
        let grandTotal = 0;
        results.forEach(row => {
            grandTotal += parseFloat(row.total_amount || 0);
        });
        
        // Formatear resultados
        const formattedResults = results.map(row => {
            const amount = parseFloat(row.total_amount || 0);
            const percentage = grandTotal > 0 ? (amount / grandTotal * 100) : 0;
            
            return {
                ...row,
                product_name: row.product_name || 'Producto desconocido',
                total_amount: amount.toFixed(2),
                percentage_of_total: percentage.toFixed(1),
                quantity: parseInt(row.quantity || 0)
            };
        });
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                startDate,
                endDate,
                recordCount: formattedResults.length,
                grandTotal: grandTotal.toFixed(2)
            }
        });
        
    } catch (error) {
        console.error('Error en getProductSalesReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de ventas por producto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Datos para Reporte de Ranking de Clientes
 * GET /api/reports/customer-ranking?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=X
 */
const getCustomerRankingReport = async (req, res) => {
    const { startDate, endDate, limit = 50 } = req.query;
    console.log(`GET /api/reports/customer-ranking por User ID: ${req.user.id}`);
    
    if (!startDate || !endDate) {
        return res.status(400).json({ 
            success: false,
            message: 'Se requieren fechas de inicio y fin (startDate, endDate)' 
        });
    }
    
    try {
        // Obtener ranking de clientes por ventas
        const [results] = await pool.execute(
            `SELECT 
                u.user_id as customer_id,
                u.full_name as customer_name,
                u.phone_number_primary as customer_phone,
                COUNT(o.order_id) as order_count,
                SUM(o.total_amount) as total_amount,
                MAX(DATE(o.order_date)) as last_purchase_date
            FROM 
                Orders o
                JOIN Users u ON o.customer_user_id = u.user_id
            WHERE 
                DATE(o.order_date) BETWEEN ? AND ?
                AND o.order_status NOT IN ('cancelled')
            GROUP BY 
                u.user_id, u.full_name, u.phone_number_primary
            ORDER BY 
                total_amount DESC
            LIMIT ?`,
            [startDate, endDate, parseInt(limit)]
        );
        
        // Formatear resultados
        const formattedResults = results.map(row => ({
            ...row,
            total_amount: parseFloat(row.total_amount || 0).toFixed(2),
            order_count: parseInt(row.order_count || 0)
        }));
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                startDate,
                endDate,
                recordCount: formattedResults.length
            }
        });
        
    } catch (error) {
        console.error('Error en getCustomerRankingReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener ranking de clientes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener Datos para Reporte de Ajustes de Inventario
 * GET /api/reports/inventory-adjustments?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=X
 */
const getInventoryAdjustmentsReport = async (req, res) => {
    const { startDate, endDate, limit = 100 } = req.query;
    console.log(`GET /api/reports/inventory-adjustments por User ID: ${req.user.id}`);
    
    try {
        // Construir la consulta base
        let query = `
            SELECT 
                il.log_id,
                il.warehouse_id,
                w.name as warehouse_name,
                il.item_type,
                il.item_id,
                CASE 
                    WHEN il.item_type = 'cylinder' THEN ct.name
                    WHEN il.item_type = 'other_product' THEN op.name
                    ELSE 'Desconocido'
                END as product_name,
                il.status_changed_from,
                il.status_changed_to as status_name,
                il.quantity_change,
                il.transaction_type as reason,
                DATE_FORMAT(il.log_timestamp, '%Y-%m-%d %H:%i') as created_at_formatted,
                u.full_name as created_by_name
            FROM 
                InventoryLog il
                JOIN Warehouses w ON il.warehouse_id = w.warehouse_id
                LEFT JOIN CylinderTypes ct ON il.item_type = 'cylinder' AND il.item_id = ct.cylinder_type_id
                LEFT JOIN OtherProducts op ON il.item_type = 'other_product' AND il.item_id = op.product_id
                LEFT JOIN Users u ON il.user_id = u.user_id
            WHERE 1=1
        `;
        
        const params = [];
        
        // Añadir filtros si se proporcionan
        if (startDate && endDate) {
            query += ` AND DATE(il.log_timestamp) BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        
        // Ordenar y limitar
        query += ` ORDER BY il.log_timestamp DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const [results] = await pool.execute(query, params);
        
        // Formatear resultados
        const formattedResults = results.map(row => ({
            ...row,
            quantity_change: parseInt(row.quantity_change)
        }));
        
        res.status(200).json({
            success: true,
            data: formattedResults,
            meta: {
                startDate: startDate || 'all',
                endDate: endDate || 'all',
                recordCount: formattedResults.length
            }
        });
        
    } catch (error) {
        console.error('Error en getInventoryAdjustmentsReport:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al obtener reporte de ajustes de inventario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Exportar reporte a CSV
 * Esta función implementa la exportación de reportes a CSV
 * GET /api/reports/export?reportType=X&startDate=Y&endDate=Z
 */
const exportReportToCSV = async (req, res) => {
    const { reportType, startDate, endDate, repartidorId, warehouseId } = req.query;
    console.log(`GET /api/reports/export por User ID: ${req.user.id}, Tipo: ${reportType}`);
    
    if (!reportType) {
        return res.status(400).json({
            success: false,
            message: 'El tipo de reporte es requerido'
        });
    }
    
    try {
        let data;
        let filename = `reporte_${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
        let contentType = 'text/csv';
        let csvContent = '';
        
        // Obtener datos según el tipo de reporte
        switch (reportType) {
            case 'sales':
                if (!startDate || !endDate) {
                    return res.status(400).json({
                        success: false,
                        message: 'Se requieren fechas de inicio y fin para el reporte de ventas'
                    });
                }
                
                const salesResult = await getSalesReportForExport(startDate, endDate);
                csvContent = generateCSVContent(salesResult);
                break;
                
            case 'reconciliation':
                const date = req.query.date || new Date().toISOString().split('T')[0];
                const reconResult = await getReconciliationForExport(date, repartidorId);
                csvContent = generateCSVContent(reconResult);
                break;
                
            case 'stock':
                const stockResult = await getStockLevelForExport(warehouseId);
                csvContent = generateCSVContent(stockResult);
                break;
                
            // Agregar más casos según los tipos de reportes
                
            default:
                return res.status(400).json({
                    success: false,
                    message: `Tipo de reporte '${reportType}' no soportado para exportación`
                });
        }
        
        // Configurar cabeceras para descargar el archivo
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Enviar el contenido CSV
        res.send(csvContent);
        
    } catch (error) {
        console.error(`Error en exportReportToCSV (${reportType}):`, error);
        res.status(500).json({
            success: false,
            message: 'Error al exportar reporte a CSV',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Función auxiliar para obtener datos de reporte de ventas para exportación
 */
async function getSalesReportForExport(startDate, endDate) {
    const [results] = await pool.execute(
        `SELECT 
            DATE(o.order_date) as fecha,
            COUNT(o.order_id) as total_pedidos,
            SUM(o.total_amount) as total_ventas,
            SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as monto_pagado,
            SUM(CASE WHEN o.payment_status IN ('pending', 'partially_paid', 'late_payment_scheduled') 
                THEN o.total_amount ELSE 0 END) as monto_pendiente
        FROM Orders o
        WHERE DATE(o.order_date) BETWEEN ? AND ?
        GROUP BY DATE(o.order_date)
        ORDER BY DATE(o.order_date)`,
        [startDate, endDate]
    );
    
    return results;
}

/**
 * Función auxiliar para obtener datos de conciliación para exportación
 */
async function getReconciliationForExport(date, repartidorId) {
    let query = `
        SELECT 
            u.full_name as repartidor,
            COUNT(d.delivery_id) as total_entregas,
            SUM(CASE WHEN d.collection_method = 'cash' THEN d.amount_collected ELSE 0 END) as efectivo,
            SUM(CASE WHEN d.collection_method = 'yape_plin' THEN d.amount_collected ELSE 0 END) as digital,
            SUM(CASE WHEN d.collection_method = 'transfer' THEN d.amount_collected ELSE 0 END) as transferencia,
            SUM(CASE WHEN d.collection_method = 'cobro_pendiente' THEN o.total_amount ELSE 0 END) as pendiente
        FROM 
            Users u
            LEFT JOIN Deliveries d ON u.user_id = d.delivery_person_user_id AND DATE(d.completed_at) = ?
            LEFT JOIN Orders o ON d.order_id = o.order_id
        WHERE 
            u.role_id = (SELECT role_id FROM Roles WHERE role_name = 'repartidor')
            AND u.is_active = TRUE
    `;
    
    const params = [date];
    
    if (repartidorId) {
        query += ` AND u.user_id = ?`;
        params.push(repartidorId);
    }
    
    query += ` GROUP BY u.user_id, u.full_name ORDER BY u.full_name`;
    
    const [results] = await pool.execute(query, params);
    return results;
}

/**
 * Función auxiliar para obtener datos de niveles de stock para exportación
 */
async function getStockLevelForExport(warehouseId) {
    let query = `
        SELECT 
            w.name as almacen,
            CASE 
                WHEN it.item_type = 'cylinder' THEN 'Balón'
                WHEN it.item_type = 'other_product' THEN 'Producto'
                ELSE it.item_type
            END as tipo,
            CASE 
                WHEN it.item_type = 'cylinder' THEN ct.name
                WHEN it.item_type = 'other_product' THEN op.name
                ELSE 'Desconocido'
            END as nombre,
            it.status as estado,
            it.quantity as cantidad
        FROM 
            InventoryStock it
            JOIN Warehouses w ON it.warehouse_id = w.warehouse_id
            LEFT JOIN CylinderTypes ct ON it.item_type = 'cylinder' AND it.item_id = ct.cylinder_type_id
            LEFT JOIN OtherProducts op ON it.item_type = 'other_product' AND it.item_id = op.product_id
        WHERE 1=1`;
    
    const params = [];
    
    if (warehouseId) {
        query += ` AND w.warehouse_id = ?`;
        params.push(warehouseId);
    }
    
    query += ` ORDER BY w.name, it.item_type, it.item_id, it.status`;
    
    const [results] = await pool.execute(query, params);
    return results;
}

/**
 * Función auxiliar para generar contenido CSV a partir de datos
 */
function generateCSVContent(data) {
    if (!data || data.length === 0) {
        return 'No hay datos para exportar';
    }
    
    // Obtener encabezados a partir de las propiedades del primer objeto
    const headers = Object.keys(data[0]);
    const headerRow = headers.join(',');
    
    // Generar filas de datos
    const rows = data.map(row => {
        return headers.map(header => {
            // Escapar comillas y encerrar en comillas si contiene comas
            const value = row[header]?.toString() || '';
            const escapedValue = value.replace(/"/g, '""');
            return value.includes(',') ? `"${escapedValue}"` : escapedValue;
        }).join(',');
    });
    
    // Combinar encabezados y filas
    return headerRow + '\n' + rows.join('\n');
}

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
    getProductSalesReport,
    getCustomerRankingReport,
    getInventoryAdjustmentsReport,
    exportReportToCSV
};