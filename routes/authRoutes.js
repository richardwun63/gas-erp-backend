// routes/authRoutes.js
const express = require('express');
const {
    loginUser,
    registerClient,
    changePassword // <-- Asegurar que esté importada
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); // Solo protect es necesario aquí

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginUser);

// POST /api/auth/register (solo clientes)
router.post('/register', registerClient);

// POST /api/auth/change-password (Usuario logueado cambia su propia pass)
router.post('/change-password', protect, changePassword); // <-- Ruta añadida


module.exports = router;