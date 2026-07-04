/**
 * Fund Transfer Routes — Cash -> Bank deposits.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/fundTransferController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

router.get('/', authorize(FINANCE), ctrl.listTransfers);
router.post('/', authorize(FINANCE), ctrl.createTransfer);
router.delete('/:id', authorize(['Admin', 'Manager', 'Accountant']), ctrl.deleteTransfer);

module.exports = router;
