// controllers/inventoryController.js (VERSIÓN CORREGIDA)
const pool = require('../db/db');

/**
 * Ver stock actual por almacén
 * GET /api/inventory/stock?warehouseId=X
 */
const viewStockByWarehouse = async (req, res) => {
    // Obtener ID de almacén de la query o del usuario (si tiene uno por defecto) o usar 1 como fallback
    const warehouseId = req.query.warehouseId || req.user?.default_warehouse_id || 1;
    console.log(`GET /api/inventory/stock?warehouseId=${warehouseId} por User ID: ${req.user.id}`);
    
    try {
        // Verificar que el almacén existe
        const [warehouseRows] = await pool.execute(
            'SELECT name FROM Warehouses WHERE warehouse_id = ?',
            [warehouseId]
        );
        
        // Nombre del almacén para la respuesta
        const warehouseName = warehouseRows.length > 0 ? warehouseRows[0].name : `ID ${warehouseId}`;
        
        // Obtener stock de cilindros con todos sus estados
        const [cylinderStock] = await pool.execute(
            `SELECT 
                inv.item_id as id, 
                ct.name, 
                SUM(CASE WHEN inv.status='full' THEN inv.quantity ELSE 0 END) AS full_qty, 
                SUM(CASE WHEN inv.status='empty' THEN inv.quantity ELSE 0 END) AS empty_qty, 
                SUM(CASE WHEN inv.status='damaged' THEN inv.quantity ELSE 0 END) AS damaged_qty, 
                SUM(CASE WHEN inv.status='loaned_to_customer' THEN inv.quantity ELSE 0 END) AS loaned_qty,
                SUM(inv.quantity) as total_qty
            FROM InventoryStock inv 
            JOIN CylinderTypes ct ON inv.item_id = ct.cylinder_type_id 
            WHERE inv.warehouse_id = ? AND inv.item_type = 'cylinder'
            GROUP BY inv.item_id, ct.name 
            ORDER BY ct.cylinder_type_id`,
            [warehouseId]
        );
        
        // Marcar balones con stock bajo
        cylinderStock.forEach(item => {
            // Si hay menos de 5 balones llenos, se considera stock bajo
            item.is_low_stock = (item.full_qty < 5);
        });
        
        // Obtener stock de otros productos
        const [otherProductsStock] = await pool.execute(
            `SELECT 
                inv.item_id as id, 
                op.name, 
                inv.quantity as stock_qty,
                op.stock_unit
            FROM InventoryStock inv 
            JOIN OtherProducts op ON inv.item_id = op.product_id 
            WHERE inv.warehouse_id = ? AND inv.item_type = 'other_product' AND inv.status = 'available'
            ORDER BY op.name`,
            [warehouseId]
        );
        
        // Marcar productos con stock bajo
        otherProductsStock.forEach(item => {
            // Si hay menos de 10 unidades, se considera stock bajo
            item.is_low_stock = (item.stock_qty < 10);
        });
        
        // Enviar respuesta estructurada
        res.status(200).json({
            warehouse: {
                id: parseInt(warehouseId),
                name: warehouseName
            },
            cylinders: cylinderStock,
            otherProducts: otherProductsStock
        });
        
    } catch (error) {
        console.error(`Error en viewStockByWarehouse para almacén ${warehouseId}:`, error);
        res.status(500).json({ 
            message: 'Error al obtener inventario del almacén.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Ver stock total combinado de todos los almacenes
 * GET /api/inventory/stock/total
 */
const viewTotalStock = async (req, res) => {
    console.log(`GET /api/inventory/stock/total por User ID: ${req.user.id}`);
    
    try {
        // Obtener totales de cilindros por tipo y estado
        const [totalCylinders] = await pool.execute(
            `SELECT 
                inv.item_id as id, 
                ct.name, 
                SUM(CASE WHEN inv.status='full' THEN inv.quantity ELSE 0 END) AS total_full, 
                SUM(CASE WHEN inv.status='empty' THEN inv.quantity ELSE 0 END) AS total_empty, 
                SUM(CASE WHEN inv.status='damaged' THEN inv.quantity ELSE 0 END) AS total_damaged, 
                SUM(CASE WHEN inv.status='loaned_to_customer' THEN inv.quantity ELSE 0 END) AS total_loaned
            FROM InventoryStock inv 
            JOIN CylinderTypes ct ON inv.item_id = ct.cylinder_type_id 
            WHERE inv.item_type = 'cylinder'
            GROUP BY inv.item_id, ct.name 
            ORDER BY ct.cylinder_type_id`
        );
        
        // Obtener totales de otros productos
        const [totalOtherProducts] = await pool.execute(
            `SELECT 
                inv.item_id as id, 
                op.name, 
                SUM(inv.quantity) as total_stock,
                op.stock_unit
            FROM InventoryStock inv 
            JOIN OtherProducts op ON inv.item_id = op.product_id 
            WHERE inv.item_type = 'other_product' AND inv.status = 'available'
            GROUP BY inv.item_id, op.name 
            ORDER BY op.name`
        );
        
        // Obtener préstamos de proveedores
        const [supplierLoans] = await pool.execute(
            `SELECT 
                sl.cylinder_type_id as id, 
                ct.name, 
                SUM(sl.quantity) as total_loaned_qty
            FROM SupplierLoanedStock sl 
            JOIN CylinderTypes ct ON sl.cylinder_type_id = ct.cylinder_type_id 
            GROUP BY sl.cylinder_type_id, ct.name`
        );
        
        // Enviar respuesta estructurada
        res.status(200).json({
            totalCylinders,
            totalOtherProducts,
            supplierLoans
        });
        
    } catch (error) {
        console.error('Error en viewTotalStock:', error);
        res.status(500).json({ 
            message: 'Error al obtener el inventario total.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Ver préstamos activos de proveedores
 * GET /api/inventory/supplier-loans
 */
const viewSupplierLoans = async (req, res) => {
    console.log(`GET /api/inventory/supplier-loans por User ID: ${req.user.id}`);
    
    try {
        const [loans] = await pool.execute(
            `SELECT 
                sl.loan_id, 
                sl.cylinder_type_id, 
                ct.name as cylinder_name, 
                sl.quantity, 
                DATE_FORMAT(sl.loan_date, '%Y-%m-%d') as loan_date_formatted, 
                sl.supplier_info, 
                sl.notes
            FROM SupplierLoanedStock sl 
            JOIN CylinderTypes ct ON sl.cylinder_type_id = ct.cylinder_type_id 
            ORDER BY ct.name, sl.loan_date DESC`
        );
        
        res.status(200).json(loans);
        
    } catch (error) {
        console.error('Error en viewSupplierLoans:', error);
        res.status(500).json({ 
            message: 'Error al obtener préstamos de proveedores.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Registrar nuevo préstamo de proveedor
 * POST /api/inventory/supplier-loans
 */
const addSupplierLoan = async (req, res) => {
    const { cylinder_type_id, quantity, loan_date, supplier_info, notes } = req.body;
    
    console.log(`POST /api/inventory/supplier-loans por User ID: ${req.user.id}`);
    console.log("Datos recibidos:", req.body);
    
    // Validaciones básicas
    if (!cylinder_type_id) {
        return res.status(400).json({ message: 'El tipo de cilindro es requerido.' });
    }
    
    if (!quantity || quantity <= 0 || !Number.isInteger(Number(quantity))) {
        return res.status(400).json({ message: 'La cantidad debe ser un número entero positivo.' });
    }
    
    try {
        // Verificar que el tipo de cilindro existe
        const [cylinderCheck] = await pool.execute(
            'SELECT cylinder_type_id FROM CylinderTypes WHERE cylinder_type_id = ?',
            [cylinder_type_id]
        );
        
        if (cylinderCheck.length === 0) {
            return res.status(404).json({ message: `Tipo de cilindro ID ${cylinder_type_id} no encontrado.` });
        }
        
        // Insertar registro de préstamo
        const [result] = await pool.execute(
            `INSERT INTO SupplierLoanedStock (
                cylinder_type_id, quantity, loan_date, supplier_info, notes
            ) VALUES (?, ?, ?, ?, ?)`,
            [
                cylinder_type_id, 
                quantity, 
                loan_date || new Date().toISOString().split('T')[0], // Fecha actual si no se especifica
                supplier_info || null, 
                notes || null
            ]
        );
        
        // Respuesta exitosa
        console.log(`Préstamo proveedor registrado. ID: ${result.insertId}, Cantidad: ${quantity}`);
        res.status(201).json({ 
            message: 'Préstamo de proveedor registrado exitosamente.',
            loanId: result.insertId
        });
        
    } catch (error) {
        console.error('Error en addSupplierLoan:', error);
        
        // Mensajes de error específicos
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: `Referencia inválida: El tipo de cilindro ID ${cylinder_type_id} no existe.` });
        }
        
        res.status(500).json({ 
            message: 'Error al registrar préstamo de proveedor.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Registrar devolución de préstamo a proveedor
 * DELETE /api/inventory/supplier-loans/:loanId
 */
const returnSupplierLoan = async (req, res) => {
    const loanId = req.params.loanId;
    
    console.log(`DELETE /api/inventory/supplier-loans/${loanId} por User ID: ${req.user.id}`);
    
    try {
        // Verificar que el préstamo existe antes de eliminarlo
        const [loanCheck] = await pool.execute(
            'SELECT loan_id, cylinder_type_id, quantity, supplier_info FROM SupplierLoanedStock WHERE loan_id = ?',
            [loanId]
        );
        
        if (loanCheck.length === 0) {
            return res.status(404).json({ message: `Préstamo ID ${loanId} no encontrado.` });
        }
        
        const loan = loanCheck[0];
        
        // Eliminar el registro de préstamo
        const [result] = await pool.execute(
            'DELETE FROM SupplierLoanedStock WHERE loan_id = ?',
            [loanId]
        );
        
        // Registro para auditoría (opcional: añadir a una tabla de log)
        console.log(`Préstamo ID ${loanId} devuelto por User ID ${req.user.id}. Cilindro Tipo ID: ${loan.cylinder_type_id}, Cantidad: ${loan.quantity}`);
        
        res.status(200).json({ 
            message: 'Devolución de préstamo registrada exitosamente.',
            loanDetails: {
                cylinder_type_id: loan.cylinder_type_id,
                quantity: loan.quantity,
                supplier_info: loan.supplier_info
            }
        });
        
    } catch (error) {
        console.error('Error en returnSupplierLoan:', error);
        res.status(500).json({ 
            message: 'Error al registrar devolución de préstamo.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Realizar ajuste manual de inventario
 * POST /api/inventory/adjust
 */
const adjustStock = async (req, res) => {
    const { 
        warehouse_id, 
        item_id, 
        item_type, 
        status, 
        quantity_change, 
        reason 
    } = req.body;
    
    const adjustingUserId = req.user.id;
    
    console.log(`POST /api/inventory/adjust por User ID: ${adjustingUserId}`);
    console.log("Datos recibidos para ajuste:", req.body);
    
    // Validaciones completas
    if (!warehouse_id) {
        return res.status(400).json({ message: 'El ID del almacén es requerido.' });
    }
    
    if (!item_id) {
        return res.status(400).json({ message: 'El ID del item es requerido.' });
    }
    
    if (!item_type || !['cylinder', 'other_product'].includes(item_type)) {
        return res.status(400).json({ message: 'Tipo de item inválido. Debe ser "cylinder" o "other_product".' });
    }
    
    // Validar status según el tipo de item
    const validCylinderStatuses = ['full', 'empty', 'damaged', 'loaned_to_customer'];
    const validOtherProductStatuses = ['available'];
    
    if (item_type === 'cylinder' && !validCylinderStatuses.includes(status)) {
        return res.status(400).json({ 
            message: `Estado inválido para cilindros. Debe ser uno de: ${validCylinderStatuses.join(', ')}.`
        });
    }
    
    if (item_type === 'other_product' && !validOtherProductStatuses.includes(status)) {
        return res.status(400).json({ 
            message: `Estado inválido para otros productos. Debe ser: ${validOtherProductStatuses.join(', ')}.`
        });
    }
    
    if (quantity_change === undefined || quantity_change === null) {
        return res.status(400).json({ message: 'El cambio de cantidad es requerido.' });
    }
    
    const changeValue = Number(quantity_change);
    if (isNaN(changeValue)) {
        return res.status(400).json({ message: 'El cambio de cantidad debe ser un número.' });
    }
    
    if (changeValue === 0) {
        return res.status(400).json({ message: 'El cambio de cantidad no puede ser cero.' });
    }
    
    if (!reason) {
        return res.status(400).json({ message: 'El motivo del ajuste es requerido.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que el almacén existe
        const [warehouseCheck] = await connection.execute(
            'SELECT warehouse_id FROM Warehouses WHERE warehouse_id = ?',
            [warehouse_id]
        );
        
        if (warehouseCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Almacén ID ${warehouse_id} no encontrado.` });
        }
        
        // Verificar que el item existe según su tipo
        if (item_type === 'cylinder') {
            const [cylinderCheck] = await connection.execute(
                'SELECT cylinder_type_id FROM CylinderTypes WHERE cylinder_type_id = ?',
                [item_id]
            );
            
            if (cylinderCheck.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: `Tipo de cilindro ID ${item_id} no encontrado.` });
            }
        } else { // other_product
            const [productCheck] = await connection.execute(
                'SELECT product_id FROM OtherProducts WHERE product_id = ?',
                [item_id]
            );
            
            if (productCheck.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: `Producto ID ${item_id} no encontrado.` });
            }
        }
        
        // Verificar el stock actual antes de aplicar el cambio
        const [currentStock] = await connection.execute(
            `SELECT quantity FROM InventoryStock 
             WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
            [warehouse_id, item_id, item_type, status]
        );
        
        const currentQuantity = currentStock.length > 0 ? currentStock[0].quantity : 0;
        
        // Calcular nuevo valor y validar que no sea negativo
        const newQuantity = currentQuantity + changeValue;
        
        if (newQuantity < 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `El ajuste resultaría en un stock negativo. Stock actual: ${currentQuantity}, Cambio: ${changeValue}.`
            });
        }
        
        // Actualizar o insertar registro de stock
        if (currentStock.length > 0) {
            // Actualizar registro existente
            await connection.execute(
                `UPDATE InventoryStock 
                 SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
                [newQuantity, warehouse_id, item_id, item_type, status]
            );
        } else {
            // Crear nuevo registro si no existe
            await connection.execute(
                `INSERT INTO InventoryStock 
                (warehouse_id, item_id, item_type, status, quantity) 
                VALUES (?, ?, ?, ?, ?)`,
                [warehouse_id, item_id, item_type, status, newQuantity]
            );
        }
        
        // Registrar el ajuste en el log
        await connection.execute(
            `INSERT INTO InventoryLog 
            (warehouse_id, item_id, item_type, status_changed_to, quantity_change, 
             transaction_type, reason, user_id, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                warehouse_id, 
                item_id, 
                item_type, 
                status, 
                changeValue, 
                'stock_adjustment', 
                reason, 
                adjustingUserId
            ]
        );
        
        // Confirmar los cambios
        await connection.commit();
        
        console.log(`Ajuste de stock completado por User ID ${adjustingUserId}. Almacén: ${warehouse_id}, Item: ${item_type}:${item_id}, Estado: ${status}, Cambio: ${quantity_change}`);
        
        res.status(200).json({ 
            message: 'Ajuste de inventario realizado exitosamente.',
            details: {
                warehouse_id,
                item_id,
                item_type,
                status,
                previous_quantity: currentQuantity,
                change: changeValue,
                new_quantity: newQuantity
            }
        });
        
    } catch (error) {
        // Deshacer cambios en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en adjustStock:', error);
        
        // Errores específicos
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                message: 'Error: Referencia inválida a almacén o item. Verifique los IDs proporcionados.'
            });
        }
        
        res.status(500).json({ 
            message: 'Error al realizar ajuste de inventario.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener log de movimientos de inventario
 * GET /api/inventory/log?warehouseId=X&limit=Y
 */
const viewInventoryLog = async (req, res) => {
    const warehouseId = req.query.warehouseId;
    const limit = parseInt(req.query.limit) || 100; // Límite por defecto: 100 registros
    const offset = parseInt(req.query.offset) || 0;
    
    console.log(`GET /api/inventory/log por User ID: ${req.user.id}`);
    
    if (!warehouseId) {
        return res.status(400).json({ message: 'Se requiere el ID del almacén.' });
    }
    
    try {
        // Verificar que el almacén existe
        const [warehouseCheck] = await pool.execute(
            'SELECT warehouse_id, name FROM Warehouses WHERE warehouse_id = ?',
            [warehouseId]
        );
        
        if (warehouseCheck.length === 0) {
            return res.status(404).json({ message: `Almacén ID ${warehouseId} no encontrado.` });
        }
        
        // Obtener registros del log con información detallada
        const [logEntries] = await pool.execute(
            `SELECT 
                il.log_id,
                il.warehouse_id,
                il.item_id,
                il.item_type,
                CASE 
                    WHEN il.item_type = 'cylinder' THEN ct.name
                    WHEN il.item_type = 'other_product' THEN op.name
                    ELSE 'Desconocido'
                END as item_name,
                il.status_changed_from,
                il.status_changed_to,
                il.quantity_change,
                il.transaction_type,
                il.related_order_id,
                il.reason,
                il.user_id,
                u.full_name as user_name,
                u.username,
                DATE_FORMAT(il.created_at, '%Y-%m-%d %H:%i:%s') as log_timestamp,
                il.notes
            FROM InventoryLog il
            LEFT JOIN CylinderTypes ct ON il.item_type = 'cylinder' AND il.item_id = ct.cylinder_type_id
            LEFT JOIN OtherProducts op ON il.item_type = 'other_product' AND il.item_id = op.product_id
            LEFT JOIN Users u ON il.user_id = u.user_id
            WHERE il.warehouse_id = ?
            ORDER BY il.created_at DESC
            LIMIT ? OFFSET ?`,
            [warehouseId, limit, offset]
        );
        
        // Obtener total de registros para paginación
        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM InventoryLog WHERE warehouse_id = ?',
            [warehouseId]
        );
        
        const totalRecords = countResult[0].total;
        
        // Respuesta con resultado y metadatos
        res.status(200).json({
            warehouse: {
                id: warehouseCheck[0].warehouse_id,
                name: warehouseCheck[0].name
            },
            log_entries: logEntries,
            pagination: {
                total: totalRecords,
                limit,
                offset,
                has_more: (offset + logEntries.length) < totalRecords
            }
        });
        
    } catch (error) {
        console.error('Error en viewInventoryLog:', error);
        res.status(500).json({ 
            message: 'Error al obtener log de inventario.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Transferir stock entre almacenes
 * POST /api/inventory/transfer
 */
const transferStock = async (req, res) => {
    const { 
        source_warehouse_id, 
        target_warehouse_id, 
        item_id, 
        item_type, 
        status, 
        quantity, 
        notes 
    } = req.body;
    
    const userId = req.user.id;
    
    console.log(`POST /api/inventory/transfer por User ID: ${userId}`);
    console.log("Datos de transferencia:", req.body);
    
    // Validaciones
    if (!source_warehouse_id || !target_warehouse_id) {
        return res.status(400).json({ message: 'Almacenes origen y destino son requeridos.' });
    }
    
    if (source_warehouse_id === target_warehouse_id) {
        return res.status(400).json({ message: 'Los almacenes origen y destino deben ser diferentes.' });
    }
    
    if (!item_id) {
        return res.status(400).json({ message: 'ID del item es requerido.' });
    }
    
    if (!item_type || !['cylinder', 'other_product'].includes(item_type)) {
        return res.status(400).json({ message: 'Tipo de item inválido. Debe ser "cylinder" o "other_product".' });
    }
    
    if (!status) {
        return res.status(400).json({ message: 'Estado del item es requerido.' });
    }
    
    if (!quantity || quantity <= 0 || !Number.isInteger(Number(quantity))) {
        return res.status(400).json({ message: 'La cantidad debe ser un número entero positivo.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Verificar que ambos almacenes existen
        const [warehousesCheck] = await connection.execute(
            'SELECT warehouse_id, name FROM Warehouses WHERE warehouse_id IN (?, ?)',
            [source_warehouse_id, target_warehouse_id]
        );
        
        if (warehousesCheck.length < 2) {
            await connection.rollback();
            return res.status(404).json({ message: 'Uno o ambos almacenes no existen.' });
        }
        
        // Verificar stock disponible en origen
        const [sourceStock] = await connection.execute(
            `SELECT quantity FROM InventoryStock 
             WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
            [source_warehouse_id, item_id, item_type, status]
        );
        
        if (sourceStock.length === 0 || sourceStock[0].quantity < quantity) {
            await connection.rollback();
            const currentQuantity = sourceStock.length > 0 ? sourceStock[0].quantity : 0;
            return res.status(400).json({ 
                message: `Stock insuficiente en almacén origen. Disponible: ${currentQuantity}, Solicitado: ${quantity}.`
            });
        }
        
        // Actualizar stock en origen (restar)
        await connection.execute(
            `UPDATE InventoryStock 
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
            [quantity, source_warehouse_id, item_id, item_type, status]
        );
        
        // Verificar si el destino ya tiene stock del mismo item/tipo/estado
        const [targetStock] = await connection.execute(
            `SELECT quantity FROM InventoryStock 
             WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
            [target_warehouse_id, item_id, item_type, status]
        );
        
        if (targetStock.length > 0) {
            // Actualizar stock existente en destino
            await connection.execute(
                `UPDATE InventoryStock 
                 SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                 WHERE warehouse_id = ? AND item_id = ? AND item_type = ? AND status = ?`,
                [quantity, target_warehouse_id, item_id, item_type, status]
            );
        } else {
            // Crear nuevo registro en destino
            await connection.execute(
                `INSERT INTO InventoryStock 
                (warehouse_id, item_id, item_type, status, quantity) 
                VALUES (?, ?, ?, ?, ?)`,
                [target_warehouse_id, item_id, item_type, status, quantity]
            );
        }
        
        // Registrar en log la salida del origen
        await connection.execute(
            `INSERT INTO InventoryLog 
            (warehouse_id, item_id, item_type, status_changed_to, quantity_change, 
             transaction_type, reason, user_id, notes, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                source_warehouse_id, 
                item_id, 
                item_type, 
                status, 
                -quantity, 
                'transfer_out', 
                `Transferencia a almacén ID ${target_warehouse_id}`, 
                userId,
                notes || null
            ]
        );
        
        // Registrar en log la entrada al destino
        await connection.execute(
            `INSERT INTO InventoryLog 
            (warehouse_id, item_id, item_type, status_changed_to, quantity_change, 
             transaction_type, reason, user_id, notes, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                target_warehouse_id, 
                item_id, 
                item_type, 
                status, 
                quantity, 
                'transfer_in', 
                `Transferencia desde almacén ID ${source_warehouse_id}`, 
                userId,
                notes || null
            ]
        );
        
        // Obtener nombres de almacenes para el log
        const sourceWarehouse = warehousesCheck.find(w => w.warehouse_id == source_warehouse_id);
        const targetWarehouse = warehousesCheck.find(w => w.warehouse_id == target_warehouse_id);
        
        // Confirmar cambios
        await connection.commit();
        
        console.log(`Transferencia completada por User ID ${userId}. De: ${sourceWarehouse.name} A: ${targetWarehouse.name}, Item: ${item_type}:${item_id}, Cantidad: ${quantity}`);
        
        res.status(200).json({ 
            message: 'Transferencia de inventario completada exitosamente.',
            details: {
                from: {
                    warehouse_id: parseInt(source_warehouse_id),
                    name: sourceWarehouse.name
                },
                to: {
                    warehouse_id: parseInt(target_warehouse_id),
                    name: targetWarehouse.name
                },
                item_id: parseInt(item_id),
                item_type,
                status,
                quantity: parseInt(quantity)
            }
        });
        
    } catch (error) {
        // Deshacer cambios en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error en transferStock:', error);
        
        // Mensajes específicos
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                message: 'Error: Referencia inválida. Verifique los IDs de almacén o item.'
            });
        }
        
        res.status(500).json({ 
            message: 'Error al realizar transferencia de inventario.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Siempre liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};

module.exports = {
    viewStockByWarehouse,
    viewTotalStock,
    viewSupplierLoans,
    addSupplierLoan,
    returnSupplierLoan,
    adjustStock,
    viewInventoryLog,
    transferStock
};