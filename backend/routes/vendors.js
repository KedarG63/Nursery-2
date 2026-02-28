/**
 * Vendor Routes
 * Phase 22: Purchase & Seeds Management
 */

const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  validateCreateVendor,
  validateUpdateVendor,
  validateListVendors,
  validateVendorId,
} = require('../validators/vendorValidator');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/vendors
 * @desc    Create new vendor
 * @access  Admin, Manager
 */
router.post(
  '/',
  authorize(['Admin', 'Manager']),
  validateCreateVendor,
  vendorController.createVendor
);

/**
 * @route   GET /api/vendors
 * @desc    List all vendors with pagination and filters
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateListVendors,
  vendorController.listVendors
);

/**
 * @route   GET /api/vendors/:id
 * @desc    Get vendor by ID
 * @access  Admin, Manager, Warehouse
 */
router.get(
  '/:id',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateVendorId,
  vendorController.getVendorById
);

/**
 * @route   PUT /api/vendors/:id
 * @desc    Update vendor
 * @access  Admin, Manager
 */
router.put(
  '/:id',
  authorize(['Admin', 'Manager']),
  validateUpdateVendor,
  vendorController.updateVendor
);

/**
 * @route   DELETE /api/vendors/:id
 * @desc    Delete vendor (soft delete)
 * @access  Admin, Manager
 */
router.delete(
  '/:id',
  authorize(['Admin', 'Manager']),
  validateVendorId,
  vendorController.deleteVendor
);

/**
 * @route   GET /api/vendors/:id/purchases
 * @desc    Get vendor purchase history
 * @access  Admin, Manager
 */
router.get(
  '/:id/purchases',
  authorize(['Admin', 'Manager']),
  validateVendorId,
  vendorController.getVendorPurchases
);

module.exports = router;
