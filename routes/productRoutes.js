// routes/productRoutes.js
const express = require('express');
const { 
    getCylinderTypes, 
    getOtherProducts, 
    createOtherProduct, 
    updateOtherProduct, 
    toggleOtherProductStatus, 
    getOtherProductById 
} = require('../controllers/productController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, idParamValidationRules } = require('../validation/validationRules');

const router = express.Router();

// Rutas públicas
router.get('/cylinders', getCylinderTypes);
router.get('/others', getOtherProducts);

// Rutas protegidas para gerente
const gerenteOnly = restrictTo('gerente');

// Habilitar validación y corregir orden de middleware
router.post('/others', protect, gerenteOnly, validate, createOtherProduct);

router.get('/others/:id', 
    protect, 
    gerenteOnly, 
    idParamValidationRules('id'), 
    validate, 
    getOtherProductById
);

router.put('/others/:id', 
    protect, 
    gerenteOnly, 
    idParamValidationRules('id'), 
    validate, 
    updateOtherProduct
);

router.put('/others/:id/status', 
    protect, 
    gerenteOnly, 
    idParamValidationRules('id'), 
    validate, 
    toggleOtherProductStatus
);

module.exports = router;