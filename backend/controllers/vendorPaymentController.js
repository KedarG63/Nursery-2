/**
 * Vendor Payment Controller — one payment, many bills (Tally-style "Agst Ref").
 *
 * A vendor payment voucher records money paid to a vendor ONCE, then spreads
 * it across that vendor's open seed and supplies bills.
 *
 *   - Each allocation is an ordinary row in seed_purchase_payments /
 *     material_purchase_payments carrying `vendor_payment_id`, so the existing
 *     triggers keep every bill's amount_paid / payment_status correct.
 *   - Only the voucher posts to the cash/bank ledger (source_type
 *     'vendor_bulk_payment'). Allocation rows post NOTHING — posting both
 *     would count the money twice.
 *   - Advance = voucher amount − SUM(allocations). Derived, never stored.
 *
 * Migration 1769000000018 enforces "allocations <= amount" and "same vendor"
 * in the database as well.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { generateDocNumber } = require('../utils/financialYear');
const { postSourceDebit, reverseSourceEntries } = require('./expenseController');

const SOURCE_TYPE = 'vendor_bulk_payment';
const BILL_TYPES = ['seed', 'material'];
const TOLERANCE = 0.005; // half a paisa, for numeric rounding

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// SUM of a voucher's allocations across both bill-payment tables.
const ALLOCATED_SQL = `
  COALESCE((SELECT SUM(amount) FROM seed_purchase_payments     WHERE vendor_payment_id = vp.id), 0)
+ COALESCE((SELECT SUM(amount) FROM material_purchase_payments WHERE vendor_payment_id = vp.id), 0)
`;

const VOUCHER_SELECT = `
  SELECT
    vp.*,
    (${ALLOCATED_SQL}) AS allocated_amount,
    vp.amount - (${ALLOCATED_SQL}) AS advance_amount,
    v.vendor_name, v.vendor_code,
    ba.account_name AS bank_account_name,
    ca.account_name AS cash_account_name,
    u.full_name AS created_by_name
  FROM vendor_payments vp
  JOIN vendors v ON v.id = vp.vendor_id
  LEFT JOIN bank_accounts ba ON ba.id = vp.bank_account_id
  LEFT JOIN cash_accounts ca ON ca.id = vp.cash_account_id
  LEFT JOIN users u ON u.id = vp.created_by
`;

// Unapplied advance still sitting with a vendor, across all live vouchers.
async function vendorAdvance(q, vendorId) {
  const { rows } = await q.query(
    `SELECT COALESCE(SUM(vp.amount - (${ALLOCATED_SQL})), 0) AS advance
     FROM vendor_payments vp
     WHERE vp.vendor_id = $1 AND vp.deleted_at IS NULL`,
    [vendorId]
  );
  return round2(rows[0].advance);
}

// Normalise and sanity-check an allocations array from the request body.
// Returns { allocations } or { error }.
function parseAllocations(raw) {
  if (raw === undefined || raw === null) return { allocations: [] };
  if (!Array.isArray(raw)) return { error: 'allocations must be an array' };

  const seen = new Set();
  const allocations = [];
  for (const a of raw) {
    if (!a || !BILL_TYPES.includes(a.bill_type)) {
      return { error: `bill_type must be one of: ${BILL_TYPES.join(', ')}` };
    }
    if (!a.bill_id) return { error: 'bill_id is required for every allocation' };
    const amount = round2(a.amount);
    if (!(amount > 0)) return { error: 'Every allocation amount must be greater than 0' };
    const key = `${a.bill_type}:${a.bill_id}`;
    if (seen.has(key)) return { error: 'The same bill appears twice in allocations' };
    seen.add(key);
    allocations.push({ bill_type: a.bill_type, bill_id: a.bill_id, amount });
  }
  return { allocations };
}

/**
 * Lock the target bills and check each allocation fits. Bills are locked in
 * sorted id order so two concurrent payments can never deadlock on each other.
 * Returns { bills } (keyed by "type:id") or { status, message }.
 */
async function lockAndCheckBills(client, vendorId, allocations) {
  const seedIds = allocations.filter((a) => a.bill_type === 'seed').map((a) => a.bill_id).sort();
  const matIds = allocations.filter((a) => a.bill_type === 'material').map((a) => a.bill_id).sort();
  const bills = {};

  if (seedIds.length) {
    const { rows } = await client.query(
      `SELECT id, vendor_id, purchase_number,
              grand_total - amount_paid - COALESCE(vendor_credit_applied, 0) AS balance
       FROM seed_purchases
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY id
       FOR UPDATE`,
      [seedIds]
    );
    rows.forEach((r) => { bills[`seed:${r.id}`] = r; });
  }
  if (matIds.length) {
    const { rows } = await client.query(
      `SELECT id, vendor_id, purchase_number, grand_total - amount_paid AS balance
       FROM material_purchases
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY id
       FOR UPDATE`,
      [matIds]
    );
    rows.forEach((r) => { bills[`material:${r.id}`] = r; });
  }

  for (const a of allocations) {
    const bill = bills[`${a.bill_type}:${a.bill_id}`];
    if (!bill) return { status: 404, message: 'One of the selected bills was not found' };
    if (bill.vendor_id !== vendorId) {
      return { status: 400, message: `Bill ${bill.purchase_number} belongs to a different vendor` };
    }
    const balance = parseFloat(bill.balance);
    if (a.amount > balance + TOLERANCE) {
      return {
        status: 400,
        message: `₹${a.amount.toFixed(2)} exceeds the balance of ₹${balance.toFixed(2)} on ${bill.purchase_number}`,
      };
    }
  }
  return { bills };
}

// Write allocation rows. They carry the voucher's details for display but post
// no ledger entry — the voucher already did.
async function insertAllocations(client, voucher, allocations, userId) {
  for (const a of allocations) {
    if (a.bill_type === 'seed') {
      await client.query(
        `INSERT INTO seed_purchase_payments
           (seed_purchase_id, payment_date, amount, payment_method, transaction_reference, notes,
            payment_source, bank_account_id, cash_account_id, vendor_payment_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          a.bill_id, voucher.payment_date, a.amount, voucher.payment_method,
          voucher.reference_number || voucher.payment_number, `Via ${voucher.payment_number}`,
          voucher.payment_source, voucher.bank_account_id, voucher.cash_account_id,
          voucher.id, userId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO material_purchase_payments
           (material_purchase_id, payment_date, amount, payment_source,
            bank_account_id, cash_account_id, reference_number, notes, vendor_payment_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          a.bill_id, voucher.payment_date, a.amount, voucher.payment_source,
          voucher.bank_account_id, voucher.cash_account_id,
          voucher.reference_number || voucher.payment_number, `Via ${voucher.payment_number}`,
          voucher.id, userId,
        ]
      );
    }
  }
}

async function loadAllocations(q, voucherId) {
  const { rows } = await q.query(
    `SELECT 'seed' AS bill_type, spp.id, spp.amount, spp.created_at,
            sp.id AS bill_id, sp.purchase_number, sp.invoice_number,
            COALESCE(sp.invoice_date, sp.purchase_date) AS bill_date,
            sp.grand_total, sp.payment_status, p.name AS description
     FROM seed_purchase_payments spp
     JOIN seed_purchases sp ON sp.id = spp.seed_purchase_id
     LEFT JOIN products p ON p.id = sp.product_id
     WHERE spp.vendor_payment_id = $1
     UNION ALL
     SELECT 'material', mpp.id, mpp.amount, mpp.created_at,
            mp.id, mp.purchase_number, mp.invoice_number,
            COALESCE(mp.invoice_date, mp.purchase_date),
            mp.grand_total, mp.payment_status, mp.item_description
     FROM material_purchase_payments mpp
     JOIN material_purchases mp ON mp.id = mpp.material_purchase_id
     WHERE mpp.vendor_payment_id = $1
     ORDER BY bill_date, purchase_number`,
    [voucherId]
  );
  return rows;
}

// ─── VENDOR PICKER ────────────────────────────────────────────────────────────
// GET /api/vendor-payments/vendors
// Active vendors with what we owe them and any unapplied advance, largest
// balance first — the vendors most likely to be paid are at the top.
const listPayableVendors = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT v.id, v.vendor_name, v.vendor_code,
              COALESCE(o.outstanding, 0) AS outstanding,
              COALESCE(o.open_bills, 0)::int AS open_bills,
              COALESCE(a.advance, 0) AS advance
       FROM vendors v
       LEFT JOIN (
         SELECT vendor_id, SUM(balance) AS outstanding, COUNT(*) FILTER (WHERE balance > ${TOLERANCE}) AS open_bills
         FROM (
           SELECT vendor_id, grand_total - amount_paid - COALESCE(vendor_credit_applied, 0) AS balance
           FROM seed_purchases WHERE deleted_at IS NULL
           UNION ALL
           SELECT vendor_id, grand_total - amount_paid
           FROM material_purchases WHERE deleted_at IS NULL
         ) b
         WHERE balance > ${TOLERANCE}
         GROUP BY vendor_id
       ) o ON o.vendor_id = v.id
       LEFT JOIN (
         SELECT vp.vendor_id, SUM(vp.amount - (${ALLOCATED_SQL})) AS advance
         FROM vendor_payments vp WHERE vp.deleted_at IS NULL
         GROUP BY vp.vendor_id
       ) a ON a.vendor_id = v.id
       WHERE v.deleted_at IS NULL AND v.status = 'active'
       ORDER BY COALESCE(o.outstanding, 0) DESC, v.vendor_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── OPEN BILLS FOR A VENDOR ──────────────────────────────────────────────────
// GET /api/vendor-payments/vendors/:vendorId/open-bills
const getOpenBills = async (req, res, next) => {
  try {
    const { vendorId } = req.params;

    const vendor = await db.query(
      `SELECT id, vendor_name, vendor_code FROM vendors WHERE id = $1 AND deleted_at IS NULL`,
      [vendorId]
    );
    if (vendor.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Oldest first — the order auto-allocation fills them in.
    const { rows } = await db.query(
      `SELECT * FROM (
         SELECT 'seed' AS bill_type, sp.id AS bill_id, sp.purchase_number, sp.invoice_number,
                COALESCE(sp.invoice_date, sp.purchase_date) AS bill_date, sp.due_date,
                p.name AS description,
                sp.grand_total, sp.amount_paid,
                COALESCE(sp.vendor_credit_applied, 0) AS credit_applied,
                sp.grand_total - sp.amount_paid - COALESCE(sp.vendor_credit_applied, 0) AS balance,
                sp.created_at
         FROM seed_purchases sp
         LEFT JOIN products p ON p.id = sp.product_id
         WHERE sp.vendor_id = $1 AND sp.deleted_at IS NULL
         UNION ALL
         SELECT 'material', mp.id, mp.purchase_number, mp.invoice_number,
                COALESCE(mp.invoice_date, mp.purchase_date), mp.due_date,
                mp.item_description,
                mp.grand_total, mp.amount_paid, 0,
                mp.grand_total - mp.amount_paid,
                mp.created_at
         FROM material_purchases mp
         WHERE mp.vendor_id = $1 AND mp.deleted_at IS NULL
       ) b
       WHERE b.balance > ${TOLERANCE}
       ORDER BY b.bill_date ASC, b.invoice_number NULLS LAST, b.created_at ASC`,
      [vendorId]
    );

    const totalDue = round2(rows.reduce((s, r) => s + parseFloat(r.balance), 0));
    res.json({
      success: true,
      data: {
        vendor: vendor.rows[0],
        bills: rows,
        total_due: totalDue,
        advance: await vendorAdvance(db, vendorId),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
// POST /api/vendor-payments
const createVendorPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      vendor_id, payment_date, amount, payment_source, bank_account_id, cash_account_id,
      payment_method, reference_number, notes,
    } = req.body;

    const total = round2(amount);
    const parsed = parseAllocations(req.body.allocations);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { allocations } = parsed;

    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (allocated > total + TOLERANCE) {
      return res.status(400).json({
        success: false,
        message: `Allocations (₹${allocated.toFixed(2)}) exceed the payment amount (₹${total.toFixed(2)})`,
      });
    }

    await client.query('BEGIN');

    const vendor = await client.query(
      `SELECT id, vendor_name FROM vendors WHERE id = $1 AND deleted_at IS NULL`,
      [vendor_id]
    );
    if (vendor.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Validate the chosen source account, so a bad id fails cleanly rather
    // than as a foreign-key error mid-transaction.
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

    const check = await lockAndCheckBills(client, vendor_id, allocations);
    if (check.message) {
      await client.query('ROLLBACK');
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const paymentNumber = await generateDocNumber(client, 'vendor_payments', 'payment_number', 'VPAY', payment_date);
    const ins = await client.query(
      `INSERT INTO vendor_payments
         (payment_number, vendor_id, payment_date, amount, payment_source,
          bank_account_id, cash_account_id, payment_method, reference_number, notes,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [
        paymentNumber, vendor_id, payment_date, total, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        payment_method, reference_number || null, notes || null, req.user.id,
      ]
    );
    const voucher = ins.rows[0];

    // ONE ledger debit for the whole payment — matches the bank statement line.
    const billWord = allocations.length === 1 ? 'bill' : 'bills';
    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: voucher.bank_account_id,
      cashAccountId: voucher.cash_account_id,
      entryDate: payment_date,
      amount: total,
      partyName: vendor.rows[0].vendor_name,
      narration: allocations.length
        ? `Vendor payment ${paymentNumber} (${allocations.length} ${billWord})`
        : `Vendor advance ${paymentNumber}`,
      referenceNumber: reference_number || null,
      sourceType: SOURCE_TYPE,
      sourceId: voucher.id,
      userId: req.user.id,
    });

    await insertAllocations(client, voucher, allocations, req.user.id);

    await client.query('COMMIT');
    logger.info('Vendor payment recorded', {
      vendorPaymentId: voucher.id, vendorId: vendor_id, amount: total,
      bills: allocations.length, advance: round2(total - allocated), userId: req.user.id,
    });

    const result = await db.query(`${VOUCHER_SELECT} WHERE vp.id = $1`, [voucher.id]);
    res.status(201).json({
      success: true,
      data: { ...result.rows[0], allocations: await loadAllocations(db, voucher.id) },
      message: 'Vendor payment recorded',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── LIST ─────────────────────────────────────────────────────────────────────
// GET /api/vendor-payments?vendor_id=&from_date=&to_date=&page=&limit=
const listVendorPayments = async (req, res, next) => {
  try {
    const { vendor_id, from_date, to_date, search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

    const where = ['vp.deleted_at IS NULL'];
    const params = [];
    if (vendor_id) { params.push(vendor_id); where.push(`vp.vendor_id = $${params.length}`); }
    if (from_date) { params.push(from_date); where.push(`vp.payment_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); where.push(`vp.payment_date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(vp.payment_number ILIKE $${params.length} OR v.vendor_name ILIKE $${params.length}
                   OR vp.reference_number ILIKE $${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const count = await db.query(
      `SELECT COUNT(*)::int AS total FROM vendor_payments vp JOIN vendors v ON v.id = vp.vendor_id ${whereSql}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const { rows } = await db.query(
      `${VOUCHER_SELECT} ${whereSql}
       ORDER BY vp.payment_date DESC, vp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: count.rows[0].total, pages: Math.ceil(count.rows[0].total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
// GET /api/vendor-payments/:id
const getVendorPayment = async (req, res, next) => {
  try {
    const { rows } = await db.query(`${VOUCHER_SELECT} WHERE vp.id = $1 AND vp.deleted_at IS NULL`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor payment not found' });
    }
    res.json({ success: true, data: { ...rows[0], allocations: await loadAllocations(db, req.params.id) } });
  } catch (err) {
    next(err);
  }
};

// ─── APPLY ADVANCE TO MORE BILLS ──────────────────────────────────────────────
// POST /api/vendor-payments/:id/allocations   body: { allocations: [...] }
// No ledger entry: the money already left when the voucher was recorded.
const addAllocations = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const parsed = parseAllocations(req.body.allocations);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
    const { allocations } = parsed;
    if (allocations.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one bill' });
    }

    await client.query('BEGIN');

    // Lock the voucher so two people applying the same advance cannot both succeed.
    const v = await client.query(
      `SELECT * FROM vendor_payments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [req.params.id]
    );
    if (v.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Vendor payment not found' });
    }
    const voucher = v.rows[0];

    const adv = await client.query(
      `SELECT vp.amount - (${ALLOCATED_SQL}) AS advance FROM vendor_payments vp WHERE vp.id = $1`,
      [voucher.id]
    );
    const advance = round2(adv.rows[0].advance);
    const requested = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (requested > advance + TOLERANCE) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Only ₹${advance.toFixed(2)} of this payment is unallocated; ₹${requested.toFixed(2)} requested`,
      });
    }

    const check = await lockAndCheckBills(client, voucher.vendor_id, allocations);
    if (check.message) {
      await client.query('ROLLBACK');
      return res.status(check.status).json({ success: false, message: check.message });
    }

    await insertAllocations(client, voucher, allocations, req.user.id);
    await client.query(`UPDATE vendor_payments SET updated_at = NOW(), updated_by = $1 WHERE id = $2`, [req.user.id, voucher.id]);

    await client.query('COMMIT');
    logger.info('Vendor advance applied', { vendorPaymentId: voucher.id, amount: requested, bills: allocations.length, userId: req.user.id });

    const result = await db.query(`${VOUCHER_SELECT} WHERE vp.id = $1`, [voucher.id]);
    res.status(201).json({
      success: true,
      data: { ...result.rows[0], allocations: await loadAllocations(db, voucher.id) },
      message: 'Advance applied',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── REMOVE ONE ALLOCATION (money returns to advance) ─────────────────────────
// DELETE /api/vendor-payments/:id/allocations/:billType/:allocationId
const removeAllocation = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id, billType, allocationId } = req.params;
    if (!BILL_TYPES.includes(billType)) {
      return res.status(400).json({ success: false, message: `billType must be one of: ${BILL_TYPES.join(', ')}` });
    }
    const table = billType === 'seed' ? 'seed_purchase_payments' : 'material_purchase_payments';

    await client.query('BEGIN');
    const v = await client.query(
      `SELECT id FROM vendor_payments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (v.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Vendor payment not found' });
    }

    // The AFTER-DELETE trigger recomputes the bill's amount_paid / status.
    const del = await client.query(
      `DELETE FROM ${table} WHERE id = $1 AND vendor_payment_id = $2 RETURNING id`,
      [allocationId, id]
    );
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Allocation not found on this payment' });
    }
    await client.query(`UPDATE vendor_payments SET updated_at = NOW(), updated_by = $1 WHERE id = $2`, [req.user.id, id]);

    await client.query('COMMIT');
    logger.info('Vendor payment allocation removed', { vendorPaymentId: id, allocationId, billType, userId: req.user.id });
    res.json({ success: true, message: 'Allocation removed; the amount is back in the vendor advance' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── VOID ─────────────────────────────────────────────────────────────────────
// DELETE /api/vendor-payments/:id
// Removes every allocation (bills revert), reverses the ledger debit, and
// soft-deletes the voucher.
const voidVendorPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const v = await client.query(
      `SELECT id, payment_number FROM vendor_payments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (v.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Vendor payment not found' });
    }

    await client.query(`DELETE FROM seed_purchase_payments WHERE vendor_payment_id = $1`, [id]);
    await client.query(`DELETE FROM material_purchase_payments WHERE vendor_payment_id = $1`, [id]);
    await reverseSourceEntries(client, SOURCE_TYPE, id, req.user.id);
    await client.query(
      `UPDATE vendor_payments SET deleted_at = NOW(), deleted_by = $1, updated_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    logger.info('Vendor payment voided', { vendorPaymentId: id, paymentNumber: v.rows[0].payment_number, userId: req.user.id });
    res.json({ success: true, message: `${v.rows[0].payment_number} voided; bills and ledger reverted` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  listPayableVendors,
  getOpenBills,
  createVendorPayment,
  listVendorPayments,
  getVendorPayment,
  addAllocations,
  removeAllocation,
  voidVendorPayment,
  vendorAdvance,
};
