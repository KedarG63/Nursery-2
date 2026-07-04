/**
 * Expense Routes — daily business expenses with auto cash/bank ledger posting.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/expenseController');
const { validateExpense } = require('../validators/expenseValidator');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

// ─── Categories (declare before /:id routes) ──────────────────────────────────
router.get('/categories', authorize(FINANCE), ctrl.listCategories);
router.post('/categories', authorize(FINANCE), ctrl.createCategory);
router.put('/categories/:id', authorize(FINANCE), ctrl.updateCategory);

// ─── Summary ──────────────────────────────────────────────────────────────────
router.get('/summary', authorize(FINANCE), ctrl.getExpenseSummary);

// ─── Expenses ─────────────────────────────────────────────────────────────────
router.get('/', authorize(FINANCE), ctrl.listExpenses);
router.post('/', authorize(FINANCE), validateExpense, ctrl.createExpense);
router.put('/:id', authorize(FINANCE), validateExpense, ctrl.updateExpense);
router.delete('/:id', authorize(['Admin', 'Manager', 'Accountant']), ctrl.deleteExpense);

module.exports = router;
