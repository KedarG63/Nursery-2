/**
 * Purchase Routes
 * Phase 22: Purchase & Seeds Management
 */

const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  validateCreatePurchase,
  validateUpdatePurchase,
  validateListPurchases,
  validatePurchaseId,
  validateRecordPayment,
  validateCheckAvailability,
} = require('../validators/purchaseValidator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/purchases
 * @desc    Create new seed purchase
 * @access  Admin, Manager
 */
router.post(
  '/',
  authorize(['Admin', 'Manager']),
  validateCreatePurchase,
  purchaseController.createPurchase
);

/**
 * @route   GET /api/purchases
 * @desc    List all purchases with pagination and filters
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateListPurchases,
  purchaseController.listPurchases
);

/**
 * @route   GET /api/purchases/check-availability
 * @desc    Check seed availability for lot creation
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/check-availability',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateCheckAvailability,
  purchaseController.checkAvailability
);

/**
 * @route   GET /api/purchases/expiring-soon
 * @desc    Get seeds expiring soon
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/expiring-soon',
  authorize(['Admin', 'Manager', 'Warehouse']),
  purchaseController.getExpiringSoon
);

/**
 * @route   GET /api/purchases/low-stock
 * @desc    Get low stock alerts
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/low-stock',
  authorize(['Admin', 'Manager', 'Warehouse']),
  purchaseController.getLowStock
);

/**
 * @route   GET /api/purchases/:id
 * @desc    Get purchase by ID
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/:id',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validatePurchaseId,
  purchaseController.getPurchaseById
);

/**
 * @route   PUT /api/purchases/:id
 * @desc    Update purchase
 * @access  Admin, Manager
 */
router.put(
  '/:id',
  authorize(['Admin', 'Manager']),
  validateUpdatePurchase,
  purchaseController.updatePurchase
);

/**
 * @route   DELETE /api/purchases/:id
 * @desc    Delete purchase (soft delete)
 * @access  Admin, Manager
 */
router.delete(
  '/:id',
  authorize(['Admin', 'Manager']),
  validatePurchaseId,
  purchaseController.deletePurchase
);

/**
 * @route   POST /api/purchases/:id/payments
 * @desc    Record payment for purchase
 * @access  Admin, Manager
 */
router.post(
  '/:id/payments',
  authorize(['Admin', 'Manager']),
  validateRecordPayment,
  purchaseController.recordPayment
);

/**
 * @route   GET /api/purchases/:id/usage-history
 * @desc    Get purchase usage history
 * @access  Admin, Manager
 */
router.get(
  '/:id/usage-history',
  authorize(['Admin', 'Manager']),
  validatePurchaseId,
  purchaseController.getUsageHistory
);

module.exports = router;
