/**
 * Lot Validator Middleware
 * Issue #16: [Inventory] Create lot CRUD API endpoints
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for creating a lot
 */
const validateCreateLot = [
  body('sku_id').isUUID().withMessage('SKU ID must be a valid UUID'),

  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage('Quantity must be between 1 and 100000'),

  body('growth_stage')
    .optional()
    .isIn(['seed', 'germination', 'seedling', 'transplant', 'ready'])
    .withMessage('Invalid growth stage'),

  body('current_location')
    .optional()
    .isIn(['greenhouse', 'field', 'warehouse', 'transit'])
    .withMessage('Invalid location'),

  body('planted_date').isISO8601().withMessage('Planted date must be a valid date'),

  body('notes').optional().isString().trim().isLength({ max: 10000 }).withMessage('Notes must be less than 1000 characters'),

  handleValidationErrors,
];

/**
 * Validation rules for updating growth stage
 */
const validateUpdateStage = [
  param('id').isUUID().withMessage('Lot ID must be a valid UUID'),

  body('new_stage')
    .isIn(['seed', 'germination', 'seedling', 'transplant', 'ready', 'sold'])
    .withMessage('Invalid growth stage'),

  body('reason').optional().isString().trim().isLength({ max: 255 }).withMessage('Reason must be less than 255 characters'),

  handleValidationErrors,
];

/**
 * Validation rules for updating location
 */
const validateUpdateLocation = [
  param('id').isUUID().withMessage('Lot ID must be a valid UUID'),

  body('new_location')
    .isIn(['greenhouse', 'field', 'warehouse', 'transit'])
    .withMessage('Invalid location'),

  body('reason').optional().isString().trim().isLength({ max: 255 }).withMessage('Reason must be less than 255 characters'),

  body('gps_latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid GPS latitude'),

  body('gps_longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid GPS longitude'),

  handleValidationErrors,
];

/**
 * Validation rules for listing lots
 */
const validateListLots = [
  query('sku_id').optional().isUUID().withMessage('SKU ID must be a valid UUID'),

  query('growth_stage')
    .optional()
    .isIn(['seed', 'germination', 'seedling', 'transplant', 'ready', 'sold'])
    .withMessage('Invalid growth stage'),

  query('stage')
    .optional()
    .isString()
    .withMessage('Stage must be a string'),

  query('current_location')
    .optional()
    .isIn(['greenhouse', 'field', 'warehouse', 'transit'])
    .withMessage('Invalid location'),

  query('location')
    .optional()
    .isIn(['greenhouse', 'field', 'warehouse', 'transit'])
    .withMessage('Invalid location'),

  query('from_date').optional().isISO8601().withMessage('Invalid from_date format'),

  query('to_date').optional().isISO8601().withMessage('Invalid to_date format'),

  query('ready_date_from').optional().isISO8601().withMessage('Invalid ready_date_from format'),

  query('ready_date_to').optional().isISO8601().withMessage('Invalid ready_date_to format'),

  query('search').optional().isString().withMessage('Search must be a string'),

  query('overdue').optional().isBoolean().withMessage('Overdue must be a boolean'),

  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),

  query('sort_by')
    .optional()
    .isIn(['created_at', 'lot_number', 'growth_stage', 'expected_ready_date', 'planted_date'])
    .withMessage('Invalid sort_by field'),

  query('sort_order').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),

  handleValidationErrors,
];

/**
 * Validation rules for lot ID param
 */
const validateLotId = [param('id').isUUID().withMessage('Lot ID must be a valid UUID'), handleValidationErrors];

/**
 * Validation rules for scanning lot
 */
const validateScanLot = [
  body('qr_data')
    .if(body('lot_number').not().exists())
    .notEmpty()
    .withMessage('Either qr_data or lot_number is required'),

  body('lot_number')
    .if(body('qr_data').not().exists())
    .notEmpty()
    .withMessage('Either qr_data or lot_number is required'),

  body('scan_method')
    .optional()
    .isIn(['qr_camera', 'manual_entry', 'nfc'])
    .withMessage('Invalid scan method'),

  body('device_info').optional().isObject().withMessage('Device info must be an object'),

  body('gps_latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid GPS latitude'),

  body('gps_longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid GPS longitude'),

  handleValidationErrors,
];

module.exports = {
  validateCreateLot,
  validateUpdateStage,
  validateUpdateLocation,
  validateListLots,
  validateLotId,
  validateScanLot,
};
