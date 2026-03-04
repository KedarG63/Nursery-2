/**
 * Invoice Controller
 * Phase 23: Billing & Accounting
 *
 * Manages sales invoices, invoice items, applied payments, and AR reports.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { generateInvoiceHTML } = require('../services/invoiceService');

// ─────────────────────────────────────────────────────────────────────────────
// LIST INVOICES
// GET /api/invoices
// ─────────────────────────────────────────────────────────────────────────────
const listInvoices = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      customer_id,
      order_id,
      from_date,
      to_date,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['i.deleted_at IS NULL'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`i.customer_id = $${params.length}`);
    }
    if (order_id) {
      params.push(order_id);
      conditions.push(`i.order_id = $${params.length}`);
    }
    if (from_date) {
      params.push(from_date);
      conditions.push(`i.invoice_date >= $${params.length}`);
    }
    if (to_date) {
      params.push(to_date);
      conditions.push(`i.invoice_date <= $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await db.query(
      `SELECT
         i.id, i.invoice_number, i.invoice_date, i.due_date, i.status,
         i.subtotal_amount, i.discount_amount, i.tax_amount, i.total_amount,
         i.paid_amount, i.balance_amount, i.created_at,
         c.id AS customer_id, c.name AS customer_name, c.customer_code,
         o.order_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN orders    o ON o.id = i.order_id
       WHERE ${whereClause}
       ORDER BY i.invoice_date DESC, i.invoice_number DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE INVOICE (with items + applied payments)
// GET /api/invoices/:id
// ─────────────────────────────────────────────────────────────────────────────
const getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoiceResult = await db.query(
      `SELECT
         i.*,
         c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
         c.email AS customer_email, c.gst_number AS customer_gst,
         o.order_number, o.order_date, o.status AS order_status
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN orders    o ON o.id = i.order_id
       WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Fetch items
    const itemsResult = await db.query(
      `SELECT ii.*, s.sku_code
       FROM invoice_items ii
       LEFT JOIN skus s ON s.id = ii.sku_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.created_at ASC`,
      [id]
    );

    // Fetch applied payments
    const paymentsResult = await db.query(
      `SELECT
         ip.id, ip.invoice_id, ip.payment_id, ip.amount_applied, ip.applied_at, ip.notes,
         p.transaction_id, p.payment_method, p.payment_date, p.amount AS payment_total,
         u.full_name AS applied_by_name
       FROM invoice_payments ip
       JOIN payments p ON p.id = ip.payment_id
       LEFT JOIN users u ON u.id = ip.applied_by
       WHERE ip.invoice_id = $1
       ORDER BY ip.applied_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...invoice,
        items: itemsResult.rows,
        applied_payments: paymentsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE INVOICE
// POST /api/invoices
// ─────────────────────────────────────────────────────────────────────────────
const createInvoice = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      customer_id,
      order_id,
      invoice_date,
      due_date,
      discount_amount = 0,
      tax_rate = 18,
      notes,
      terms_and_conditions,
      items,
    } = req.body;

    await client.query('BEGIN');

    // Validate customer exists
    const customerCheck = await client.query(
      'SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [customer_id]
    );
    if (customerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // If order_id provided, validate it belongs to customer and check for duplicate invoice
    if (order_id) {
      const orderCheck = await client.query(
        'SELECT id, customer_id FROM orders WHERE id = $1 AND deleted_at IS NULL',
        [order_id]
      );
      if (orderCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      if (orderCheck.rows[0].customer_id !== customer_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Order does not belong to the specified customer' });
      }

      const dupCheck = await client.query(
        `SELECT id FROM invoices WHERE order_id = $1 AND status != 'void' AND deleted_at IS NULL`,
        [order_id]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'An active invoice already exists for this order',
          existing_invoice_id: dupCheck.rows[0].id,
        });
      }
    }

    // Insert invoice header (invoice_number generated by trigger)
    const invoiceResult = await client.query(
      `INSERT INTO invoices
         (order_id, customer_id, invoice_date, due_date, discount_amount, tax_rate, notes, terms_and_conditions, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id, invoice_number`,
      [order_id || null, customer_id, invoice_date, due_date, discount_amount, tax_rate, notes || null, terms_and_conditions || null, req.user.id]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, order_item_id, description, sku_id, quantity, unit_price, discount_amount, tax_rate, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          invoiceId,
          item.order_item_id || null,
          item.description,
          item.sku_id || null,
          item.quantity,
          item.unit_price,
          item.discount_amount || 0,
          item.tax_rate !== undefined ? item.tax_rate : tax_rate,
          item.notes || null,
        ]
      );
    }
    // Note: invoice totals auto-calculated by trigger after item inserts

    await client.query('COMMIT');

    logger.info('Invoice created', { invoiceId, invoiceNumber: invoiceResult.rows[0].invoice_number, userId: req.user.id });

    // Return full invoice
    const fullInvoice = await db.query(
      `SELECT i.*, c.name AS customer_name, c.customer_code, o.order_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN orders    o ON o.id = i.order_id
       WHERE i.id = $1`,
      [invoiceId]
    );

    res.status(201).json({ success: true, data: fullInvoice.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE INVOICE (only when draft)
// PUT /api/invoices/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateInvoice = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      invoice_date,
      due_date,
      discount_amount,
      tax_rate,
      notes,
      terms_and_conditions,
      items,
    } = req.body;

    await client.query('BEGIN');

    const invoiceCheck = await client.query(
      `SELECT id, status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoiceCheck.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only draft invoices can be updated' });
    }

    // Build update set
    const updates = [];
    const params = [];
    if (invoice_date !== undefined) { params.push(invoice_date); updates.push(`invoice_date = $${params.length}`); }
    if (due_date !== undefined)     { params.push(due_date);     updates.push(`due_date = $${params.length}`); }
    if (discount_amount !== undefined) { params.push(discount_amount); updates.push(`discount_amount = $${params.length}`); }
    if (tax_rate !== undefined)     { params.push(tax_rate);     updates.push(`tax_rate = $${params.length}`); }
    if (notes !== undefined)        { params.push(notes);        updates.push(`notes = $${params.length}`); }
    if (terms_and_conditions !== undefined) { params.push(terms_and_conditions); updates.push(`terms_and_conditions = $${params.length}`); }

    params.push(req.user.id);
    updates.push(`updated_by = $${params.length}`);
    params.push(id);

    if (updates.length > 1) {
      await client.query(
        `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    // Replace all items if provided
    if (items !== undefined) {
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items
             (invoice_id, order_item_id, description, sku_id, quantity, unit_price, discount_amount, tax_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            item.order_item_id || null,
            item.description,
            item.sku_id || null,
            item.quantity,
            item.unit_price,
            item.discount_amount || 0,
            item.tax_rate !== undefined ? item.tax_rate : 18,
            item.notes || null,
          ]
        );
      }
    }

    await client.query('COMMIT');

    const updated = await db.query(
      `SELECT i.*, c.name AS customer_name, o.order_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN orders    o ON o.id = i.order_id
       WHERE i.id = $1`,
      [id]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE INVOICE  (draft → issued)
// POST /api/invoices/:id/issue
// ─────────────────────────────────────────────────────────────────────────────
const issueInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, status, total_amount FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const inv = check.rows[0];
    if (inv.status !== 'draft') {
      return res.status(409).json({ success: false, message: `Cannot issue a ${inv.status} invoice` });
    }
    if (parseFloat(inv.total_amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invoice must have at least one item with a positive total before issuing' });
    }

    await db.query(
      `UPDATE invoices SET status = 'issued', updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    logger.info('Invoice issued', { invoiceId: id, userId: req.user.id });
    res.json({ success: true, message: 'Invoice issued successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VOID INVOICE
// POST /api/invoices/:id/void
// ─────────────────────────────────────────────────────────────────────────────
const voidInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, status, paid_amount FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const inv = check.rows[0];

    if (!['draft', 'issued', 'partially_paid'].includes(inv.status)) {
      return res.status(409).json({ success: false, message: `Cannot void a ${inv.status} invoice` });
    }
    if (parseFloat(inv.paid_amount) > 0) {
      return res.status(409).json({ success: false, message: 'Cannot void an invoice with applied payments. Remove payments first.' });
    }

    await db.query(
      `UPDATE invoices SET status = 'void', deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    logger.info('Invoice voided', { invoiceId: id, userId: req.user.id });
    res.json({ success: true, message: 'Invoice voided successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// APPLY PAYMENT TO INVOICE
// POST /api/invoices/:id/payments
// ─────────────────────────────────────────────────────────────────────────────
const applyPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payment_id, amount_applied, notes } = req.body;

    await client.query('BEGIN');

    // Lock invoice row
    const invoiceResult = await client.query(
      `SELECT id, customer_id, status, balance_amount, total_amount
       FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];

    if (!['issued', 'partially_paid'].includes(invoice.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot apply payment to a ${invoice.status} invoice` });
    }

    // Validate payment
    const paymentResult = await client.query(
      `SELECT id, customer_id, amount, status FROM payments WHERE id = $1 AND deleted_at IS NULL`,
      [payment_id]
    );
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const payment = paymentResult.rows[0];

    if (payment.customer_id !== invoice.customer_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Payment does not belong to the same customer as the invoice' });
    }
    if (payment.status !== 'success') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Only successful payments can be applied to invoices' });
    }

    const amountNum = parseFloat(amount_applied);
    const balance = parseFloat(invoice.balance_amount);

    if (amountNum > balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `amount_applied (${amountNum}) exceeds invoice balance (${balance})` });
    }

    // Check how much of this payment has already been applied across all invoices
    const alreadyApplied = await client.query(
      `SELECT COALESCE(SUM(amount_applied), 0) AS total FROM invoice_payments WHERE payment_id = $1`,
      [payment_id]
    );
    const applied = parseFloat(alreadyApplied.rows[0].total);
    const available = parseFloat(payment.amount) - applied;

    if (amountNum > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Only ${available.toFixed(2)} of this payment is available (${amountNum} requested)`,
      });
    }

    // Insert junction record (trigger will update invoice paid_amount + status)
    await client.query(
      `INSERT INTO invoice_payments (invoice_id, payment_id, amount_applied, applied_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, payment_id, amountNum, req.user.id, notes || null]
    );

    await client.query('COMMIT');

    logger.info('Payment applied to invoice', { invoiceId: id, paymentId: payment_id, amount: amountNum, userId: req.user.id });

    // Return updated invoice
    const updated = await db.query(
      `SELECT id, invoice_number, status, paid_amount, balance_amount, total_amount
       FROM invoices WHERE id = $1`,
      [id]
    );
    res.json({ success: true, data: updated.rows[0], message: 'Payment applied successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE APPLIED PAYMENT
// DELETE /api/invoices/:id/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────
const removePayment = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;

    const invoiceCheck = await db.query(
      `SELECT id, status FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoiceCheck.rows[0].status === 'void') {
      return res.status(409).json({ success: false, message: 'Cannot remove payment from a void invoice' });
    }

    const deleteResult = await db.query(
      `DELETE FROM invoice_payments WHERE invoice_id = $1 AND payment_id = $2 RETURNING id`,
      [id, paymentId]
    );
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment application not found' });
    }

    logger.info('Payment removed from invoice', { invoiceId: id, paymentId, userId: req.user.id });
    res.json({ success: true, message: 'Payment removed successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE PDF (returns printable HTML)
// GET /api/invoices/:id/pdf
// ─────────────────────────────────────────────────────────────────────────────
const generatePDF = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoiceResult = await db.query(
      `SELECT i.* FROM invoices i WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [id]
    );
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];

    const customerResult = await db.query(
      `SELECT c.*, ca.address_line1, ca.address_line2, ca.landmark, ca.city, ca.state, ca.pincode, ca.country
       FROM customers c
       LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true AND ca.deleted_at IS NULL
       WHERE c.id = $1`,
      [invoice.customer_id]
    );
    const customer = customerResult.rows[0] || {};

    const itemsResult = await db.query(
      `SELECT ii.*, s.sku_code FROM invoice_items ii LEFT JOIN skus s ON s.id = ii.sku_id WHERE ii.invoice_id = $1 ORDER BY ii.created_at ASC`,
      [id]
    );

    let order = null;
    if (invoice.order_id) {
      const orderResult = await db.query(
        `SELECT order_number, order_date, status FROM orders WHERE id = $1`,
        [invoice.order_id]
      );
      order = orderResult.rows[0] || null;
    }

    const html = generateInvoiceHTML(invoice, itemsResult.rows, customer, order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_number}.html"`);
    res.send(html);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AR AGING REPORT
// GET /api/invoices/reports/aging
// ─────────────────────────────────────────────────────────────────────────────
const getAgingReport = async (req, res, next) => {
  try {
    const { as_of_date } = req.query;
    const asOf = as_of_date || new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT
         c.id AS customer_id,
         c.customer_code,
         c.name AS customer_name,
         c.phone AS customer_phone,
         COALESCE(SUM(CASE WHEN ($1::date - i.due_date) <= 0 THEN i.balance_amount END), 0) AS current_due,
         COALESCE(SUM(CASE WHEN ($1::date - i.due_date) BETWEEN 1 AND 30 THEN i.balance_amount END), 0) AS aged_1_30,
         COALESCE(SUM(CASE WHEN ($1::date - i.due_date) BETWEEN 31 AND 60 THEN i.balance_amount END), 0) AS aged_31_60,
         COALESCE(SUM(CASE WHEN ($1::date - i.due_date) BETWEEN 61 AND 90 THEN i.balance_amount END), 0) AS aged_61_90,
         COALESCE(SUM(CASE WHEN ($1::date - i.due_date) > 90 THEN i.balance_amount END), 0) AS aged_over_90,
         SUM(i.balance_amount) AS total_outstanding
       FROM customers c
       JOIN invoices i ON i.customer_id = c.id
         AND i.status IN ('issued', 'partially_paid')
         AND i.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, c.customer_code, c.name, c.phone
       HAVING SUM(i.balance_amount) > 0
       ORDER BY total_outstanding DESC`,
      [asOf]
    );

    // Compute grand totals
    const totals = result.rows.reduce(
      (acc, row) => {
        acc.current_due += parseFloat(row.current_due);
        acc.aged_1_30 += parseFloat(row.aged_1_30);
        acc.aged_31_60 += parseFloat(row.aged_31_60);
        acc.aged_61_90 += parseFloat(row.aged_61_90);
        acc.aged_over_90 += parseFloat(row.aged_over_90);
        acc.total_outstanding += parseFloat(row.total_outstanding);
        return acc;
      },
      { current_due: 0, aged_1_30: 0, aged_31_60: 0, aged_61_90: 0, aged_over_90: 0, total_outstanding: 0 }
    );

    res.json({ success: true, as_of_date: asOf, data: result.rows, totals });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE REGISTER REPORT
// GET /api/invoices/reports/register
// ─────────────────────────────────────────────────────────────────────────────
const getInvoiceRegister = async (req, res, next) => {
  try {
    const { from_date, to_date, status, customer_id } = req.query;

    const params = [];
    const conditions = ['i.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`i.invoice_date >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   conditions.push(`i.invoice_date <= $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`i.status = $${params.length}`); }
    if (customer_id) { params.push(customer_id); conditions.push(`i.customer_id = $${params.length}`); }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(
      `SELECT
         i.id, i.invoice_number, i.invoice_date, i.due_date, i.status,
         i.subtotal_amount, i.discount_amount, i.tax_amount, i.total_amount,
         i.paid_amount, i.balance_amount,
         c.name AS customer_name, c.customer_code,
         o.order_number
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN orders    o ON o.id = i.order_id
       WHERE ${whereClause}
       ORDER BY i.invoice_date ASC, i.invoice_number ASC`,
      params
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.total_amount += parseFloat(row.total_amount);
        acc.paid_amount += parseFloat(row.paid_amount);
        acc.balance_amount += parseFloat(row.balance_amount);
        return acc;
      },
      { total_amount: 0, paid_amount: 0, balance_amount: 0 }
    );

    res.json({ success: true, data: result.rows, totals });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  issueInvoice,
  voidInvoice,
  applyPayment,
  removePayment,
  generatePDF,
  getAgingReport,
  getInvoiceRegister,
};
