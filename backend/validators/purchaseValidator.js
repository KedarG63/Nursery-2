/**
 * Purchase Validator
 * Phase 22: Purchase & Seeds Management
 */

const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

// Create purchase validation
const validateCreatePurchase = [
  body('vendor_id')
    .notEmpty()
    .withMessage('Vendor is required')
    .isUUID()
    .withMessage('Invalid vendor ID'),

  body('product_id')
    .notEmpty()
    .withMessage('Product is required')
    .isUUID()
    .withMessage('Invalid product ID'),

  body('sku_id')
    .optional()
    .isUUID()
    .withMessage('Invalid SKU ID'),

  body('seed_lot_number')
    .trim()
    .notEmpty()
    .withMessage('Seed lot number is required')
    .isLength({ max: 100 })
    .withMessage('Seed lot number must be less than 100 characters'),

  body('number_of_packets')
    .notEmpty()
    .withMessage('Number of packets is required')
    .isInt({ min: 1 })
    .withMessage('Number of packets must be at least 1'),

  body('seeds_per_packet')
    .notEmpty()
    .withMessage('Seeds per packet is required')
    .isInt({ min: 1 })
    .withMessage('Seeds per packet must be at least 1'),

  body('cost_per_packet')
    .notEmpty()
    .withMessage('Cost per packet is required')
    .isFloat({ min: 0.01 })
    .withMessage('Cost per packet must be greater than 0'),

  body('shipping_cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Shipping cost must be a positive number'),

  body('tax_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax amount must be a positive number'),

  body('other_charges')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Other charges must be a positive number'),

  body('germination_rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Germination rate must be between 0 and 100'),

  body('purity_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Purity percentage must be between 0 and 100'),

  body('expiry_date')
    .notEmpty()
    .withMessage('Expiry date is required')
    .isISO8601()
    .withMessage('Invalid expiry date format'),

  body('purchase_date')
    .notEmpty()
    .withMessage('Purchase date is required')
    .isISO8601()
    .withMessage('Invalid purchase date format'),

  body('invoice_number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be less than 100 characters'),

  body('invoice_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid invoice date format'),

  body('storage_location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Storage location must be less than 100 characters'),

  validate,
];

// Update purchase validation
const validateUpdatePurchase = [
  param('id')
    .isUUID()
    .withMessage('Invalid purchase ID'),

  body('vendor_id')
    .optional()
    .isUUID()
    .withMessage('Invalid vendor ID'),

  body('product_id')
    .optional()
    .isUUID()
    .withMessage('Invalid product ID'),

  body('sku_id')
    .optional()
    .isUUID()
    .withMessage('Invalid SKU ID'),

  body('seed_lot_number')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Seed lot number cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Seed lot number must be less than 100 characters'),

  body('number_of_packets')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Number of packets must be at least 1'),

  body('seeds_per_packet')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Seeds per packet must be at least 1'),

  body('cost_per_packet')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Cost per packet must be greater than 0'),

  body('shipping_cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Shipping cost must be a positive number'),

  body('tax_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax amount must be a positive number'),

  body('other_charges')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Other charges must be a positive number'),

  body('germination_rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Germination rate must be between 0 and 100'),

  body('purity_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Purity percentage must be between 0 and 100'),

  body('expiry_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date format'),

  body('purchase_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid purchase date format'),

  body('invoice_number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be less than 100 characters'),

  body('invoice_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid invoice date format'),

  body('storage_location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Storage location must be less than 100 characters'),

  validate,
];

// List purchases validation
const validateListPurchases = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a positive number'),

  query('vendor_id')
    .optional()
    .isUUID()
    .withMessage('Invalid vendor ID'),

  query('product_id')
    .optional()
    .isUUID()
    .withMessage('Invalid product ID'),

  query('inventory_status')
    .optional()
    .isIn(['available', 'low_stock', 'exhausted', 'expired'])
    .withMessage('Invalid inventory status'),

  query('payment_status')
    .optional()
    .isIn(['pending', 'partial', 'paid'])
    .withMessage('Invalid payment status'),

  validate,
];

// Purchase ID validation
const validatePurchaseId = [
  param('id')
    .isUUID()
    .withMessage('Invalid purchase ID'),

  validate,
];

// Payment validation
const validateRecordPayment = [
  param('id')
    .isUUID()
    .withMessage('Invalid purchase ID'),

  body('payment_date')
    .notEmpty()
    .withMessage('Payment date is required')
    .isISO8601()
    .withMessage('Invalid payment date format'),

  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),

  body('payment_method')
    .optional()
    .trim()
    .isIn(['cash', 'bank_transfer', 'check', 'upi', 'card'])
    .withMessage('Invalid payment method'),

  body('transaction_reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Transaction reference must be less than 100 characters'),

  validate,
];

// Check availability validation
const validateCheckAvailability = [
  query('product_id')
    .notEmpty()
    .withMessage('Product ID is required')
    .isUUID()
    .withMessage('Invalid product ID'),

  query('sku_id')
    .optional()
    .isUUID()
    .withMessage('Invalid SKU ID'),

  query('seeds_needed')
    .notEmpty()
    .withMessage('Seeds needed is required')
    .isInt({ min: 1 })
    .withMessage('Seeds needed must be at least 1'),

  validate,
];

module.exports = {
  validateCreatePurchase,
  validateUpdatePurchase,
  validateListPurchases,
  validatePurchaseId,
  validateRecordPayment,
  validateCheckAvailability,
};
