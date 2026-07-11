/**
 * Reports Routes
 * Phase 15: Reports & Analytics API
 * Issues #70-#74
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const reportController = require('../controllers/reportController');

// All report endpoints require authentication and Admin/Manager/Sales roles
const reportAuth = [authenticate, authorize(['Admin', 'Manager', 'Sales'])];

/**
 * Issue #70: Sales Report API
 * GET /api/reports/sales
 * Query params: start_date, end_date, group_by (day|week|month)
 */
router.get('/sales', reportAuth, reportController.getSalesReport);

/**
 * Issue #71: Inventory Report API
 * GET /api/reports/inventory
 */
router.get('/inventory', reportAuth, reportController.getInventoryReport);

/**
 * Issue #72: Delivery Performance Report API
 * GET /api/reports/delivery
 * Query params: start_date, end_date, driver_id
 */
router.get('/delivery', reportAuth, reportController.getDeliveryReport);

/**
 * Issue #73: Customer Analytics Report API
 * GET /api/reports/customers
 * Query params: start_date, end_date
 */
router.get('/customers', reportAuth, reportController.getCustomerReport);

/**
 * Issue #74: Financial Summary Report API
 * GET /api/reports/financial
 * Query params: start_date, end_date, group_by (day|week|month)
 */
router.get('/financial', reportAuth, reportController.getFinancialReport);

/**
 * Variety 360 Report API — per-SKU bought/produced/stock/sold/prices
 * GET /api/reports/varieties          (query: from_date, to_date — optional)
 * GET /api/reports/varieties/:skuId   (full detail for one variety)
 */
router.get('/varieties', reportAuth, reportController.getVarietyReport);
router.get('/varieties/:skuId', reportAuth, reportController.getVarietyDetail);

module.exports = router;
