/**
 * Vehicle Routes
 * Issue #60: Vehicle management endpoints
 */

const express = require('express');
const router = express.Router();

const vehicleController = require('../controllers/vehicleController');
const {
  validateCreateVehicle,
  validateUpdateVehicle
} = require('../validators/vehicleValidator');

// Note: Add authentication middleware when implementing
// const { authenticate, authorize } = require('../middleware/auth');

/**
 * POST /api/vehicles
 * Create a new vehicle
 * Access: Admin, Manager
 */
router.post(
  '/',
  // authenticate,
  // authorize(['Admin', 'Manager']),
  validateCreateVehicle,
  vehicleController.createVehicle
);

/**
 * GET /api/vehicles
 * Get all vehicles with filters
 * Query params: status, vehicleType, available, page, limit
 * Access: Admin, Manager, Warehouse
 */
router.get(
  '/',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  vehicleController.getVehicles
);

/**
 * GET /api/vehicles/:id
 * Get vehicle by ID
 * Access: Admin, Manager, Warehouse
 */
router.get(
  '/:id',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  vehicleController.getVehicleById
);

/**
 * PUT /api/vehicles/:id
 * Update vehicle
 * Access: Admin, Manager
 */
router.put(
  '/:id',
  // authenticate,
  // authorize(['Admin', 'Manager']),
  validateUpdateVehicle,
  vehicleController.updateVehicle
);

/**
 * DELETE /api/vehicles/:id
 * Delete vehicle (soft delete)
 * Access: Admin
 */
router.delete(
  '/:id',
  // authenticate,
  // authorize(['Admin']),
  vehicleController.deleteVehicle
);

/**
 * GET /api/vehicles/:id/maintenance
 * Get vehicle maintenance history
 * Access: Admin, Manager, Warehouse
 */
router.get(
  '/:id/maintenance',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  vehicleController.getMaintenanceHistory
);

/**
 * GET /api/vehicles/:id/location-history
 * Get vehicle GPS location history
 * Access: Admin, Manager, Warehouse
 */
router.get(
  '/:id/location-history',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  vehicleController.getLocationHistory
);

module.exports = router;
