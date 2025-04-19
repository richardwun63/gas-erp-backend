// routes/authRoutes.js
const express = require('express');
const {
    loginUser,
    registerClient,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyToken,
    refreshToken
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginUser);

// POST /api/auth/register (solo clientes)
router.post('/register', registerClient);

// POST /api/auth/change-password (Usuario logueado cambia su propia pass)
router.post('/change-password', protect, changePassword);

// POST /api/auth/forgot-password (Solicita recuperación de contraseña)
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password (Restablece contraseña con token)
router.post('/reset-password', resetPassword);

// GET /api/auth/verify-token (Verifica validez del token)
router.get('/verify-token', protect, verifyToken);

// POST /api/auth/refresh-token (Renueva token JWT)
router.post('/refresh-token', protect, refreshToken);

module.exports = router;