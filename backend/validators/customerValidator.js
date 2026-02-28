const { body, param, query } = require('express-validator');

/**
 * Customer Validation Rules
 * Issue: #20 - Create customer CRUD API endpoints
 */

const validateCreateCustomer = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2-200 characters'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone is required')
    .matches(/^(\+91)?[6-9][0-9]{9}$/)
    .withMessage('Phone must be a valid 10-digit Indian mobile number')
    .customSanitizer((value) => {
      // Normalize to +91XXXXXXXXXX format
      const cleaned = value.replace(/^\+91/, '');
      return `+91${cleaned}`;
    }),

  body('whatsapp_number')
    .optional()
    .trim()
    .matches(/^(\+91)?[6-9][0-9]{9}$/)
    .withMessage('WhatsApp must be a valid 10-digit Indian mobile number')
    .customSanitizer((value) => {
      // Normalize to +91XXXXXXXXXX format
      if (!value) return value;
      const cleaned = value.replace(/^\+91/, '');
      return `+91${cleaned}`;
    }),

  body('customer_type')
    .optional()
    .customSanitizer((value) => {
      // Map frontend values to database enum values
      const mapping = {
        'Retail': 'retailer',
        'Wholesale': 'retailer',
        'Distributor': 'retailer'
      };
      return mapping[value] || value?.toLowerCase();
    })
    .isIn(['farmer', 'retailer', 'home_gardener', 'institutional'])
    .withMessage('Invalid customer type'),

  body('gst_number')
    .optional()
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number format'),

  body('credit_limit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be non-negative'),

  body('credit_days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Credit days must be 1-365'),

  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

const validateUpdateCustomer = [
  param('id').isUUID().withMessage('Invalid customer ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2-200 characters'),

  body('email').optional().trim().isEmail().withMessage('Invalid email format').normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^(\+91)?[6-9][0-9]{9}$/)
    .withMessage('Phone must be a valid 10-digit Indian mobile number')
    .customSanitizer((value) => {
      // Normalize to +91XXXXXXXXXX format
      if (!value) return value;
      const cleaned = value.replace(/^\+91/, '');
      return `+91${cleaned}`;
    }),

  body('whatsapp_number')
    .optional()
    .trim()
    .matches(/^(\+91)?[6-9][0-9]{9}$/)
    .withMessage('WhatsApp must be a valid 10-digit Indian mobile number')
    .customSanitizer((value) => {
      // Normalize to +91XXXXXXXXXX format
      if (!value) return value;
      const cleaned = value.replace(/^\+91/, '');
      return `+91${cleaned}`;
    }),

  body('customer_type')
    .optional()
    .customSanitizer((value) => {
      // Map frontend values to database enum values
      const mapping = {
        'Retail': 'retailer',
        'Wholesale': 'retailer',
        'Distributor': 'retailer'
      };
      return mapping[value] || value?.toLowerCase();
    })
    .isIn(['farmer', 'retailer', 'home_gardener', 'institutional'])
    .withMessage('Invalid customer type'),

  body('gst_number')
    .optional()
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number format'),

  body('credit_limit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be non-negative'),

  body('credit_days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Credit days must be 1-365'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'blocked'])
    .withMessage('Invalid status'),

  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object'),

  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
];

const validateCustomerId = [param('id').isUUID().withMessage('Invalid customer ID')];

const validateListCustomers = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('customer_type')
    .optional()
    .isIn(['farmer', 'retailer', 'home_gardener', 'institutional'])
    .withMessage('Invalid customer type'),
  query('status').optional().isIn(['active', 'inactive', 'blocked']).withMessage('Invalid status'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search must be at least 2 characters')
];

// Address validators
const validateCreateAddress = [
  body('customer_id').isUUID().withMessage('Invalid customer ID'),
  body('address_line1')
    .trim()
    .notEmpty()
    .withMessage('Address line 1 is required')
    .isLength({ max: 255 })
    .withMessage('Address line 1 too long'),
  body('address_line2').optional().trim().isLength({ max: 255 }).withMessage('Address line 2 too long'),
  body('landmark').optional().trim().isLength({ max: 100 }).withMessage('Landmark too long'),
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ max: 100 })
    .withMessage('City name too long'),
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isLength({ max: 100 })
    .withMessage('State name too long'),
  body('pincode')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('gps_latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('GPS latitude must be between -90 and 90'),
  body('gps_longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('GPS longitude must be between -180 and 180'),
  body('address_type')
    .optional()
    .isIn(['billing', 'delivery', 'both'])
    .withMessage('Address type must be billing, delivery, or both'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('delivery_instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Delivery instructions too long')
];

const validateUpdateAddress = [
  param('id').isUUID().withMessage('Invalid address ID'),
  body('address_line1')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Address line 1 cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Address line 1 too long'),
  body('address_line2').optional().trim().isLength({ max: 255 }).withMessage('Address line 2 too long'),
  body('landmark').optional().trim().isLength({ max: 100 }).withMessage('Landmark too long'),
  body('city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('City cannot be empty')
    .isLength({ max: 100 })
    .withMessage('City name too long'),
  body('state')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('State cannot be empty')
    .isLength({ max: 100 })
    .withMessage('State name too long'),
  body('pincode')
    .optional()
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('gps_latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('GPS latitude must be between -90 and 90'),
  body('gps_longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('GPS longitude must be between -180 and 180'),
  body('address_type')
    .optional()
    .isIn(['billing', 'delivery', 'both'])
    .withMessage('Address type must be billing, delivery, or both'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('delivery_instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Delivery instructions too long')
];

module.exports = {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateCustomerId,
  validateListCustomers,
  validateCreateAddress,
  validateUpdateAddress
};
