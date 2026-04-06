/**
 * Trash Routes
 * Recycle bin for soft-deleted records (Admin & Manager only)
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/trashController');

router.use(authenticate);
router.use(authorize(['Admin', 'Manager']));

// List all trashed items (filterable by type)
router.get('/', ctrl.listTrash);

// Count for sidebar badge
router.get('/count', ctrl.getTrashCount);

// Restore endpoints
router.post('/lots/:id/restore',      ctrl.restoreLot);
router.post('/orders/:id/restore',    ctrl.restoreOrder);
router.post('/customers/:id/restore', ctrl.restoreCustomer);
router.post('/purchases/:id/restore', ctrl.restorePurchase);

// Permanent delete (Admin only)
router.delete('/:type/:id/permanent', authorize(['Admin']), ctrl.permanentDelete);

module.exports = router;
