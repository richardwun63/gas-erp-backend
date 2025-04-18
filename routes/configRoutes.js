// routes/configRoutes.js
const express = require('express');
const {
    getPublicConfig,
    getAllConfig,
    updateConfig
} = require('../controllers/configController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// --- Rutas de Configuración ---

// GET /api/config/public : Obtener configuración pública (ej: para frontend antes de login)
router.get('/public', getPublicConfig);

// GET /api/config : Obtener toda la configuración (Solo Gerente)
router.get('/', protect, restrictTo('gerente'), getAllConfig);

// PUT /api/config : Actualizar configuraciones (Solo Gerente)
// Espera un body JSON: { "clave1": "valor1", "clave2": "valor2", ... }
router.put('/', protect, restrictTo('gerente'), updateConfig);

module.exports = router;