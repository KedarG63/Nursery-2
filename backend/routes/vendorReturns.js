/**
 * Vendor Return Routes
 *
 * Handles the full lifecycle of seed packet returns to vendors and the
 * subsequent credit application against future purchase payments.
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/vendorReturnController');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/authorize');

router.use(authenticate);

// ── Read ─────────────────────────────────────────────────────────────────────
router.get('/', authorize(['Admin', 'Manager', 'Sales']),            ctrl.listReturns);
router.get('/available-credits/:vendorId',
           authorize(['Admin', 'Manager', 'Sales']),                  ctrl.getAvailableCredits);
router.get('/:id', authorize(['Admin', 'Manager', 'Sales']),         ctrl.getReturn);

// ── Write ────────────────────────────────────────────────────────────────────
router.post('/',    authorize(['Admin', 'Manager']),                  ctrl.createReturn);
router.put('/:id',  authorize(['Admin', 'Manager']),                  ctrl.updateReturn);
router.delete('/:id', authorize(['Admin', 'Manager']),                ctrl.deleteReturn);

// ── Status transitions ───────────────────────────────────────────────────────
router.post('/:id/submit',       authorize(['Admin', 'Manager']),     ctrl.submitReturn);
router.post('/:id/accept',       authorize(['Admin', 'Manager']),     ctrl.acceptReturn);
router.post('/:id/reject',       authorize(['Admin', 'Manager']),     ctrl.rejectReturn);
router.post('/:id/apply-credit', authorize(['Admin', 'Manager']),     ctrl.applyCredit);

module.exports = router;
