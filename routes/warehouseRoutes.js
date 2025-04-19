// routes/warehouseRoutes.js
const express = require('express'); const { listWarehouses, createWarehouse, updateWarehouse, toggleWarehouseStatus, getWarehouseById } = require('../controllers/warehouseController'); const { protect, restrictTo } = require('../middleware/authMiddleware'); const { validate, idParamValidationRules } = require('../validation/validationRules');
const router = express.Router();
const gerente = restrictTo('gerente');
router.get('/', protect, restrictTo('base','contabilidad','gerente'), listWarehouses); router.get('/:id', protect, gerente, idParamValidationRules('id'), validate, getWarehouseById); router.post('/', protect, gerente, /* validate, */ createWarehouse); router.put('/:id', protect, gerente, idParamValidationRules('id'), /* validate, */ validate, updateWarehouse); router.put('/:id/status', protect, gerente, idParamValidationRules('id'), /* validate, */ validate, toggleWarehouseStatus);
module.exports = router;