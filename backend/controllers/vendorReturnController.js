/**
 * Vendor Return Controller
 *
 * Manages the lifecycle of seed packet returns to vendors:
 *   draft → submitted → accepted → credited
 *   draft → submitted → rejected
 *
 * When a return is accepted the packets_returned count on the originating
 * seed_purchase is incremented.  When the credit is applied to a future
 * purchase payment the vendor_credit_applied column on that purchase is
 * updated and the return note status moves to 'credited'.
 */

const pool = require('../config/database');
const db   = require('../utils/db');
const logger = require('../config/logger');

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
    u2.full_name AS updated_by_name
  FROM vendor_return_notes vrn
  JOIN vendors       v  ON v.id  = vrn.vendor_id
  JOIN seed_purchases sp ON sp.id = vrn.seed_purchase_id
  JOIN skus          s  ON s.id  = sp.sku_id
  JOIN products      p  ON p.id  = sp.product_id
  LEFT JOIN users    u1 ON u1.id = vrn.created_by
  LEFT JOIN users    u2 ON u2.id = vrn.updated_by
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
    const { target_purchase_id, amount_to_apply } = req.body;

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
    const alreadyCredited = parseFloat(vrn.credited_amount) || 0;
    const available = parseFloat(vrn.return_amount) - alreadyCredited;
    const applyAmt  = parseFloat(amount_to_apply);

    if (applyAmt > available) {
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

    // Apply credit to the target purchase; auto-mark as paid if credit clears the balance
    const newCreditTotal = parseFloat(tp.vendor_credit_applied) + applyAmt;
    const newBalance = parseFloat(tp.grand_total) - parseFloat(tp.amount_paid) - newCreditTotal;
    const newPaymentStatus = newBalance <= 0.001 ? 'paid' : tp.payment_status;

    await client.query(
      `UPDATE seed_purchases
       SET vendor_credit_applied = $1,
           payment_status        = $2,
           updated_at            = NOW()
       WHERE id = $3`,
      [newCreditTotal, newPaymentStatus, target_purchase_id]
    );

    // Mark return note as credited
    await client.query(
      `UPDATE vendor_return_notes
       SET status                  = 'credited',
           credited_to_purchase_id = $1,
           credited_amount         = $2,
           credited_at             = NOW(),
           updated_by              = $3,
           updated_at              = NOW()
       WHERE id = $4`,
      [target_purchase_id, applyAmt, req.user.id, id]
    );

    await client.query('COMMIT');

    logger.info('Vendor return credit applied', {
      returnId: id, targetPurchaseId: target_purchase_id, amount: applyAmt, userId: req.user.id,
    });
    res.json({ success: true, message: `Credit of ${applyAmt.toFixed(2)} applied to purchase ${purchaseCheck.rows[0].id}` });
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
         vrn.return_amount - COALESCE(vrn.credited_amount, 0) AS available_credit,
         sp.purchase_number, sp.seed_lot_number,
         p.name AS product_name
       FROM vendor_return_notes vrn
       JOIN seed_purchases sp ON sp.id = vrn.seed_purchase_id
       JOIN skus s ON s.id = sp.sku_id
       JOIN products p ON p.id = sp.product_id
       WHERE vrn.vendor_id = $1
         AND vrn.status = 'accepted'
         AND vrn.deleted_at IS NULL
         AND (vrn.return_amount - COALESCE(vrn.credited_amount, 0)) > 0
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
  getAvailableCredits,
  deleteReturn,
};
