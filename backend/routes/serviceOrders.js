const express = require('express');
const router = express.Router();
const serviceOrderController = require('../controllers/serviceOrderController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

/**
 * Service Order Routes
 * Feature: Service / Grow-Only orders (customer brings own seeds, flat service fee)
 */

router.get(
  '/',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.listServiceOrders
);

router.get(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.getServiceOrder
);

router.post(
  '/',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.createServiceOrder
);

router.put(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.updateServiceOrder
);

router.put(
  '/:id/status',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.updateServiceOrderStatus
);

router.post(
  '/:id/payments',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  serviceOrderController.recordPayment
);

router.delete(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  serviceOrderController.deleteServiceOrder
);

module.exports = router;
