/**
 * Delivery Routes
 * Issue #35: Delivery route management endpoints
 */

const express = require('express');
const router = express.Router();

const deliveryController = require('../controllers/deliveryController');
const {
  validateCreateRoute,
  validateAssignRoute,
  validateStartRoute
} = require('../validators/deliveryValidator');

// Note: Add authentication middleware when implementing
// const { authenticate, authorize } = require('../middleware/auth');

/**
 * POST /api/routes
 * Create optimized delivery route from orders
 * Access: Admin, Delivery Manager
 */
router.post(
  '/',
  // authenticate,
  // authorize(['Admin', 'Manager']),
  validateCreateRoute,
  deliveryController.createRoute
);

/**
 * GET /api/routes
 * List all routes with filters
 * Query params: status, routeDate, driverId, page, limit
 * Access: Admin, Delivery Manager, Warehouse
 */
router.get(
  '/',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse', 'Delivery']),
  deliveryController.getRoutes
);

/**
 * GET /api/routes/:id
 * Get route details with stops
 * Access: Admin, Delivery Manager, Warehouse, Driver (own routes)
 */
router.get(
  '/:id',
  // authenticate,
  deliveryController.getRouteById
);

/**
 * PUT /api/routes/:id/assign
 * Assign driver and vehicle to route
 * Access: Admin, Delivery Manager
 */
router.put(
  '/:id/assign',
  // authenticate,
  // authorize(['Admin', 'Manager']),
  validateAssignRoute,
  deliveryController.assignRoute
);

/**
 * PUT /api/routes/:id/start
 * Start a route (driver or manager)
 * Access: Admin, Delivery Manager, Driver
 */
router.put(
  '/:id/start',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Delivery']),
  validateStartRoute,
  deliveryController.startRoute
);

/**
 * GET /api/routes/:id/progress
 * Get real-time route progress with GPS tracking
 * Access: Admin, Delivery Manager, Warehouse
 */
router.get(
  '/:id/progress',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  deliveryController.getRouteProgress
);

/**
 * GET /api/delivery/summary
 * Get delivery summary for dashboard
 * Access: Admin, Delivery Manager, Warehouse
 */
router.get(
  '/summary',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  deliveryController.getDeliverySummary
);

/**
 * GET /api/delivery/available-orders
 * Get orders ready for delivery (not yet assigned to routes)
 * Query params: delivery_date (optional, defaults to today)
 * Access: Admin, Delivery Manager, Warehouse
 */
router.get(
  '/available-orders',
  // authenticate,
  // authorize(['Admin', 'Manager', 'Warehouse']),
  deliveryController.getAvailableOrdersForDelivery
);

module.exports = router;
