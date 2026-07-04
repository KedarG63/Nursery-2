/**
 * Cash Ledger Routes — Tally-style cash book for Cash-in-Hand.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/cashLedgerController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

// Accounts
router.get('/', authorize(FINANCE), ctrl.listAccounts);
router.post('/', authorize(['Admin', 'Accountant']), ctrl.upsertAccount);
router.put('/:id', authorize(['Admin', 'Accountant']), ctrl.upsertAccount);

// Opening balance
router.post('/:id/opening-balance', authorize(FINANCE), ctrl.setOpeningBalance);

// Ledger entries
router.get('/:id/ledger', authorize(FINANCE), ctrl.getLedger);
router.post('/:id/entries', authorize(FINANCE), ctrl.addManualEntry);
router.put('/:id/entries/:entryId', authorize(FINANCE), ctrl.editManualEntry);
router.delete('/:id/entries/:entryId', authorize(FINANCE), ctrl.deleteManualEntry);

// Monthly summary
router.get('/:id/summary', authorize(FINANCE), ctrl.getMonthlySummary);

module.exports = router;
