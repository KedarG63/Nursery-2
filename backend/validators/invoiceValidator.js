/**
 * Validators for invoice endpoints
 * Phase 23: Billing & Accounting
 */

const isValidUUID = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const isValidDate = (v) => {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
};

const validateItem = (item, index) => {
  const errs = [];
  if (!item.description || String(item.description).trim() === '') {
    errs.push(`items[${index}].description is required`);
  }
  const qty = Number(item.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    errs.push(`items[${index}].quantity must be a positive integer`);
  }
  const price = Number(item.unit_price);
  if (isNaN(price) || price < 0) {
    errs.push(`items[${index}].unit_price must be >= 0`);
  }
  if (item.discount_amount !== undefined && item.discount_amount !== null) {
    const disc = Number(item.discount_amount);
    if (isNaN(disc) || disc < 0) {
      errs.push(`items[${index}].discount_amount must be >= 0`);
    }
  }
  if (item.tax_rate !== undefined && item.tax_rate !== null) {
    const rate = Number(item.tax_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      errs.push(`items[${index}].tax_rate must be between 0 and 100`);
    }
  }
  if (item.order_item_id && !isValidUUID(item.order_item_id)) {
    errs.push(`items[${index}].order_item_id must be a valid UUID`);
  }
  if (item.sku_id && !isValidUUID(item.sku_id)) {
    errs.push(`items[${index}].sku_id must be a valid UUID`);
  }
  return errs;
};

const validateCreateInvoice = (req, res, next) => {
  const errors = [];
  const { customer_id, order_id, invoice_date, due_date, items, discount_amount, tax_rate } = req.body;

  if (!customer_id || !isValidUUID(customer_id)) {
    errors.push('customer_id is required and must be a valid UUID');
  }
  if (order_id && !isValidUUID(order_id)) {
    errors.push('order_id must be a valid UUID');
  }
  if (!invoice_date || !isValidDate(invoice_date)) {
    errors.push('invoice_date is required and must be a valid date');
  }
  if (!due_date || !isValidDate(due_date)) {
    errors.push('due_date is required and must be a valid date');
  }
  if (invoice_date && due_date && isValidDate(invoice_date) && isValidDate(due_date)) {
    if (new Date(due_date) < new Date(invoice_date)) {
      errors.push('due_date must be on or after invoice_date');
    }
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    items.forEach((item, i) => {
      errors.push(...validateItem(item, i));
    });
  }
  if (discount_amount !== undefined && discount_amount !== null) {
    const disc = Number(discount_amount);
    if (isNaN(disc) || disc < 0) {
      errors.push('discount_amount must be >= 0');
    }
  }
  if (tax_rate !== undefined && tax_rate !== null) {
    const rate = Number(tax_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      errors.push('tax_rate must be between 0 and 100');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

const validateUpdateInvoice = (req, res, next) => {
  const errors = [];
  const { invoice_date, due_date, items, discount_amount, tax_rate } = req.body;

  if (invoice_date && !isValidDate(invoice_date)) {
    errors.push('invoice_date must be a valid date');
  }
  if (due_date && !isValidDate(due_date)) {
    errors.push('due_date must be a valid date');
  }
  if (invoice_date && due_date && isValidDate(invoice_date) && isValidDate(due_date)) {
    if (new Date(due_date) < new Date(invoice_date)) {
      errors.push('due_date must be on or after invoice_date');
    }
  }
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      errors.push('items must be a non-empty array');
    } else {
      items.forEach((item, i) => {
        errors.push(...validateItem(item, i));
      });
    }
  }
  if (discount_amount !== undefined && discount_amount !== null) {
    const disc = Number(discount_amount);
    if (isNaN(disc) || disc < 0) {
      errors.push('discount_amount must be >= 0');
    }
  }
  if (tax_rate !== undefined && tax_rate !== null) {
    const rate = Number(tax_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      errors.push('tax_rate must be between 0 and 100');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

const validateApplyPayment = (req, res, next) => {
  const errors = [];
  const { payment_id, amount_applied } = req.body;

  if (!payment_id || !isValidUUID(payment_id)) {
    errors.push('payment_id is required and must be a valid UUID');
  }
  const amount = Number(amount_applied);
  if (amount_applied === undefined || amount_applied === null || isNaN(amount) || amount <= 0) {
    errors.push('amount_applied is required and must be > 0');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

module.exports = {
  validateCreateInvoice,
  validateUpdateInvoice,
  validateApplyPayment,
};
