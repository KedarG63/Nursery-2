/**
 * Vendor Payment Routes — one payment settling many seed / supplies bills.
 * Gated to finance roles, consistent with Supplies and Finance.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/vendorPaymentController');
const { validateCreateVendorPayment } = require('../validators/vendorPaymentValidator');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

// Declare before /:id
router.get('/vendors', authorize(FINANCE), ctrl.listPayableVendors);
router.get('/vendors/:vendorId/open-bills', authorize(FINANCE), ctrl.getOpenBills);

router.get('/', authorize(FINANCE), ctrl.listVendorPayments);
router.post('/', authorize(FINANCE), validateCreateVendorPayment, ctrl.createVendorPayment);
router.get('/:id', authorize(FINANCE), ctrl.getVendorPayment);
router.delete('/:id', authorize(FINANCE), ctrl.voidVendorPayment);

// Apply advance to more bills / take one allocation back into advance
router.post('/:id/allocations', authorize(FINANCE), ctrl.addAllocations);
router.delete('/:id/allocations/:billType/:allocationId', authorize(FINANCE), ctrl.removeAllocation);

module.exports = router;
