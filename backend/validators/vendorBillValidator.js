/**
 * Validators for vendor bill (AP) endpoints
 * Phase 23: Billing & Accounting
 */

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer'];

const isValidDate = (v) => {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
};

const validateUpdateDueDate = (req, res, next) => {
  const errors = [];
  const { due_date } = req.body;

  if (!due_date || !isValidDate(due_date)) {
    errors.push('due_date is required and must be a valid date');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

const validateRecordVendorPayment = (req, res, next) => {
  const errors = [];
  const { amount, payment_method, payment_date } = req.body;

  const amt = Number(amount);
  if (amount === undefined || amount === null || isNaN(amt) || amt <= 0) {
    errors.push('amount is required and must be > 0');
  }
  if (!payment_method || !PAYMENT_METHODS.includes(payment_method)) {
    errors.push(`payment_method is required and must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }
  if (!payment_date || !isValidDate(payment_date)) {
    errors.push('payment_date is required and must be a valid date');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

module.exports = {
  validateUpdateDueDate,
  validateRecordVendorPayment,
};
