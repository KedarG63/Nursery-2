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
const { postCustomerPaymentToLedger } = require('./paymentController');
const bills = require('../services/saleBillService');

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
         o.order_number, o.order_date, o.status AS order_status, o.notes AS order_notes
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

    // For walk-in orders, extract typed name/phone from order notes
    // Notes format: "Walk-in: {name} | Ph: +91{phone}"
    if (invoice.customer_name === 'Walk-in Customer' && invoice.order_notes) {
      const walkInMatch = invoice.order_notes.match(/^Walk-in:\s*(.+?)\s*\|\s*Ph:\s*\+91(\d+)/);
      if (walkInMatch) {
        invoice.customer_name = walkInMatch[1];
        invoice.customer_phone = `+91${walkInMatch[2]}`;
      }
    }

    // Fetch items with lot traceability (via direct lot_id or via order_item → lot)
    const itemsResult = await db.query(
      `SELECT
         ii.*,
         s.sku_code,
         l.lot_number,
         l.seed_purchase_id,
         sp.seed_lot_number,
         sp.purchase_date AS seed_purchase_date,
         v.vendor_name
       FROM invoice_items ii
       LEFT JOIN skus s ON s.id = ii.sku_id
       LEFT JOIN order_items oi ON oi.id = ii.order_item_id
       LEFT JOIN lots l ON l.id = COALESCE(ii.lot_id, oi.lot_id)
       LEFT JOIN seed_purchases sp ON sp.id = l.seed_purchase_id
       LEFT JOIN vendors v ON v.id = sp.vendor_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.created_at ASC`,
      [id]
    );

    // Fetch applied payments
    const paymentsResult = await db.query(
      `SELECT
         ip.id, ip.invoice_id, ip.payment_id, ip.amount_applied, ip.applied_at, ip.notes,
         p.transaction_id, p.payment_method, p.payment_date, p.amount AS payment_total,
         p.order_id AS payment_order_id,
         u.full_name AS applied_by_name
       FROM invoice_payments ip
       JOIN payments p ON p.id = ip.payment_id
       LEFT JOIN users u ON u.id = ip.applied_by
       WHERE ip.invoice_id = $1
       ORDER BY ip.applied_at ASC`,
      [id]
    );

    // The sale's true position: every payment received on the order, not only
    // those applied to this invoice. A payment recorded from the Payments page
    // before this change never reached the invoice, so the invoice alone could
    // show as due money that had already been received.
    let bill = null;
    let unappliedPayments = [];
    if (invoice.order_id) {
      bill = await bills.getSaleBill(db, invoice.order_id);
      const un = await db.query(
        `SELECT p.id, p.payment_date, p.payment_method, p.amount, p.receipt_number,
                p.amount - COALESCE(p.refund_amount, 0)
                  - COALESCE((SELECT SUM(amount_applied) FROM invoice_payments x WHERE x.payment_id = p.id), 0) AS unapplied
         FROM payments p
         WHERE p.order_id = $1 AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
         ORDER BY p.payment_date, p.created_at`,
        [invoice.order_id]
      );
      unappliedPayments = un.rows.filter((r) => parseFloat(r.unapplied) > bills.EPSILON);
    }

    res.json({
      success: true,
      data: {
        ...invoice,
        items: itemsResult.rows,
        applied_payments: paymentsResult.rows,
        // Present only when this invoice belongs to an order.
        sale: bill,
        unapplied_payments: unappliedPayments,
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
      tax_rate = 0,
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
           (invoice_id, order_item_id, lot_id, description, sku_id, quantity, unit_price, discount_amount, tax_rate, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          invoiceId,
          item.order_item_id || null,
          item.lot_id || null,
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
             (invoice_id, order_item_id, lot_id, description, sku_id, quantity, unit_price, discount_amount, tax_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            item.order_item_id || null,
            item.lot_id || null,
            item.description,
            item.sku_id || null,
            item.quantity,
            item.unit_price,
            item.discount_amount || 0,
            item.tax_rate !== undefined ? item.tax_rate : 0,
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
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const peek = await client.query(
      `SELECT order_id FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (peek.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const orderId = peek.rows[0].order_id;
    if (orderId) await bills.lockSale(client, orderId);

    const check = await client.query(
      `SELECT id, status, total_amount FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const inv = check.rows[0];
    if (inv.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot issue a ${inv.status} invoice` });
    }
    if (parseFloat(inv.total_amount) <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invoice must have at least one item with a positive total before issuing' });
    }

    await client.query(
      `UPDATE invoices SET status = 'issued', updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    // From this moment the invoice IS the bill. Money already received on the
    // sale goes onto it now — otherwise it would show as unpaid, and be
    // collected and recorded a second time.
    let applied = 0;
    let message = 'Invoice issued successfully';
    if (orderId) {
      applied = await bills.applyUnappliedPayments(client, orderId, id, req.user.id);
      await bills.refreshSaleMoney(client, orderId);
      const bill = await bills.getSaleBill(client, orderId);
      if (applied > 0) {
        message = `Invoice issued. ${bills.inr(applied)} already received on this order has been applied to it.`;
      }
      if (bill && bill.over_collected) {
        message += ` Note: ${bills.inr(-bill.balance)} more has been received than this invoice bills — `
          + 'check the payments for duplicates, or refund the difference.';
      }
    }

    await client.query('COMMIT');
    logger.info('Invoice issued', { invoiceId: id, appliedExisting: applied, userId: req.user.id });
    res.json({ success: true, message });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VOID INVOICE
// POST /api/invoices/:id/void
// ─────────────────────────────────────────────────────────────────────────────
const voidInvoice = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const peek = await client.query(
      `SELECT order_id FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (peek.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const orderId = peek.rows[0].order_id;
    if (orderId) await bills.lockSale(client, orderId);

    const check = await client.query(
      `SELECT id, status, paid_amount FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const inv = check.rows[0];

    if (!['draft', 'issued', 'partially_paid'].includes(inv.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot void a ${inv.status} invoice` });
    }

    // This used to refuse and tell staff to "remove payments first". Removing
    // only unlinked them: the money stayed received, the replacement invoice
    // showed it as due, and it was recorded again. Now the payments simply
    // move back to the sale in the same step — they still count, nothing
    // leaves the books — and issuing the replacement invoice picks them up.
    // An invoice linked to no order cannot shed payments that way.
    if (!orderId && parseFloat(inv.paid_amount) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This invoice is not linked to an order and has payments applied, so it cannot be voided.',
      });
    }
    const moved = await client.query(
      `DELETE FROM invoice_payments WHERE invoice_id = $1 RETURNING amount_applied`,
      [id]
    );

    await client.query(
      `UPDATE invoices SET status = 'void', deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );
    if (orderId) await bills.refreshSaleMoney(client, orderId);

    await client.query('COMMIT');

    const movedTotal = moved.rows.reduce((s, r) => s + parseFloat(r.amount_applied), 0);
    logger.info('Invoice voided', { invoiceId: id, paymentsMovedToSale: movedTotal, userId: req.user.id });
    res.json({
      success: true,
      message: movedTotal > 0
        ? `Invoice voided. The ${bills.inr(movedTotal)} already received stays on the order and will be applied to the next invoice you issue for it.`
        : 'Invoice voided successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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

    // Sale first, then invoice — the lock order every money path uses.
    const peek = await client.query(
      `SELECT order_id FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (peek.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (peek.rows[0].order_id) await bills.lockSale(client, peek.rows[0].order_id);

    const invoiceResult = await client.query(
      `SELECT id, customer_id, order_id, status, balance_amount, total_amount
       FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invoiceResult.rows[0];

    if (!['issued', 'partially_paid'].includes(invoice.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot apply payment to a ${invoice.status} invoice` });
    }

    // Validate payment
    const paymentResult = await client.query(
      `SELECT p.id, p.customer_id, p.order_id, p.amount - COALESCE(p.refund_amount, 0) AS amount, p.status,
              o.order_number
       FROM payments p LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
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

    // A payment already counts towards the order it was recorded on. Applying
    // it to a DIFFERENT order's invoice counts the same money on two sales —
    // one of the ways receipts came to be double-counted. It can only settle
    // its own sale's invoice.
    if (payment.order_id !== invoice.order_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `This payment was recorded against order ${payment.order_number || '(unknown)'}, `
          + 'so it can only be applied to that order\'s invoice. Record a separate payment for this one.',
      });
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
// RECORD NEW PAYMENT DIRECTLY ON INVOICE
// POST /api/invoices/:id/record-payment
// Creates a payment + applies it to the invoice + syncs parent order — one step
// ─────────────────────────────────────────────────────────────────────────────
const recordInvoicePayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, payment_method, payment_date, receipt_number, notes, bank_account_id, cash_account_id } = req.body;
    const userId = req.user.id;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }
    if (!payment_method) {
      return res.status(400).json({ success: false, message: 'payment_method is required' });
    }
    // Without an account the payment posts to no ledger, so the money stays
    // invisible in the Cash Book / Bank Ledger. Mirrors BANK_METHODS in
    // paymentController.
    if (['bank_transfer', 'upi', 'card'].includes(payment_method) && !bank_account_id) {
      return res.status(400).json({ success: false, message: 'bank_account_id is required for bank, UPI and card payments' });
    }

    await client.query('BEGIN');

    // Find the sale without locking, then lock sale → invoice: the same order
    // every other money path uses, so they cannot deadlock one another.
    const peek = await client.query(
      `SELECT order_id FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (peek.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (!peek.rows[0].order_id) {
      // payments.order_id is NOT NULL — a payment must belong to a sale.
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This invoice is not linked to an order, so a payment cannot be recorded against it.',
      });
    }
    await bills.lockSale(client, peek.rows[0].order_id);

    const invResult = await client.query(
      `SELECT id, customer_id, order_id, status, balance_amount, total_amount
       FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invResult.rows[0];

    if (!['issued', 'partially_paid'].includes(invoice.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot record payment on a ${invoice.status} invoice` });
    }

    // Checked against the sale's ONE bill, counting every payment received on
    // the sale — including any recorded from the Payments page that never made
    // it onto this invoice. Checking the invoice's own balance is what let the
    // same money be recorded twice.
    const amountNum = Math.round(parseFloat(amount) * 100) / 100;
    const bill = await bills.getSaleBill(client, invoice.order_id);
    bills.assertCanReceive(bill, amountNum);

    // Recorded exactly as received — never silently capped.
    const effectiveAmount = amountNum;

    // For non-cash/credit methods, gateway_transaction_id must not be null (DB constraint).
    // Use receipt_number as the reference, or generate a manual placeholder.
    const needsGatewayRef = !['cash', 'credit'].includes(payment_method);
    const gatewayTransactionId = needsGatewayRef
      ? (receipt_number || `MANUAL-${Date.now()}`)
      : null;

    // One date for both the payment row and its ledger entry.
    const entryDate = payment_date || new Date().toISOString().split('T')[0];

    // Create payment record.
    // Note: the trigger `update_order_paid_amount` fires on INSERT (status='success')
    // and already updates orders.paid_amount — no manual UPDATE needed.
    const paymentResult = await client.query(
      `INSERT INTO payments (
         order_id, customer_id, payment_method, payment_gateway,
         amount, status, payment_date, receipt_number,
         gateway_transaction_id, received_by,
         notes, bank_account_id, cash_account_id, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        invoice.order_id || null,
        invoice.customer_id,
        payment_method,
        'manual',
        effectiveAmount,
        'success',
        entryDate,
        receipt_number || null,
        gatewayTransactionId,
        userId,
        notes || null,
        bank_account_id || null,
        cash_account_id || null,
        userId,
      ]
    );
    const paymentId = paymentResult.rows[0].id;

    // Apply to invoice (trigger updates invoices.paid_amount + status)
    await client.query(
      `INSERT INTO invoice_payments (invoice_id, payment_id, amount_applied, applied_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, paymentId, effectiveAmount, userId, notes || null]
    );

    // Post the receipt into the Cash Book / Bank Ledger, exactly as a payment
    // recorded from the Payments page does. Without this an invoice receipt
    // never reached any ledger, so the money was invisible in the balances.
    const custRes = await client.query(
      `SELECT name FROM customers WHERE id = $1`, [invoice.customer_id]
    );
    await postCustomerPaymentToLedger(client, {
      paymentId,
      method: payment_method,
      amount: effectiveAmount,
      cashAccountId: cash_account_id || null,
      bankAccountId: bank_account_id || null,
      entryDate,
      partyName: custRes.rows[0]?.name || 'Customer',
      referenceNumber: receipt_number || null,
      userId,
    });

    await client.query('COMMIT');

    logger.info('Payment recorded on invoice', { invoiceId: id, paymentId, amount: effectiveAmount, userId });
    res.status(201).json({ success: true, message: 'Payment recorded successfully', data: { payment_id: paymentId, amount_applied: effectiveAmount } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
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

    // Unlinking a payment from its own sale's invoice does NOT undo it: the
    // payment and its Cash Book / Bank entry stay, and the invoice goes back to
    // showing the money as due — which is how it came to be recorded twice.
    // Undoing a payment is a delete, which reverses it everywhere.
    // (Unlinking a payment that belongs to a DIFFERENT order is still allowed:
    // that corrects an old mis-link, and the money stays on its own sale.)
    const own = await db.query(
      `SELECT 1 FROM payments p JOIN invoices i ON i.id = $1
       WHERE p.id = $2 AND p.order_id = i.order_id`,
      [id, paymentId]
    );
    if (own.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Removing this payment from the invoice would leave it recorded but no longer shown here. '
          + 'If it was recorded by mistake, delete it from the Payments page — that also reverses it in the Cash Book / Bank.',
      });
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
      `SELECT
         ii.*,
         s.sku_code,
         l.lot_number,
         sp.seed_lot_number,
         sp.purchase_date AS seed_purchase_date,
         v.vendor_name
       FROM invoice_items ii
       LEFT JOIN skus s ON s.id = ii.sku_id
       LEFT JOIN order_items oi ON oi.id = ii.order_item_id
       LEFT JOIN lots l ON l.id = COALESCE(ii.lot_id, oi.lot_id)
       LEFT JOIN seed_purchases sp ON sp.id = l.seed_purchase_id
       LEFT JOIN vendors v ON v.id = sp.vendor_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.created_at ASC`,
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
  recordInvoicePayment,
  applyPayment,
  removePayment,
  generatePDF,
  getAgingReport,
  getInvoiceRegister,
};
