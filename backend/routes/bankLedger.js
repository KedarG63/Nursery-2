/**
 * Bank Ledger Routes
 * Simple Tally-style ledger for up to 3 business bank accounts.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/bankLedgerController');

// All routes require authentication
router.use(authenticate);

// ─── Bank Accounts ────────────────────────────────────────────────────────────
router.get(
  '/',
  authorize(['Admin', 'Manager', 'Sales']),
  ctrl.listAccounts
);

router.post(
  '/',
  authorize(['Admin']),
  ctrl.upsertAccount
);

router.put(
  '/:id',
  authorize(['Admin']),
  ctrl.upsertAccount
);

// ─── Opening Balance ───────────────────────────────────────────────────────────
router.post(
  '/:id/opening-balance',
  authorize(['Admin', 'Manager']),
  ctrl.setOpeningBalance
);

// ─── Ledger Entries ────────────────────────────────────────────────────────────
router.get(
  '/:id/ledger',
  authorize(['Admin', 'Manager', 'Sales']),
  ctrl.getLedger
);

router.post(
  '/:id/entries',
  authorize(['Admin', 'Manager']),
  ctrl.addManualEntry
);

router.put(
  '/:id/entries/:entryId',
  authorize(['Admin', 'Manager']),
  ctrl.editManualEntry
);

router.delete(
  '/:id/entries/:entryId',
  authorize(['Admin', 'Manager']),
  ctrl.deleteManualEntry
);

// ─── Monthly Summary ───────────────────────────────────────────────────────────
router.get(
  '/:id/summary',
  authorize(['Admin', 'Manager', 'Sales']),
  ctrl.getMonthlySummary
);

// ─── Sync from existing payment tables (Admin only) ────────────────────────────
router.post(
  '/:id/sync',
  authorize(['Admin', 'Manager']),
  ctrl.syncFromPayments
);

module.exports = router;
