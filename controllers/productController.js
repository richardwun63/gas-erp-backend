// controllers/productController.js
const pool = require('../db/db');

/**
 * Obtiene los tipos de cilindros/balones disponibles
 * GET /api/products/cylinders
 */
const getCylinderTypes = async (req, res) => {
    console.log("Petición GET /api/products/cylinders");
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Utilizamos una consulta más eficiente que respete la versión MySQL 8.0.41
        const [rows] = await connection.query(`
            SELECT 
                cylinder_type_id, 
                name, 
                description, 
                price_new, 
                price_exchange, 
                price_loan, 
                is_available
            FROM cylindertypes
            ORDER BY name
        `);
        
        console.log(`✅ Enviando respuesta con ${rows.length} tipos de cilindros`);
        
        // Permitir caché del lado del cliente (10 minutos)
        res.set('Cache-Control', 'public, max-age=600');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error en getCylinderTypes:', error);
        res.status(500).json({ 
            message: 'Error al obtener los tipos de cilindros.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtiene los otros productos disponibles
 * GET /api/products/others
 */
const getOtherProducts = async (req, res) => {
    console.log("Petición GET /api/products/others");
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        const [rows] = await connection.query(`
            SELECT 
                product_id, 
                name, 
                description, 
                price, 
                stock_unit, 
                is_available
            FROM otherproducts
            ORDER BY name
        `);
        
        console.log(`✅ Enviando respuesta con ${rows.length} otros productos`);
        
        // Permitir caché del lado del cliente (5 minutos)
        res.set('Cache-Control', 'public, max-age=300');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error en getOtherProducts:', error);
        res.status(500).json({ 
            message: 'Error al obtener los otros productos.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtiene un producto específico por ID
 * GET /api/products/others/:id
 */
const getOtherProductById = async (req, res) => {
    const productId = parseInt(req.params.id);
    console.log(`Petición GET /api/products/others/${productId}`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        const [rows] = await connection.query(
            `SELECT * FROM otherproducts WHERE product_id = ?`, 
            [productId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        
        console.log(`✅ Enviando detalles del producto ID: ${productId}`);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`Error en getOtherProductById para ID ${productId}:`, error);
        res.status(500).json({ 
            message: 'Error al obtener detalles del producto.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Crea un nuevo producto
 * POST /api/products/others
 */
const createOtherProduct = async (req, res) => {
    const { name, description, price, stock_unit = 'unidad', is_available = true } = req.body;
    const requestingUserId = req.user.id;
    
    console.log(`Petición POST /api/products/others por User ID: ${requestingUserId}`);
    console.log("Datos:", { name, price, stock_unit, is_available });
    
    let connection;
    try {
        // Validaciones básicas
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ message: 'Nombre de producto inválido.' });
        }
        
        if (typeof price !== 'number' || price <= 0) {
            return res.status(400).json({ message: 'Precio inválido. Debe ser un número mayor a cero.' });
        }
        
        connection = await pool.getConnection();
        
        // Verificar si ya existe un producto con el mismo nombre
        const [existing] = await connection.query(
            `SELECT product_id FROM otherproducts WHERE name = ?`, 
            [name]
        );
        
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Ya existe un producto con ese nombre.' });
        }
        
        // Insertar el nuevo producto
        const [result] = await connection.query(
            `INSERT INTO otherproducts (name, description, price, stock_unit, is_available) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, description || null, price, stock_unit, is_available ? 1 : 0]
        );
        
        console.log(`✅ Producto creado con ID: ${result.insertId}`);
        
        // Obtener el producto recién creado
        const [newProduct] = await connection.query(
            `SELECT * FROM otherproducts WHERE product_id = ?`, 
            [result.insertId]
        );
        
        res.status(201).json({
            message: 'Producto creado correctamente.',
            product: newProduct[0]
        });
    } catch (error) {
        console.error('Error en createOtherProduct:', error);
        res.status(500).json({ 
            message: 'Error al crear el producto.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Actualiza un producto existente
 * PUT /api/products/others/:id
 */
const updateOtherProduct = async (req, res) => {
    const productId = parseInt(req.params.id);
    const { name, description, price, stock_unit, is_available } = req.body;
    const requestingUserId = req.user.id;
    
    console.log(`Petición PUT /api/products/others/${productId} por User ID: ${requestingUserId}`);
    
    let connection;
    try {
        // Validaciones básicas
        if (name && typeof name !== 'string') {
            return res.status(400).json({ message: 'Nombre de producto inválido.' });
        }
        
        if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
            return res.status(400).json({ message: 'Precio inválido. Debe ser un número mayor a cero.' });
        }
        
        connection = await pool.getConnection();
        
        // Verificar si el producto existe
        const [existingProduct] = await connection.query(
            `SELECT * FROM otherproducts WHERE product_id = ?`, 
            [productId]
        );
        
        if (existingProduct.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        
        // Verificar si ya existe otro producto con el mismo nombre
        if (name) {
            const [existing] = await connection.query(
                `SELECT product_id FROM otherproducts WHERE name = ? AND product_id != ?`, 
                [name, productId]
            );
            
            if (existing.length > 0) {
                return res.status(409).json({ message: 'Ya existe otro producto con ese nombre.' });
            }
        }
        
        // Construir el query de actualización dinámicamente
        const updates = [];
        const values = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        
        if (price !== undefined) {
            updates.push('price = ?');
            values.push(price);
        }
        
        if (stock_unit !== undefined) {
            updates.push('stock_unit = ?');
            values.push(stock_unit);
        }
        
        if (is_available !== undefined) {
            updates.push('is_available = ?');
            values.push(is_available ? 1 : 0);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ message: 'No se proporcionaron campos para actualizar.' });
        }
        
        // Añadir el ID del producto al final de los valores
        values.push(productId);
        
        // Ejecutar la actualización
        await connection.query(
            `UPDATE otherproducts SET ${updates.join(', ')} WHERE product_id = ?`,
            values
        );
        
        // Obtener el producto actualizado
        const [updatedProduct] = await connection.query(
            `SELECT * FROM otherproducts WHERE product_id = ?`, 
            [productId]
        );
        
        console.log(`✅ Producto ID ${productId} actualizado correctamente.`);
        
        res.status(200).json({
            message: 'Producto actualizado correctamente.',
            product: updatedProduct[0]
        });
    } catch (error) {
        console.error(`Error en updateOtherProduct para ID ${productId}:`, error);
        res.status(500).json({ 
            message: 'Error al actualizar el producto.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Cambia el estado (activo/inactivo) de un producto
 * PUT /api/products/others/:id/status
 */
const toggleOtherProductStatus = async (req, res) => {
    const productId = parseInt(req.params.id);
    const { is_available } = req.body;
    const requestingUserId = req.user.id;
    
    console.log(`Petición PUT /api/products/others/${productId}/status por User ID: ${requestingUserId}`);
    console.log(`Nuevo estado: ${is_available ? 'Activo' : 'Inactivo'}`);
    
    let connection;
    try {
        // Validar que is_available sea un booleano
        if (typeof is_available !== 'boolean') {
            return res.status(400).json({ message: 'Estado inválido. Debe ser verdadero o falso.' });
        }
        
        connection = await pool.getConnection();
        
        // Verificar si el producto existe
        const [existingProduct] = await connection.query(
            `SELECT * FROM otherproducts WHERE product_id = ?`, 
            [productId]
        );
        
        if (existingProduct.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        
        // Actualizar el estado
        await connection.query(
            `UPDATE otherproducts SET is_available = ? WHERE product_id = ?`,
            [is_available ? 1 : 0, productId]
        );
        
        console.log(`✅ Estado del producto ID ${productId} cambiado a ${is_available ? 'Activo' : 'Inactivo'}`);
        
        res.status(200).json({
            message: `Producto ${is_available ? 'activado' : 'desactivado'} correctamente.`,
            product_id: productId,
            is_available: is_available
        });
    } catch (error) {
        console.error(`Error en toggleOtherProductStatus para ID ${productId}:`, error);
        res.status(500).json({ 
            message: 'Error al actualizar el estado del producto.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    getCylinderTypes,
    getOtherProducts,
    getOtherProductById,
    createOtherProduct,
    updateOtherProduct,
    toggleOtherProductStatus
};