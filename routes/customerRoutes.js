// routes/customerRoutes.js
const express = require('express');
const { listCustomers, getCustomerDetails, getUpcomingBirthdays, setSpecialPrices, clearSpecialPrices, adjustLoyaltyPoints, redeemPoints } = require('../controllers/customerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, idParamValidationRules, listPaginationValidationRules } = require('../validation/validationRules');

const router = express.Router();

// --- Rutas para Clientes ---

// POST /api/customers/me/redeem-points : Cliente canjea puntos
router.post('/me/redeem-points', protect, restrictTo('cliente'), /* redeemPointsValidationRules(), validate, */ redeemPoints); // TODO: Add validation

// GET /api/customers : Listar clientes (internos)
router.get('/', protect, restrictTo('base', 'contabilidad', 'gerente'), listPaginationValidationRules(), validate, listCustomers);

// GET /api/customers/birthdays : Ver cumpleaños próximos (internos)
router.get('/birthdays', protect, restrictTo('base', 'gerente'), getUpcomingBirthdays);

// GET /api/customers/:id : Ver detalles cliente (internos)
router.get('/:id', protect, restrictTo('base', 'contabilidad', 'gerente'), idParamValidationRules('id'), validate, getCustomerDetails);

// PUT /api/customers/:id/pricing : Precios especiales (Gerente)
router.put('/:id/pricing', protect, restrictTo('gerente'), idParamValidationRules('id'), /* setPricesValidationRules(), */ validate, setSpecialPrices); // TODO: Add validation

// DELETE /api/customers/:id/pricing : Eliminar precios especiales (Gerente)
router.delete('/:id/pricing', protect, restrictTo('gerente'), idParamValidationRules('id'), validate, clearSpecialPrices);

// POST /api/customers/:id/points/adjust : Ajustar puntos (Base, Gerente)
router.post('/:id/points/adjust', protect, restrictTo('base', 'gerente'), idParamValidationRules('id'), /* adjustPointsValidationRules(), */ validate, adjustLoyaltyPoints); // TODO: Add validation

module.exports = router;