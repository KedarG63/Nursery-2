/**
 * Payroll Routes — salary & daily-wage runs.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/payrollController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

router.post('/runs/preview', authorize(FINANCE), ctrl.previewRun);
router.get('/runs', authorize(FINANCE), ctrl.listRuns);
router.post('/runs', authorize(FINANCE), ctrl.createRun);
router.get('/runs/:id', authorize(FINANCE), ctrl.getRun);
router.post('/runs/:id/pay', authorize(FINANCE), ctrl.payRun);
router.delete('/runs/:id', authorize(['Admin', 'Manager', 'Accountant']), ctrl.deleteRun);

module.exports = router;
