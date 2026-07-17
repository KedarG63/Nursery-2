/**
 * Material / Supplies Purchase Routes
 *
 * Vendor-payables register for non-seed supplies (cocopeat, fertilizer, …).
 * Gated to finance roles, consistent with the Expenses module.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/materialPurchaseController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

// Summary (declare before /:id)
router.get('/summary', authorize(FINANCE), ctrl.getSummary);

// Purchases
router.get('/', authorize(FINANCE), ctrl.listPurchases);
router.post('/', authorize(FINANCE), ctrl.createPurchase);
router.get('/:id', authorize(FINANCE), ctrl.getPurchaseById);
router.put('/:id', authorize(FINANCE), ctrl.updatePurchase);
router.delete('/:id', authorize(FINANCE), ctrl.deletePurchase);

// Payment tranches
router.post('/:id/payments', authorize(FINANCE), ctrl.recordPayment);
router.delete('/:id/payments/:paymentId', authorize(FINANCE), ctrl.deletePayment);

module.exports = router;
