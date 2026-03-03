/**
 * Invoice Routes
 * Phase 23: Billing & Accounting
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const invoiceController = require('../controllers/invoiceController');
const {
  validateCreateInvoice,
  validateUpdateInvoice,
  validateApplyPayment,
} = require('../validators/invoiceValidator');

// All routes require authentication
router.use(authenticate);

// ─── Reports (MUST be before /:id to avoid route shadowing) ───────────────
router.get(
  '/reports/aging',
  authorize(['Admin', 'Manager']),
  invoiceController.getAgingReport
);

router.get(
  '/reports/register',
  authorize(['Admin', 'Manager', 'Sales']),
  invoiceController.getInvoiceRegister
);

// ─── Invoice CRUD ─────────────────────────────────────────────────────────
router.get(
  '/',
  authorize(['Admin', 'Manager', 'Sales']),
  invoiceController.listInvoices
);

router.post(
  '/',
  authorize(['Admin', 'Manager', 'Sales']),
  validateCreateInvoice,
  invoiceController.createInvoice
);

router.get(
  '/:id',
  authorize(['Admin', 'Manager', 'Sales']),
  invoiceController.getInvoice
);

router.put(
  '/:id',
  authorize(['Admin', 'Manager']),
  validateUpdateInvoice,
  invoiceController.updateInvoice
);

// ─── Invoice Status Transitions ───────────────────────────────────────────
router.post(
  '/:id/issue',
  authorize(['Admin', 'Manager']),
  invoiceController.issueInvoice
);

router.post(
  '/:id/void',
  authorize(['Admin', 'Manager']),
  invoiceController.voidInvoice
);

// ─── PDF ──────────────────────────────────────────────────────────────────
router.get(
  '/:id/pdf',
  authorize(['Admin', 'Manager', 'Sales']),
  invoiceController.generatePDF
);

// ─── Applied Payments ─────────────────────────────────────────────────────
router.post(
  '/:id/payments',
  authorize(['Admin', 'Manager', 'Sales']),
  validateApplyPayment,
  invoiceController.applyPayment
);

router.delete(
  '/:id/payments/:paymentId',
  authorize(['Admin', 'Manager']),
  invoiceController.removePayment
);

module.exports = router;
