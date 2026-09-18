/**
 * Customer Returns Routes
 *
 * Seedlings/saplings brought back by customers, restocked, and settled by
 * order offset (automatic), refund, or store credit.
 *
 * ROUTE ORDER MATTERS: every literal path is declared before `/:id`, otherwise
 * Express matches the parameter route first and tries to treat "store-credit"
 * or "order" as a return id.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customerReturnController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

const READ = ['Admin', 'Manager', 'Sales', 'Accountant'];
const WRITE = ['Admin', 'Manager'];

// ── Literal paths first ──────────────────────────────────────────────────────
router.get('/order/:orderId/returnable', authorize(READ), ctrl.getReturnable);
router.get('/store-credit/:customerId', authorize(READ), ctrl.getStoreCredit);
router.post('/store-credit/apply', authorize(WRITE), ctrl.applyStoreCredit);

// ── Collection ───────────────────────────────────────────────────────────────
router.get('/', authorize(READ), ctrl.listReturns);
router.post('/', authorize(WRITE), ctrl.createReturn);

// ── Single return (parameter routes last) ────────────────────────────────────
router.get('/:id', authorize(READ), ctrl.getReturn);
router.post('/:id/accept', authorize(WRITE), ctrl.acceptReturn);
router.post('/:id/refund', authorize(WRITE), ctrl.recordRefund);
router.post('/:id/store-credit', authorize(WRITE), ctrl.issueStoreCredit);
router.post('/:id/cancel', authorize(WRITE), ctrl.cancelReturn);

module.exports = router;
