const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateCustomerId,
  validateListCustomers,
  validateCreateAddress,
  validateUpdateAddress
} = require('../validators/customerValidator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validationResult } = require('express-validator');

/**
 * Customer Routes
 * Issue: #20 - Create customer CRUD API endpoints
 */

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Customer routes
router.get(
  '/',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateListCustomers,
  handleValidationErrors,
  customerController.listCustomers
);

router.get(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateCustomerId,
  handleValidationErrors,
  customerController.getCustomerById
);

router.post(
  '/',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateCreateCustomer,
  handleValidationErrors,
  customerController.createCustomer
);

router.put(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateUpdateCustomer,
  handleValidationErrors,
  customerController.updateCustomer
);

router.delete(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateCustomerId,
  handleValidationErrors,
  customerController.deleteCustomer
);

// Address routes (nested under customers)
router.post(
  '/addresses',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateCreateAddress,
  handleValidationErrors,
  customerController.createAddress
);

router.put(
  '/addresses/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateUpdateAddress,
  handleValidationErrors,
  customerController.updateAddress
);

router.delete(
  '/addresses/:id',
  authenticate,
  authorize(['Admin', 'Manager', 'Sales']),
  validateCustomerId,
  handleValidationErrors,
  customerController.deleteAddress
);

// Credit management route
router.get(
  '/:id/credit',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateCustomerId,
  handleValidationErrors,
  customerController.getCustomerCredit
);

module.exports = router;
