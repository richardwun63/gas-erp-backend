// routes/customerRoutes.js
const express = require('express');
const { 
    listCustomers, 
    getCustomerDetails, 
    getUpcomingBirthdays,
    setSpecialPrices,
    clearSpecialPrices,
    adjustLoyaltyPoints,
    redeemPoints,
    getLoyaltyStats,
    testDatabaseConnection
} = require('../controllers/customerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// Endpoint de diagnóstico
router.get('/test-connection', protect, testDatabaseConnection);

// Rutas protegidas (requieren autenticación)
router.get('/', protect, listCustomers);
router.get('/birthdays', protect, getUpcomingBirthdays);
router.get('/loyalty/stats', protect, getLoyaltyStats);

// Rutas específicas del cliente
router.get('/:id', protect, getCustomerDetails);
router.put('/:id/pricing', protect, setSpecialPrices);
router.delete('/:id/pricing', protect, clearSpecialPrices);
router.post('/:id/points/adjust', protect, adjustLoyaltyPoints);

// Rutas para el propio cliente
router.post('/me/redeem-points', protect, redeemPoints);

module.exports = router;