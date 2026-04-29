/**
 * Order Routes
 * API endpoints for order management
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const {
  validateCreateOrder,
  validateUpdateStatus,
  validateAllocateLots,
  validateListOrders,
} = require('../validators/orderValidator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/orders
 * Create a new order
 * Access: Admin, Manager, Sales
 */
router.post(
  '/',
  authorize(['Admin', 'Manager', 'Sales']),
  validateCreateOrder,
  orderController.createOrder
);

/**
 * GET /api/orders
 * List orders with filters and pagination
 * Access: All authenticated users
 */
router.get('/', validateListOrders, orderController.listOrders);

/**
 * POST /api/orders/check-availability
 * Check lot availability for order items
 * Access: All authenticated users
 */
router.post('/check-availability', orderController.checkAvailability);

/**
 * GET /api/orders/recent
 * Get recent orders
 * Access: All authenticated users
 */
router.get('/recent', orderController.getRecentOrders);

/**
 * GET /api/orders/:id
 * Get single order details
 * Access: All authenticated users
 */
router.get('/:id', orderController.getOrder);

/**
 * PUT /api/orders/:id/status
 * Update order status
 * Access: Admin, Manager, Warehouse
 */
router.put(
  '/:id/status',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateUpdateStatus,
  orderController.updateOrderStatus
);

/**
 * POST /api/orders/:id/allocate
 * Allocate lots to order (manual or automatic)
 * Access: Admin, Manager, Warehouse
 */
router.post(
  '/:id/allocate',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateAllocateLots,
  orderController.allocateLots
);

/**
 * GET /api/orders/:id/timeline
 * Get order status history timeline
 * Access: All authenticated users
 */
router.get('/:id/timeline', orderController.getOrderTimeline);

/**
 * DELETE /api/orders/:id
 * Soft-delete an order
 * Access: Admin, Manager
 */
router.delete('/:id', authorize(['Admin', 'Manager']), orderController.deleteOrder);

module.exports = router;
