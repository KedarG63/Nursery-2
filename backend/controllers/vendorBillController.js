/**
 * Vendor Bill Controller (Accounts Payable)
 * Phase 23: Billing & Accounting
 *
 * Vendor bills are backed by the existing `seed_purchases` table.
 * The `due_date` column was added in migration 1763000000003.
 */

const { pool } = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// LIST VENDOR BILLS
// GET /api/vendor-bills
// ─────────────────────────────────────────────────────────────────────────────
const listVendorBills = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      payment_status,
      vendor_id,
      from_date,
      to_date,
      overdue_only,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['sp.deleted_at IS NULL'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(sp.purchase_number ILIKE $${params.length} OR v.vendor_name ILIKE $${params.length} OR sp.invoice_number ILIKE $${params.length})`);
    }
    if (payment_status) {
      params.push(payment_status);
      conditions.push(`sp.payment_status = $${params.length}`);
    }
    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`sp.vendor_id = $${params.length}`);
    }
    if (from_date) {
      params.push(from_date);
      conditions.push(`sp.purchase_date >= $${params.length}`);
    }
    if (to_date) {
      params.push(to_date);
      conditions.push(`sp.purchase_date <= $${params.length}`);
    }
    if (overdue_only === 'true') {
      conditions.push(`sp.due_date < CURRENT_DATE AND sp.payment_status != 'paid'`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM seed_purchases sp
       JOIN vendors v ON v.id = sp.vendor_id
       WHERE ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await db.query(
      `SELECT
         sp.id, sp.purchase_number, sp.invoice_number, sp.invoice_date,
         sp.purchase_date, sp.due_date, sp.payment_status, sp.amount_paid,
         sp.grand_total,
         (sp.grand_total - sp.amount_paid) AS balance_due,
         CASE
           WHEN sp.due_date IS NOT NULL AND sp.payment_status != 'paid' AND sp.due_date < CURRENT_DATE
           THEN CURRENT_DATE - sp.due_date
           ELSE 0
         END AS days_overdue,
         sp.created_at,
         v.id AS vendor_id, v.vendor_name, v.vendor_code, v.contact_person,
         p.name AS product_name, p.id AS product_id
       FROM seed_purchases sp
       JOIN vendors  v ON v.id = sp.vendor_id
       JOIN products p ON p.id = sp.product_id
       WHERE ${whereClause}
       ORDER BY sp.due_date ASC NULLS LAST, sp.purchase_date DESC
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
// GET SINGLE VENDOR BILL
// GET /api/vendor-bills/:id
// ─────────────────────────────────────────────────────────────────────────────
const getVendorBill = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT
         sp.*,
         (sp.grand_total - sp.amount_paid) AS balance_due,
         CASE
           WHEN sp.due_date IS NOT NULL AND sp.payment_status != 'paid' AND sp.due_date < CURRENT_DATE
           THEN CURRENT_DATE - sp.due_date
           ELSE 0
         END AS days_overdue,
         v.vendor_name, v.vendor_code, v.contact_person, v.phone AS vendor_phone, v.email AS vendor_email, v.gst_number AS vendor_gst,
         p.name AS product_name,
         s.sku_code
       FROM seed_purchases sp
       JOIN vendors  v ON v.id = sp.vendor_id
       JOIN products p ON p.id = sp.product_id
       LEFT JOIN skus s ON s.id = sp.sku_id
       WHERE sp.id = $1 AND sp.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor bill not found' });
    }

    // Fetch payment history
    const payments = await db.query(
      `SELECT spp.*, u.full_name AS recorded_by_name
       FROM seed_purchase_payments spp
       LEFT JOIN users u ON u.id = spp.created_by
       WHERE spp.seed_purchase_id = $1
       ORDER BY spp.payment_date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: { ...result.rows[0], payments: payments.rows },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE DUE DATE
// PUT /api/vendor-bills/:id/due-date
// ─────────────────────────────────────────────────────────────────────────────
const updateDueDate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { due_date } = req.body;

    const check = await db.query(
      `SELECT id FROM seed_purchases WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor bill not found' });
    }

    await db.query(
      `UPDATE seed_purchases SET due_date = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [due_date, req.user.id, id]
    );

    logger.info('Vendor bill due date updated', { purchaseId: id, dueDate: due_date, userId: req.user.id });
    res.json({ success: true, message: 'Due date updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RECORD VENDOR PAYMENT
// POST /api/vendor-bills/:id/payments
// ─────────────────────────────────────────────────────────────────────────────
const recordPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, payment_method, payment_date, transaction_reference, notes } = req.body;

    await client.query('BEGIN');

    const billResult = await client.query(
      `SELECT id, grand_total, amount_paid, payment_status FROM seed_purchases WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (billResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Vendor bill not found' });
    }
    const bill = billResult.rows[0];

    if (bill.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This vendor bill is already fully paid' });
    }

    const balance = parseFloat(bill.grand_total) - parseFloat(bill.amount_paid);
    const amtNum = parseFloat(amount);
    if (amtNum > balance + 0.01) {
      // Allow a small tolerance for floating-point
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Payment amount (${amtNum}) exceeds remaining balance (${balance.toFixed(2)})` });
    }

    // Insert payment (existing trigger auto-updates seed_purchases.amount_paid and payment_status)
    await client.query(
      `INSERT INTO seed_purchase_payments
         (seed_purchase_id, payment_date, amount, payment_method, transaction_reference, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, payment_date, amtNum, payment_method, transaction_reference || null, notes || null, req.user.id]
    );

    await client.query('COMMIT');

    logger.info('Vendor bill payment recorded', { purchaseId: id, amount: amtNum, userId: req.user.id });

    const updated = await db.query(
      `SELECT id, purchase_number, grand_total, amount_paid, payment_status,
              (grand_total - amount_paid) AS balance_due
       FROM seed_purchases WHERE id = $1`,
      [id]
    );
    res.status(201).json({ success: true, data: updated.rows[0], message: 'Payment recorded successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AP AGING REPORT
// GET /api/vendor-bills/reports/aging
// ─────────────────────────────────────────────────────────────────────────────
const getAgingReport = async (req, res, next) => {
  try {
    const { as_of_date } = req.query;
    const asOf = as_of_date || new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT
         v.id AS vendor_id,
         v.vendor_code,
         v.vendor_name,
         v.contact_person,
         COALESCE(SUM(CASE WHEN sp.due_date IS NULL THEN (sp.grand_total - sp.amount_paid) END), 0)                                           AS no_due_date,
         COALESCE(SUM(CASE WHEN sp.due_date IS NOT NULL AND ($1::date - sp.due_date) <= 0 THEN (sp.grand_total - sp.amount_paid) END), 0)     AS current_due,
         COALESCE(SUM(CASE WHEN ($1::date - sp.due_date) BETWEEN 1 AND 30 THEN (sp.grand_total - sp.amount_paid) END), 0)                    AS aged_1_30,
         COALESCE(SUM(CASE WHEN ($1::date - sp.due_date) BETWEEN 31 AND 60 THEN (sp.grand_total - sp.amount_paid) END), 0)                   AS aged_31_60,
         COALESCE(SUM(CASE WHEN ($1::date - sp.due_date) BETWEEN 61 AND 90 THEN (sp.grand_total - sp.amount_paid) END), 0)                   AS aged_61_90,
         COALESCE(SUM(CASE WHEN ($1::date - sp.due_date) > 90 THEN (sp.grand_total - sp.amount_paid) END), 0)                               AS aged_over_90,
         SUM(sp.grand_total - sp.amount_paid) AS total_outstanding
       FROM vendors v
       JOIN seed_purchases sp ON sp.vendor_id = v.id
         AND sp.payment_status IN ('pending', 'partial')
         AND sp.deleted_at IS NULL
       WHERE v.deleted_at IS NULL
       GROUP BY v.id, v.vendor_code, v.vendor_name, v.contact_person
       HAVING SUM(sp.grand_total - sp.amount_paid) > 0
       ORDER BY total_outstanding DESC`,
      [asOf]
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.no_due_date += parseFloat(row.no_due_date);
        acc.current_due += parseFloat(row.current_due);
        acc.aged_1_30 += parseFloat(row.aged_1_30);
        acc.aged_31_60 += parseFloat(row.aged_31_60);
        acc.aged_61_90 += parseFloat(row.aged_61_90);
        acc.aged_over_90 += parseFloat(row.aged_over_90);
        acc.total_outstanding += parseFloat(row.total_outstanding);
        return acc;
      },
      { no_due_date: 0, current_due: 0, aged_1_30: 0, aged_31_60: 0, aged_61_90: 0, aged_over_90: 0, total_outstanding: 0 }
    );

    res.json({ success: true, as_of_date: asOf, data: result.rows, totals });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listVendorBills,
  getVendorBill,
  updateDueDate,
  recordPayment,
  getAgingReport,
};
