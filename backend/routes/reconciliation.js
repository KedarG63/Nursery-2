/**
 * Reconciliation Routes
 *
 * Read-only. The report recomputes derived totals and compares them against
 * what is stored; it never writes, so it is always safe to run.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reconciliationController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

router.get(
  '/returns',
  authorize(['Admin', 'Manager', 'Accountant']),
  ctrl.getReturnsReconciliation
);

module.exports = router;
