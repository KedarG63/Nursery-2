/**
 * Dashboard Routes
 * API endpoints for dashboard KPIs and statistics
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/dashboard/overview
 * Get comprehensive dashboard data with all insights
 */
router.get('/overview', dashboardController.getDashboardOverview);

/**
 * GET /api/dashboard/kpis
 * Get dashboard KPIs (active orders, ready lots, deliveries, revenue)
 * @deprecated Use /overview instead
 */
router.get('/kpis', dashboardController.getKPIs);

/**
 * GET /api/dashboard/recent-orders
 * Get recent orders
 * @deprecated Use /overview instead
 */
router.get('/recent-orders', dashboardController.getRecentOrders);

module.exports = router;
