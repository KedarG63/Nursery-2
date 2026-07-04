/**
 * Employee Routes — staff master (salaried + daily-wage).
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/employeeController');
const { validateEmployee } = require('../validators/employeeValidator');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

const partySummaryController = require('../controllers/partySummaryController');

router.get('/', authorize(FINANCE), ctrl.listEmployees);
router.post('/', authorize(FINANCE), validateEmployee, ctrl.createEmployee);
router.get('/:id/summary', authorize(FINANCE), partySummaryController.employeeSummary);
router.get('/:id', authorize(FINANCE), ctrl.getEmployee);
router.put('/:id', authorize(FINANCE), validateEmployee, ctrl.updateEmployee);
router.delete('/:id', authorize(['Admin', 'Manager', 'Accountant']), ctrl.deleteEmployee);

module.exports = router;
