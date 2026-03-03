/**
 * Vendor Bills Routes (Accounts Payable)
 * Phase 23: Billing & Accounting
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const vendorBillController = require('../controllers/vendorBillController');
const {
  validateUpdateDueDate,
  validateRecordVendorPayment,
} = require('../validators/vendorBillValidator');

// All routes require authentication
router.use(authenticate);

// ─── Reports (MUST be before /:id to avoid route shadowing) ───────────────
router.get(
  '/reports/aging',
  authorize(['Admin', 'Manager']),
  vendorBillController.getAgingReport
);

// ─── Vendor Bills CRUD ────────────────────────────────────────────────────
router.get(
  '/',
  authorize(['Admin', 'Manager']),
  vendorBillController.listVendorBills
);

router.get(
  '/:id',
  authorize(['Admin', 'Manager']),
  vendorBillController.getVendorBill
);

// ─── Due Date ─────────────────────────────────────────────────────────────
router.put(
  '/:id/due-date',
  authorize(['Admin', 'Manager']),
  validateUpdateDueDate,
  vendorBillController.updateDueDate
);

// ─── Payment Recording ────────────────────────────────────────────────────
router.post(
  '/:id/payments',
  authorize(['Admin', 'Manager']),
  validateRecordVendorPayment,
  vendorBillController.recordPayment
);

module.exports = router;
