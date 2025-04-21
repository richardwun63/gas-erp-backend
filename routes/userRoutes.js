// routes/userRoutes.js
const express = require('express'); const { getMyProfile, updateMyProfile, listEmployees, createEmployee, updateSchedule, updateUserStatus, clearSchedule, getUserById, deleteEmployee, updateEmployee } = require('../controllers/userController'); const { protect, restrictTo } = require('../middleware/authMiddleware'); const { validate, idParamValidationRules, listPaginationValidationRules } = require('../validation/validationRules');
const router = express.Router();
router.get('/me', protect, getMyProfile); router.put('/me', protect, /* validate, */ updateMyProfile);
const adminGerente = restrictTo('admin', 'gerente');
router.get('/', protect, adminGerente, listPaginationValidationRules(), validate, listEmployees); router.post('/', protect, adminGerente, /* validate, */ createEmployee);
router.get('/:id', protect, adminGerente, idParamValidationRules('id'), validate, getUserById); router.put('/:id', protect, adminGerente, idParamValidationRules('id'), /* validate, */ validate, updateEmployee); // Ruta PUT para editar otros
router.put('/:id/schedule', protect, adminGerente, idParamValidationRules('id'), /* validate, */ validate, updateSchedule); router.put('/:id/status', protect, adminGerente, idParamValidationRules('id'), /* validate, */ validate, updateUserStatus); router.delete('/:id/schedule', protect, adminGerente, idParamValidationRules('id'), validate, clearSchedule); router.delete('/:id', protect, adminGerente, idParamValidationRules('id'), validate, deleteEmployee);
module.exports = router;