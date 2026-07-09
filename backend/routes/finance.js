/**
 * Finance Routes — read-only Finance Overview and Profit & Loss aggregations.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/financeController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

router.get('/overview', authorize(FINANCE), ctrl.getOverview);
router.get('/profit-loss', authorize(FINANCE), ctrl.getProfitLoss);

module.exports = router;
