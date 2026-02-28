/**
 * Vendor Validator
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

// Create vendor validation
const validateCreateVendor = [
  body('vendor_name')
    .trim()
    .notEmpty()
    .withMessage('Vendor name is required')
    .isLength({ max: 255 })
    .withMessage('Vendor name must be less than 255 characters'),

  body('vendor_code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Vendor code must be less than 50 characters'),

  body('contact_person')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Contact person must be less than 255 characters'),

  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[\d\s-()]+$/)
    .withMessage('Invalid phone number format'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email address'),

  body('gst_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('GST number must be less than 50 characters'),

  body('payment_terms')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment terms must be between 0 and 365 days'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'blacklisted'])
    .withMessage('Status must be active, inactive, or blacklisted'),

  validate,
];

// Update vendor validation
const validateUpdateVendor = [
  param('id')
    .isUUID()
    .withMessage('Invalid vendor ID'),

  body('vendor_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Vendor name cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Vendor name must be less than 255 characters'),

  body('vendor_code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Vendor code must be less than 50 characters'),

  body('contact_person')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Contact person must be less than 255 characters'),

  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[\d\s-()]+$/)
    .withMessage('Invalid phone number format'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email address'),

  body('gst_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('GST number must be less than 50 characters'),

  body('payment_terms')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment terms must be between 0 and 365 days'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'blacklisted'])
    .withMessage('Status must be active, inactive, or blacklisted'),

  validate,
];

// List vendors validation
const validateListVendors = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a positive number'),

  query('status')
    .optional()
    .isIn(['active', 'inactive', 'blacklisted'])
    .withMessage('Invalid status filter'),

  validate,
];

// Vendor ID validation
const validateVendorId = [
  param('id')
    .isUUID()
    .withMessage('Invalid vendor ID'),

  validate,
];

module.exports = {
  validateCreateVendor,
  validateUpdateVendor,
  validateListVendors,
  validateVendorId,
};
