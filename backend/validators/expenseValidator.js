/**
 * Expense Validation Middleware
 */

const isValidUUID = (uuid) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s).getTime());

const PAYMENT_SOURCES = ['cash', 'bank'];

const validateExpense = (req, res, next) => {
  const {
    expense_date, category_id, vendor_id, amount, tax_amount,
    payment_source, bank_account_id, cash_account_id,
  } = req.body;
  const errors = [];

  if (!isValidDate(expense_date)) errors.push('Valid expense_date (YYYY-MM-DD) is required');
  if (!category_id || !isValidUUID(category_id)) errors.push('Valid category_id is required');
  if (vendor_id && !isValidUUID(vendor_id)) errors.push('vendor_id must be a valid UUID');

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) errors.push('amount must be a positive number');
  if (tax_amount !== undefined && tax_amount !== null && tax_amount !== '') {
    const tax = Number(tax_amount);
    if (isNaN(tax) || tax < 0) errors.push('tax_amount must be 0 or greater');
  }

  if (!PAYMENT_SOURCES.includes(payment_source)) {
    errors.push(`payment_source is required and must be one of: ${PAYMENT_SOURCES.join(', ')}`);
  } else if (payment_source === 'bank') {
    if (!bank_account_id || !isValidUUID(bank_account_id)) errors.push('bank_account_id is required when payment_source is "bank"');
  } else if (payment_source === 'cash') {
    if (!cash_account_id || !isValidUUID(cash_account_id)) errors.push('cash_account_id is required when payment_source is "cash"');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  next();
};

module.exports = { validateExpense, PAYMENT_SOURCES };
