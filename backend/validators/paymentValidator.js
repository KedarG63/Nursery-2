/**
 * Payment Validation Middleware
 */

const PAYMENT_METHODS = [
  'cash',
  'card',
  'upi',
  'bank_transfer',
  'credit',
  'cod',
];
const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'success',
  'failed',
  'refunded',
  'cancelled',
];

/**
 * Validate initiate payment request
 */
const validateInitiatePayment = (req, res, next) => {
  const { order_id, amount, payment_method } = req.body;
  const errors = [];

  if (!order_id || !isValidUUID(order_id)) {
    errors.push('Valid order_id is required');
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
    errors.push(
      `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`
    );
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate record offline payment
 */
const validateRecordPayment = (req, res, next) => {
  const { order_id, amount, payment_method, receipt_number } = req.body;
  const errors = [];

  if (!order_id || !isValidUUID(order_id)) {
    errors.push('Valid order_id is required');
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (!payment_method || !PAYMENT_METHODS.includes(payment_method)) {
    errors.push(
      `payment_method is required and must be one of: ${PAYMENT_METHODS.join(', ')}`
    );
  }

  // Receipt number required for offline payments
  if (['cash', 'bank_transfer'].includes(payment_method) && !receipt_number) {
    errors.push('receipt_number is required for cash/bank transfer payments');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate refund request
 */
const validateRefund = (req, res, next) => {
  const { payment_id, amount, reason } = req.body;
  const errors = [];

  if (!payment_id || !isValidUUID(payment_id)) {
    errors.push('Valid payment_id is required');
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (!reason || reason.trim().length === 0) {
    errors.push('reason is required for refund');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Helper function to validate UUID
 */
const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

module.exports = {
  validateInitiatePayment,
  validateRecordPayment,
  validateRefund,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
};
