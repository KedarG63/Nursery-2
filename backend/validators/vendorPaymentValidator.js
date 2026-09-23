/**
 * Validators for bulk vendor payment endpoints.
 * Allocation-level checks (bill ownership, balances) live in the controller,
 * because they need the database.
 */

const PAYMENT_METHODS = ['cash', 'cheque', 'upi', 'bank_transfer'];

const isValidDate = (v) => {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
};

const validateCreateVendorPayment = (req, res, next) => {
  const errors = [];
  const {
    vendor_id, amount, payment_date, payment_method,
    payment_source, bank_account_id, cash_account_id,
  } = req.body;

  if (!vendor_id) errors.push('vendor_id is required');

  const amt = Number(amount);
  if (amount === undefined || amount === null || isNaN(amt) || amt <= 0) {
    errors.push('amount is required and must be > 0');
  }
  if (!payment_date || !isValidDate(payment_date)) {
    errors.push('payment_date is required and must be a valid date');
  }
  if (!payment_method || !PAYMENT_METHODS.includes(payment_method)) {
    errors.push(`payment_method is required and must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }

  // Money leaving the business must name the account it left, or it never
  // reaches the Cash Book / Bank Ledger.
  if (!['cash', 'bank'].includes(payment_source)) {
    errors.push('payment_source must be cash or bank');
  } else if (payment_source === 'bank' && !bank_account_id) {
    errors.push('bank_account_id is required when paying from bank');
  } else if (payment_source === 'cash' && !cash_account_id) {
    errors.push('cash_account_id is required when paying from cash');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors, message: errors[0] });
  }
  next();
};

module.exports = { validateCreateVendorPayment };
