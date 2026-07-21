/**
 * Material / Supplies Purchase Controller
 *
 * A vendor-payables register for non-seed supplies (cocopeat, fertilizer,
 * trays, pesticide, …). A purchase is a PAYABLE: creating it records what you
 * owe; money moves only when you record payment tranches against it.
 *
 * Each tranche selects exactly ONE source (cash or a specific bank account) and
 * posts a matching DEBIT to that ledger in the SAME transaction — reusing the
 * expense controller's postSourceDebit / reverseSourceEntries helpers so cash &
 * bank balances always self-reconcile. A DB trigger keeps the parent purchase's
 * amount_paid / payment_status (pending → partial → paid) in sync.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear, generateDocNumber } = require('../utils/financialYear');
const { postSourceDebit, reverseSourceEntries } = require('./expenseController');

const SOURCE_TYPE = 'material_purchase';

// Shared SELECT for a purchase with its joined labels.
const PURCHASE_SELECT = `
  SELECT
    mp.*,
    (mp.grand_total - mp.amount_paid) AS balance_due,
    v.vendor_name, v.vendor_code,
    ec.name AS category_name,
    cu.full_name AS created_by_name
  FROM material_purchases mp
  JOIN vendors v ON v.id = mp.vendor_id
  LEFT JOIN expense_categories ec ON ec.id = mp.category_id
  LEFT JOIN users cu ON cu.id = mp.created_by
`;

// ─── CREATE ───────────────────────────────────────────────────────────────────
const createPurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      purchase_date, vendor_id, category_id,
      item_description, quantity, unit, rate,
      amount, tax_amount = 0, other_charges = 0,
      invoice_number, invoice_date, due_date, notes,
    } = req.body;

    if (!purchase_date) return res.status(400).json({ success: false, message: 'purchase_date is required' });
    if (!vendor_id) return res.status(400).json({ success: false, message: 'vendor_id is required' });
    if (!(Number(amount) > 0)) return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    await client.query('BEGIN');

    const vendor = await client.query(
      `SELECT id, payment_terms FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [vendor_id]
    );
    if (vendor.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Vendor not found' });
    }

    if (category_id) {
      const cat = await client.query(`SELECT id FROM expense_categories WHERE id = $1 AND is_active = true`, [category_id]);
      if (cat.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid or inactive category' });
      }
    }

    // Derive a due date from vendor payment terms if not supplied.
    let dueDate = due_date || null;
    if (!dueDate && vendor.rows[0].payment_terms) {
      const base = new Date(purchase_date);
      base.setDate(base.getDate() + parseInt(vendor.rows[0].payment_terms, 10));
      dueDate = base.toISOString().split('T')[0];
    }

    const fy = financialYear(purchase_date);
    const purchaseNumber = await generateDocNumber(client, 'material_purchases', 'purchase_number', 'SUP', purchase_date);

    const insert = await client.query(
      `INSERT INTO material_purchases
         (purchase_number, purchase_date, financial_year, vendor_id, category_id,
          item_description, quantity, unit, rate,
          amount, tax_amount, other_charges,
          invoice_number, invoice_date, due_date, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       RETURNING id`,
      [
        purchaseNumber, purchase_date, fy, vendor_id, category_id || null,
        item_description || null, quantity || null, unit || null, rate || null,
        amount, tax_amount || 0, other_charges || 0,
        invoice_number || null, invoice_date || null, dueDate, notes || null, req.user.id,
      ]
    );

    await client.query('COMMIT');

    const full = await db.query(`${PURCHASE_SELECT} WHERE mp.id = $1`, [insert.rows[0].id]);
    logger.info('Material purchase created', { id: insert.rows[0].id, userId: req.user.id });
    res.status(201).json({ success: true, data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── LIST ─────────────────────────────────────────────────────────────────────
const listPurchases = async (req, res, next) => {
  try {
    const {
      from_date, to_date, vendor_id, category_id, payment_status,
      financial_year, search, page = 1, limit = 50,
    } = req.query;

    const params = [];
    const conditions = ['mp.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`mp.purchase_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`mp.purchase_date <= $${params.length}`); }
    if (vendor_id) { params.push(vendor_id); conditions.push(`mp.vendor_id = $${params.length}`); }
    if (category_id) { params.push(category_id); conditions.push(`mp.category_id = $${params.length}`); }
    if (payment_status) { params.push(payment_status); conditions.push(`mp.payment_status = $${params.length}`); }
    if (financial_year) { params.push(financial_year); conditions.push(`mp.financial_year = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(mp.purchase_number ILIKE $${params.length} OR mp.item_description ILIKE $${params.length}
                        OR mp.invoice_number ILIKE $${params.length} OR v.vendor_name ILIKE $${params.length})`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*) FROM material_purchases mp JOIN vendors v ON v.id = mp.vendor_id WHERE ${whereClause}`,
      params
    );

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await db.query(
      `${PURCHASE_SELECT} WHERE ${whereClause}
       ORDER BY mp.purchase_date DESC, mp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = parseInt(countRes.rows[0].count);
    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── SUMMARY (totals for the filtered set) ────────────────────────────────────
const getSummary = async (req, res, next) => {
  try {
    const { from_date, to_date, vendor_id, category_id, financial_year } = req.query;
    const params = [];
    const conditions = ['mp.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`mp.purchase_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`mp.purchase_date <= $${params.length}`); }
    if (vendor_id) { params.push(vendor_id); conditions.push(`mp.vendor_id = $${params.length}`); }
    if (category_id) { params.push(category_id); conditions.push(`mp.category_id = $${params.length}`); }
    if (financial_year) { params.push(financial_year); conditions.push(`mp.financial_year = $${params.length}`); }

    const whereClause = conditions.join(' AND ');
    const totals = await db.query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(SUM(mp.grand_total), 0) AS total_purchased,
         COALESCE(SUM(mp.amount_paid), 0) AS total_paid,
         COALESCE(SUM(mp.grand_total - mp.amount_paid), 0) AS total_outstanding
       FROM material_purchases mp WHERE ${whereClause}`,
      params
    );
    res.json({ success: true, data: totals.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── GET BY ID (with tranche history) ─────────────────────────────────────────
const getPurchaseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(`${PURCHASE_SELECT} WHERE mp.id = $1 AND mp.deleted_at IS NULL`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const payments = await db.query(
      `SELECT
         p.id, p.payment_date, p.amount, p.payment_source,
         p.bank_account_id, p.cash_account_id, p.reference_number, p.notes, p.created_at,
         ba.account_name AS bank_account_name,
         ca.account_name AS cash_account_name,
         u.full_name AS created_by_name
       FROM material_purchase_payments p
       LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
       LEFT JOIN cash_accounts ca ON ca.id = p.cash_account_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.material_purchase_id = $1
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      [id]
    );

    res.json({ success: true, data: { ...result.rows[0], payments: payments.rows } });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const updatePurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      purchase_date, vendor_id, category_id,
      item_description, quantity, unit, rate,
      amount, tax_amount = 0, other_charges = 0,
      invoice_number, invoice_date, due_date, notes,
    } = req.body;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT amount_paid FROM material_purchases WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    if (!(Number(amount) > 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const newGrandTotal = Number(amount) + Number(tax_amount || 0) + Number(other_charges || 0);
    const alreadyPaid = parseFloat(existing.rows[0].amount_paid);
    if (newGrandTotal < alreadyPaid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Grand total (₹${newGrandTotal.toFixed(2)}) cannot be less than the ₹${alreadyPaid.toFixed(2)} already paid. Remove a payment first.`,
      });
    }

    if (vendor_id) {
      const vendor = await client.query(`SELECT id FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [vendor_id]);
      if (vendor.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Vendor not found' });
      }
    }
    if (category_id) {
      const cat = await client.query(`SELECT id FROM expense_categories WHERE id = $1 AND is_active = true`, [category_id]);
      if (cat.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid or inactive category' });
      }
    }

    const fy = financialYear(purchase_date);
    const upd = await client.query(
      `UPDATE material_purchases SET
         purchase_date = $1, financial_year = $2, vendor_id = $3, category_id = $4,
         item_description = $5, quantity = $6, unit = $7, rate = $8,
         amount = $9, tax_amount = $10, other_charges = $11,
         invoice_number = $12, invoice_date = $13, due_date = $14, notes = $15,
         updated_by = $16, updated_at = NOW()
       WHERE id = $17 RETURNING id`,
      [
        purchase_date, fy, vendor_id, category_id || null,
        item_description || null, quantity || null, unit || null, rate || null,
        amount, tax_amount || 0, other_charges || 0,
        invoice_number || null, invoice_date || null, due_date || null, notes || null,
        req.user.id, id,
      ]
    );

    // Recompute payment_status against the (possibly changed) grand_total.
    // The cast is required: an all-literal CASE resolves to text, and there is
    // no implicit text -> purchase_payment_status_enum cast.
    await client.query(
      `UPDATE material_purchases
       SET payment_status = (CASE
             WHEN amount_paid <= 0 THEN 'pending'
             WHEN amount_paid >= grand_total THEN 'paid'
             ELSE 'partial' END)::purchase_payment_status_enum
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    const full = await db.query(`${PURCHASE_SELECT} WHERE mp.id = $1`, [upd.rows[0].id]);
    logger.info('Material purchase updated', { id, userId: req.user.id });
    res.json({ success: true, data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────
const deletePurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT amount_paid FROM material_purchases WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    if (parseFloat(existing.rows[0].amount_paid) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This purchase has recorded payments. Remove its payments first, then delete it.',
      });
    }

    await client.query(
      `UPDATE material_purchases SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    logger.info('Material purchase deleted', { id, userId: req.user.id });
    res.json({ success: true, message: 'Purchase deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── RECORD PAYMENT TRANCHE ───────────────────────────────────────────────────
const recordPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      payment_date, amount, payment_source,
      bank_account_id, cash_account_id, reference_number, notes,
    } = req.body;

    if (!payment_date) return res.status(400).json({ success: false, message: 'payment_date is required' });
    if (!(Number(amount) > 0)) return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    if (!['cash', 'bank'].includes(payment_source)) {
      return res.status(400).json({ success: false, message: 'payment_source must be "cash" or "bank"' });
    }

    await client.query('BEGIN');

    const purchase = await client.query(
      `SELECT mp.id, mp.purchase_number, mp.grand_total, mp.amount_paid, v.vendor_name
       FROM material_purchases mp JOIN vendors v ON v.id = mp.vendor_id
       WHERE mp.id = $1 AND mp.deleted_at IS NULL FOR UPDATE OF mp`,
      [id]
    );
    if (purchase.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const p = purchase.rows[0];
    const remaining = parseFloat(p.grand_total) - parseFloat(p.amount_paid);
    if (Number(amount) > remaining + 0.001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment exceeds the outstanding balance of ₹${remaining.toFixed(2)}`,
      });
    }

    // Validate the chosen source account.
    if (payment_source === 'bank') {
      const b = await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [bank_account_id]);
      if (b.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Bank account not found or inactive' });
      }
    } else {
      const c = await client.query(`SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [cash_account_id]);
      if (c.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cash account not found or inactive' });
      }
    }

    const insert = await client.query(
      `INSERT INTO material_purchase_payments
         (material_purchase_id, payment_date, amount, payment_source,
          bank_account_id, cash_account_id, reference_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id, payment_date, amount, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        reference_number || null, notes || null, req.user.id,
      ]
    );
    const payment = insert.rows[0];

    // Post the matching DEBIT to the chosen ledger (self-reconciling).
    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: bank_account_id,
      cashAccountId: cash_account_id,
      entryDate: payment_date,
      amount: Number(amount),
      partyName: p.vendor_name,
      narration: `Payment for supplies purchase ${p.purchase_number}`,
      referenceNumber: reference_number,
      sourceType: SOURCE_TYPE,
      sourceId: payment.id,
      userId: req.user.id,
    });

    await client.query('COMMIT');
    logger.info('Material purchase payment recorded', { purchaseId: id, paymentId: payment.id, source: payment_source, userId: req.user.id });
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE PAYMENT TRANCHE (reverses its ledger debit) ───────────────────────
const deletePayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id, paymentId } = req.params;
    await client.query('BEGIN');

    const payment = await client.query(
      `SELECT id FROM material_purchase_payments
       WHERE id = $1 AND material_purchase_id = $2 FOR UPDATE`,
      [paymentId, id]
    );
    if (payment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Reverse the ledger debit first, then remove the tranche
    // (the AFTER-DELETE trigger recomputes amount_paid / payment_status).
    await reverseSourceEntries(client, SOURCE_TYPE, paymentId, req.user.id);
    await client.query(`DELETE FROM material_purchase_payments WHERE id = $1`, [paymentId]);

    await client.query('COMMIT');
    logger.info('Material purchase payment deleted', { purchaseId: id, paymentId, userId: req.user.id });
    res.json({ success: true, message: 'Payment removed and ledger entry reversed' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  createPurchase,
  listPurchases,
  getSummary,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  recordPayment,
  deletePayment,
};
