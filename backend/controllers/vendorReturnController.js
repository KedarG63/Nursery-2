/**
 * Vendor Return Controller
 *
 * Manages the lifecycle of seed packet returns to vendors:
 *   draft → submitted → accepted → credited
 *   draft → submitted → rejected
 *
 * When a return is accepted the packets_returned count on the originating
 * seed_purchase is incremented.
 *
 * SETTLEMENT (migration 1769000000016): an accepted return is settled through
 * `vendor_return_settlements`, one row per event, so a single return can be
 * part-offset against a bill and part-refunded in cash. The invariant
 *
 *     return_amount = SUM(credit_offset) + SUM(refund) + open_balance
 *
 * is enforced by a database trigger, not just here. `credited_amount` and
 * `credited_to_purchase_id` on the note are kept in sync as a denormalised
 * cache of the offset total / most recent target.
 */

const pool = require('../config/database');
const db   = require('../utils/db');
const logger = require('../config/logger');
const { postSourceCredit } = require('./expenseController');

// Recompute a return note's settlement cache and status from its settlements.
// Called inside the caller's transaction, after any settlement change.
// Status stays 'accepted' while open credit remains, so it keeps showing up in
// getAvailableCredits; it becomes 'credited' only once fully settled.
async function refreshReturnSettlement(client, returnNoteId) {
  const agg = await client.query(
    `SELECT
       COALESCE(SUM(amount), 0)                                                    AS settled,
       COALESCE(SUM(amount) FILTER (WHERE settlement_type = 'credit_offset'), 0)   AS offset_total,
       (SELECT s2.target_purchase_id FROM vendor_return_settlements s2
         WHERE s2.return_note_id = $1 AND s2.settlement_type = 'credit_offset'
         ORDER BY s2.created_at DESC LIMIT 1)                                      AS last_target
     FROM vendor_return_settlements WHERE return_note_id = $1`,
    [returnNoteId]
  );
  const { settled, offset_total, last_target } = agg.rows[0];

  const note = await client.query(
    `SELECT return_amount FROM vendor_return_notes WHERE id = $1`, [returnNoteId]
  );
  const returnAmount = parseFloat(note.rows[0].return_amount);
  const fullySettled = parseFloat(settled) >= returnAmount - 0.005;

  await client.query(
    `UPDATE vendor_return_notes
        SET credited_amount         = $1,
            credited_to_purchase_id = $2,
            credited_at             = CASE WHEN $3 THEN NOW() ELSE credited_at END,
            status                  = CASE WHEN $3 THEN 'credited'::vendor_return_status_enum
                                           ELSE 'accepted'::vendor_return_status_enum END,
            updated_at              = NOW()
      WHERE id = $4`,
    [offset_total, last_target, fullySettled, returnNoteId]
  );

  return { settled: parseFloat(settled), returnAmount, open: parseFloat((returnAmount - parseFloat(settled)).toFixed(2)) };
}

// Recompute a bill's vendor_credit_applied from the settlements pointing at it,
// and re-derive its payment_status. Never incremental — always recomputed from
// the settlement rows, so it cannot drift.
async function refreshPurchaseCredit(client, purchaseId) {
  const res = await client.query(
    `UPDATE seed_purchases sp
        SET vendor_credit_applied = sub.total,
            payment_status = CASE
              WHEN sp.grand_total - sp.amount_paid - sub.total <= 0.005 THEN 'paid'::purchase_payment_status_enum
              WHEN sp.amount_paid > 0 OR sub.total > 0                  THEN 'partial'::purchase_payment_status_enum
              ELSE 'pending'::purchase_payment_status_enum
            END,
            updated_at = NOW()
       FROM (
         SELECT COALESCE(SUM(amount), 0) AS total
         FROM vendor_return_settlements
         WHERE target_purchase_id = $1 AND settlement_type = 'credit_offset'
       ) sub
      WHERE sp.id = $1
      RETURNING sp.vendor_credit_applied, sp.payment_status`,
    [purchaseId]
  );
  return res.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Full return note row with joined vendor / purchase data */
const RETURN_SELECT = `
  SELECT
    vrn.*,
    v.vendor_name,
    v.vendor_code,
    sp.purchase_number,
    sp.seed_lot_number,
    sp.number_of_packets,
    sp.packets_returned AS purchase_packets_returned,
    sp.cost_per_packet  AS purchase_cost_per_packet,
    p.name              AS product_name,
    s.sku_code,
    u1.full_name AS created_by_name,
    u2.full_name AS updated_by_name,
    -- Derived from the settlement ledger, never from vrn.credited_amount:
    -- that column holds credit applied to bills ONLY, so it ignores refunds.
    -- Anything showing "how much is still open" must use open_balance.
    COALESCE(st.settled, 0)                     AS settled_total,
    COALESCE(st.offset_total, 0)                AS credit_offset_total,
    COALESCE(st.refund_total, 0)                AS refund_total,
    vrn.return_amount - COALESCE(st.settled, 0) AS open_balance
  FROM vendor_return_notes vrn
  JOIN vendors       v  ON v.id  = vrn.vendor_id
  JOIN seed_purchases sp ON sp.id = vrn.seed_purchase_id
  JOIN skus          s  ON s.id  = sp.sku_id
  JOIN products      p  ON p.id  = sp.product_id
  LEFT JOIN users    u1 ON u1.id = vrn.created_by
  LEFT JOIN users    u2 ON u2.id = vrn.updated_by
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS settled,
           SUM(amount) FILTER (WHERE settlement_type = 'credit_offset') AS offset_total,
           SUM(amount) FILTER (WHERE settlement_type = 'refund')        AS refund_total
    FROM vendor_return_settlements WHERE return_note_id = vrn.id
  ) st ON true
`;

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// GET /api/vendor-returns
// ─────────────────────────────────────────────────────────────────────────────
const listReturns = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20,
      vendor_id, seed_purchase_id, status,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['vrn.deleted_at IS NULL'];

    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`vrn.vendor_id = $${params.length}`);
    }
    if (seed_purchase_id) {
      params.push(seed_purchase_id);
      conditions.push(`vrn.seed_purchase_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`vrn.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM vendor_return_notes vrn WHERE ${where}`,
      params
    );

    params.push(parseInt(limit), offset);

    const result = await db.query(
      `${RETURN_SELECT}
       WHERE ${where}
       ORDER BY vrn.return_date DESC, vrn.return_number DESC
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
// GET SINGLE
// GET /api/vendor-returns/:id
// ─────────────────────────────────────────────────────────────────────────────
const getReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `${RETURN_SELECT} WHERE vrn.id = $1 AND vrn.deleted_at IS NULL`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE  (draft)
// POST /api/vendor-returns
// ─────────────────────────────────────────────────────────────────────────────
const createReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      seed_purchase_id,
      return_date,
      packets_returned,
      reason,
      notes,
    } = req.body;

    if (!seed_purchase_id || !packets_returned) {
      return res.status(400).json({ success: false, message: 'seed_purchase_id and packets_returned are required' });
    }

    await client.query('BEGIN');

    // Load the purchase to validate and copy cost_per_packet
    const purchaseResult = await client.query(
      `SELECT sp.*, v.id AS vid
       FROM seed_purchases sp
       JOIN vendors v ON v.id = sp.vendor_id
       WHERE sp.id = $1 AND sp.deleted_at IS NULL`,
      [seed_purchase_id]
    );
    if (purchaseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Seed purchase not found' });
    }
    const purchase = purchaseResult.rows[0];

    // How many packets are still available to return?
    const alreadyReturned = parseInt(purchase.packets_returned) || 0;
    const maxReturnable   = parseInt(purchase.number_of_packets) - alreadyReturned;

    if (parseInt(packets_returned) > maxReturnable) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot return ${packets_returned} packets — only ${maxReturnable} remaining after previous returns`,
      });
    }

    const cost_per_packet = parseFloat(purchase.cost_per_packet);
    const return_amount   = (parseInt(packets_returned) * cost_per_packet).toFixed(2);

    const insertResult = await client.query(
      `INSERT INTO vendor_return_notes
         (seed_purchase_id, vendor_id, return_date, packets_returned, cost_per_packet, return_amount, reason, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [
        seed_purchase_id,
        purchase.vendor_id,
        return_date || new Date().toISOString().split('T')[0],
        parseInt(packets_returned),
        cost_per_packet,
        return_amount,
        reason || null,
        notes || null,
        req.user.id,
      ]
    );

    await client.query('COMMIT');

    const created = await db.query(
      `${RETURN_SELECT} WHERE vrn.id = $1`,
      [insertResult.rows[0].id]
    );

    logger.info('Vendor return note created', { returnId: insertResult.rows[0].id, userId: req.user.id });
    res.status(201).json({ success: true, data: created.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE (draft only)
// PUT /api/vendor-returns/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { return_date, packets_returned, reason, notes } = req.body;

    await client.query('BEGIN');

    const check = await client.query(
      `SELECT vrn.*, sp.number_of_packets, sp.packets_returned AS purchase_packets_returned, sp.cost_per_packet
       FROM vendor_return_notes vrn
       JOIN seed_purchases sp ON sp.id = vrn.seed_purchase_id
       WHERE vrn.id = $1 AND vrn.deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (check.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only draft return notes can be edited' });
    }

    const row = check.rows[0];
    const newPackets = packets_returned !== undefined ? parseInt(packets_returned) : row.packets_returned;
    const maxReturnable = parseInt(row.number_of_packets) - parseInt(row.purchase_packets_returned);

    if (newPackets > maxReturnable + row.packets_returned) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot return ${newPackets} packets — only ${maxReturnable + row.packets_returned} returnable`,
      });
    }

    const newReturnAmount = (newPackets * parseFloat(row.cost_per_packet)).toFixed(2);

    await client.query(
      `UPDATE vendor_return_notes
       SET return_date      = COALESCE($1, return_date),
           packets_returned = $2,
           return_amount    = $3,
           reason           = COALESCE($4, reason),
           notes            = COALESCE($5, notes),
           updated_by       = $6,
           updated_at       = NOW()
       WHERE id = $7`,
      [return_date || null, newPackets, newReturnAmount, reason || null, notes || null, req.user.id, id]
    );

    await client.query('COMMIT');

    const updated = await db.query(`${RETURN_SELECT} WHERE vrn.id = $1`, [id]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT  (draft → submitted)
// POST /api/vendor-returns/:id/submit
// ─────────────────────────────────────────────────────────────────────────────
const submitReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const check = await db.query(
      `SELECT id, status FROM vendor_return_notes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (check.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, message: `Cannot submit a ${check.rows[0].status} return note` });
    }

    await db.query(
      `UPDATE vendor_return_notes SET status = 'submitted', updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [req.user.id, id]
    );

    logger.info('Vendor return submitted', { returnId: id, userId: req.user.id });
    res.json({ success: true, message: 'Return note submitted to vendor' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT  (submitted → accepted)
// Increments packets_returned on the originating seed_purchase
// POST /api/vendor-returns/:id/accept
// ─────────────────────────────────────────────────────────────────────────────
const acceptReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const check = await client.query(
      `SELECT id, status, seed_purchase_id, packets_returned
       FROM vendor_return_notes
       WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (check.rows[0].status !== 'submitted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Cannot accept a ${check.rows[0].status} return note` });
    }

    const { seed_purchase_id, packets_returned } = check.rows[0];

    // Mark return as accepted
    await client.query(
      `UPDATE vendor_return_notes SET status = 'accepted', updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [req.user.id, id]
    );

    // Increment packets_returned and decrement seeds_remaining on the originating purchase.
    // seeds_remaining cannot go below 0.
    // Recalculate inventory_status based on new seeds_remaining.
    await client.query(
      `UPDATE seed_purchases
       SET packets_returned  = packets_returned + $1,
           seeds_remaining   = GREATEST(0, seeds_remaining - ($1 * seeds_per_packet)),
           inventory_status  = CASE
             WHEN GREATEST(0, seeds_remaining - ($1 * seeds_per_packet)) <= 0
               THEN 'exhausted'::seed_inventory_status_enum
             WHEN GREATEST(0, seeds_remaining - ($1 * seeds_per_packet)) < (total_seeds * 0.2)
               THEN 'low_stock'::seed_inventory_status_enum
             ELSE 'available'::seed_inventory_status_enum
           END,
           updated_at = NOW()
       WHERE id = $2`,
      [parseInt(packets_returned), seed_purchase_id]
    );

    await client.query('COMMIT');

    logger.info('Vendor return accepted', { returnId: id, packetsReturned: packets_returned, userId: req.user.id });
    res.json({ success: true, message: 'Return accepted. Seed inventory updated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REJECT  (submitted → rejected)
// POST /api/vendor-returns/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
const rejectReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const check = await db.query(
      `SELECT id, status FROM vendor_return_notes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (check.rows[0].status !== 'submitted') {
      return res.status(409).json({ success: false, message: `Cannot reject a ${check.rows[0].status} return note` });
    }

    await db.query(
      `UPDATE vendor_return_notes
       SET status = 'rejected', notes = COALESCE($1, notes), updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [notes || null, req.user.id, id]
    );

    logger.info('Vendor return rejected', { returnId: id, userId: req.user.id });
    res.json({ success: true, message: 'Return note marked as rejected' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// APPLY CREDIT to a purchase payment
// POST /api/vendor-returns/:id/apply-credit
// Body: { target_purchase_id, amount_to_apply }
// ─────────────────────────────────────────────────────────────────────────────
const applyCredit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { target_purchase_id, amount_to_apply, notes } = req.body;

    if (!target_purchase_id || !amount_to_apply) {
      return res.status(400).json({ success: false, message: 'target_purchase_id and amount_to_apply are required' });
    }

    await client.query('BEGIN');

    const returnCheck = await client.query(
      `SELECT id, status, vendor_id, return_amount, credited_amount
       FROM vendor_return_notes
       WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (returnCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (returnCheck.rows[0].status !== 'accepted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only accepted return notes can have credit applied' });
    }

    const vrn = returnCheck.rows[0];

    // Open balance comes from the settlement rows, not the cached scalar —
    // refunds consume the return just as offsets do, and the previous code
    // looked only at credited_amount.
    const settledRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS settled
       FROM vendor_return_settlements WHERE return_note_id = $1`,
      [id]
    );
    const available = parseFloat(vrn.return_amount) - parseFloat(settledRes.rows[0].settled);
    const applyAmt  = parseFloat(amount_to_apply);

    if (applyAmt > available + 0.005) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Only ${available.toFixed(2)} credit available (${applyAmt.toFixed(2)} requested)`,
      });
    }

    // Validate the target purchase: same vendor, not fully paid, credit won't exceed outstanding balance
    const purchaseCheck = await client.query(
      `SELECT id, vendor_id, grand_total, amount_paid, payment_status,
              COALESCE(vendor_credit_applied, 0) AS vendor_credit_applied
       FROM seed_purchases
       WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [target_purchase_id]
    );
    if (purchaseCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Target purchase not found' });
    }
    const tp = purchaseCheck.rows[0];
    if (tp.vendor_id !== vrn.vendor_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Target purchase must belong to the same vendor' });
    }
    if (tp.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Target bill is already fully paid — no outstanding balance to apply credit to' });
    }
    const outstanding = parseFloat(tp.grand_total) - parseFloat(tp.amount_paid) - parseFloat(tp.vendor_credit_applied);
    if (applyAmt > outstanding + 0.001) { // 0.001 tolerance for float rounding
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Credit amount ₹${applyAmt.toFixed(2)} exceeds outstanding balance ₹${outstanding.toFixed(2)} on this bill`,
      });
    }

    // Record the settlement event. The DB trigger refuses any insert that would
    // push total settlements past return_amount.
    await client.query(
      `INSERT INTO vendor_return_settlements
         (return_note_id, settlement_type, amount, target_purchase_id, notes, created_by)
       VALUES ($1, 'credit_offset', $2, $3, $4, $5)`,
      [id, applyAmt, target_purchase_id, notes || null, req.user.id]
    );

    // Recompute both sides from the settlement rows — never incrementally, so
    // the cached totals cannot drift from the ledger.
    const purchase = await refreshPurchaseCredit(client, target_purchase_id);
    const settlement = await refreshReturnSettlement(client, id);

    await client.query('COMMIT');

    logger.info('Vendor return credit applied', {
      returnId: id, targetPurchaseId: target_purchase_id, amount: applyAmt,
      openBalance: settlement.open, userId: req.user.id,
    });
    res.json({
      success: true,
      message: settlement.open > 0
        ? `Credit of ${applyAmt.toFixed(2)} applied. ${settlement.open.toFixed(2)} still available on this return.`
        : `Credit of ${applyAmt.toFixed(2)} applied. Return note fully settled.`,
      data: {
        applied: applyAmt,
        open_balance: settlement.open,
        target_credit_applied: purchase.vendor_credit_applied,
        target_payment_status: purchase.payment_status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RECORD A CASH/BANK REFUND against an accepted return
// POST /api/vendor-returns/:id/refund
// The vendor paid money back rather than issuing credit against a future bill.
// Posts a CREDIT to the chosen ledger — money coming in.
// ─────────────────────────────────────────────────────────────────────────────
const recordRefund = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      amount, payment_source, bank_account_id = null, cash_account_id = null,
      refund_date = null, notes = null,
    } = req.body;

    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      return res.status(400).json({ success: false, message: 'A positive amount is required' });
    }
    if (!['cash', 'bank'].includes(payment_source)) {
      return res.status(400).json({ success: false, message: 'payment_source must be cash or bank' });
    }
    if (payment_source === 'bank' && !bank_account_id) {
      return res.status(400).json({ success: false, message: 'bank_account_id is required when the refund lands in a bank' });
    }
    if (payment_source === 'cash' && !cash_account_id) {
      return res.status(400).json({ success: false, message: 'cash_account_id is required when the refund is taken in cash' });
    }

    await client.query('BEGIN');

    const noteRes = await client.query(
      `SELECT vrn.id, vrn.status, vrn.return_amount, vrn.return_number,
              COALESCE(v.vendor_name, 'Vendor') AS vendor_name
       FROM vendor_return_notes vrn
       LEFT JOIN vendors v ON v.id = vrn.vendor_id
       WHERE vrn.id = $1 AND vrn.deleted_at IS NULL
       FOR UPDATE OF vrn`,
      [id]
    );
    if (noteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    const note = noteRes.rows[0];
    if (!['accepted', 'credited'].includes(note.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Only a return the vendor has accepted can be refunded',
      });
    }

    const settledRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS settled
       FROM vendor_return_settlements WHERE return_note_id = $1`,
      [id]
    );
    const open = parseFloat(note.return_amount) - parseFloat(settledRes.rows[0].settled);
    if (amt > open + 0.005) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Only ${open.toFixed(2)} is unsettled on this return (${amt.toFixed(2)} requested)`,
      });
    }

    // Validate the destination account up front so a bad id is a clean 400.
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

    const entryDate = refund_date || new Date().toISOString().split('T')[0];

    const ins = await client.query(
      `INSERT INTO vendor_return_settlements
         (return_note_id, settlement_type, amount, settlement_date,
          payment_source, bank_account_id, cash_account_id, notes, created_by)
       VALUES ($1, 'refund', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        id, amt, entryDate, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        notes, req.user.id,
      ]
    );

    // Money coming IN from the vendor — a credit to our cash drawer / bank.
    await postSourceCredit(client, {
      paymentSource: payment_source,
      bankAccountId: payment_source === 'bank' ? bank_account_id : null,
      cashAccountId: payment_source === 'cash' ? cash_account_id : null,
      entryDate,
      amount: amt,
      partyName: note.vendor_name,
      narration: `Vendor refund for return ${note.return_number}`,
      referenceNumber: note.return_number,
      sourceType: 'vendor_return_refund',
      sourceId: ins.rows[0].id,
      userId: req.user.id,
    });

    const settlement = await refreshReturnSettlement(client, id);

    await client.query('COMMIT');

    logger.info('Vendor return refund recorded', {
      returnId: id, amount: amt, source: payment_source, openBalance: settlement.open, userId: req.user.id,
    });
    res.status(201).json({
      success: true,
      message: settlement.open > 0
        ? `Refund of ${amt.toFixed(2)} recorded. ${settlement.open.toFixed(2)} still unsettled on this return.`
        : `Refund of ${amt.toFixed(2)} recorded. Return note fully settled.`,
      data: { refunded: amt, open_balance: settlement.open },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET AVAILABLE CREDITS for a vendor
// GET /api/vendor-returns/available-credits/:vendorId
// Returns accepted (not fully credited) return notes for a vendor.
// ─────────────────────────────────────────────────────────────────────────────
const getAvailableCredits = async (req, res, next) => {
  try {
    const { vendorId } = req.params;

    const result = await db.query(
      `SELECT
         vrn.id, vrn.return_number, vrn.return_date,
         vrn.packets_returned, vrn.return_amount,
         COALESCE(vrn.credited_amount, 0) AS credited_amount,
         COALESCE(st.settled, 0)                     AS settled_total,
         COALESCE(st.refunded, 0)                    AS refunded_total,
         vrn.return_amount - COALESCE(st.settled, 0) AS available_credit,
         sp.purchase_number, sp.seed_lot_number,
         p.name AS product_name
       FROM vendor_return_notes vrn
       JOIN seed_purchases sp ON sp.id = vrn.seed_purchase_id
       JOIN skus s ON s.id = sp.sku_id
       JOIN products p ON p.id = sp.product_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS settled,
                COALESCE(SUM(amount) FILTER (WHERE settlement_type = 'refund'), 0) AS refunded
         FROM vendor_return_settlements WHERE return_note_id = vrn.id
       ) st ON true
       WHERE vrn.vendor_id = $1
         AND vrn.status = 'accepted'
         AND vrn.deleted_at IS NULL
         -- open balance nets refunds as well as offsets; the old query looked
         -- only at credited_amount, so a refunded return still showed credit
         AND (vrn.return_amount - COALESCE(st.settled, 0)) > 0.005
       ORDER BY vrn.return_date ASC`,
      [vendorId]
    );

    const totalAvailable = result.rows.reduce(
      (sum, r) => sum + parseFloat(r.available_credit), 0
    );

    res.json({ success: true, data: result.rows, total_available_credit: totalAvailable.toFixed(2) });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (soft)
// DELETE /api/vendor-returns/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteReturn = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, status FROM vendor_return_notes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (!['draft', 'rejected'].includes(check.rows[0].status)) {
      return res.status(409).json({ success: false, message: 'Only draft or rejected return notes can be deleted' });
    }

    await db.query(
      `UPDATE vendor_return_notes SET deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    logger.info('Vendor return deleted', { returnId: id, userId: req.user.id });
    res.json({ success: true, message: 'Return note deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listReturns,
  getReturn,
  createReturn,
  updateReturn,
  submitReturn,
  acceptReturn,
  rejectReturn,
  applyCredit,
  recordRefund,
  getAvailableCredits,
  deleteReturn,
};
