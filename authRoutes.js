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

// POST /api/auth/login - Iniciar sesión
router.post('/login', loginUser);

// POST /api/auth/register - Registrar nuevo cliente
router.post('/register', registerClient);

// POST /api/auth/change-password - Cambiar contraseña (requiere autenticación)
router.post('/change-password', protect, changePassword);

// POST /api/auth/forgot-password - Solicitar recuperación de contraseña
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password - Restablecer contraseña con token
router.post('/reset-password', resetPassword);

// GET /api/auth/verify-token - Verificar validez del token (para frontend)
router.get('/verify-token', protect, verifyToken);

// POST /api/auth/refresh-token - Renovar token JWT antes de que expire
router.post('/refresh-token', protect, refreshToken);

module.exports = router;