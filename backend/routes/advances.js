/**
 * Advance Routes — salary/wage advances.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/advanceController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

router.get('/', authorize(FINANCE), ctrl.listAdvances);
router.post('/', authorize(FINANCE), ctrl.createAdvance);
router.delete('/:id', authorize(['Admin', 'Manager', 'Accountant']), ctrl.deleteAdvance);

module.exports = router;
