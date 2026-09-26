/**
 * Customer Return Controller
 *
 * Customers bring back seedlings/saplings. Plants are taken back only if still
 * sellable, so every accepted return goes back into stock.
 *
 * Lifecycle:  draft → accepted            (restocked, value fixed, offset posted)
 *             draft → cancelled
 *
 * ── MONEY (see migration 1769000000017) ─────────────────────────────────────
 * A return of value R against an order with outstanding balance B splits
 * deterministically on acceptance:
 *
 *     order_offset = min(R, B)          posted automatically — pure arithmetic
 *     owed_back    = R - order_offset   settled explicitly: refund or store credit
 *
 * so cash is never refunded on an order the customer never paid for.
 *
 * Both invariants — return value fully accounted, and store credit never
 * negative — are enforced by database triggers as well as here.
 *
 * ── VALUE ────────────────────────────────────────────────────────────────────
 * Prorated by total_amount / subtotal_amount so a discounted order never
 * refunds more than was paid, and computed CUMULATIVELY per order in exact
 * NUMERIC arithmetic so repeated partial returns cannot drift by a paisa.
 *
 * ── STOCK ────────────────────────────────────────────────────────────────────
 * If the sale allocated a lot, returning releases that allocation
 * (allocated_quantity -= qty). If it never did, the plants are genuinely extra
 * stock and go into the chosen lot (quantity += qty). Either way
 * available_quantity rises by exactly qty, and no phantom stock is created.
 * order_items is never modified, so the sale record and revenue stay intact.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { generateDocNumber } = require('../utils/financialYear');
const { postSourceDebit } = require('./expenseController');
const bills = require('../services/saleBillService');

const r2 = (n) => Math.round(parseFloat(n) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — all recompute from the ledgers, never increment, so they cannot drift
// ─────────────────────────────────────────────────────────────────────────────

// orders.credit_applied = every credit set against this order's receivable:
// its own return offsets plus store credit carried in from earlier returns.
async function recomputeOrderCredit(client, orderId) {
  // One function recomputes every cached money figure for the sale — order and
  // invoice — from rows (migration …019). The balance returned is the sale's
  // real one, measured against its bill.
  await bills.refreshSaleMoney(client, orderId);
  const bill = await bills.getSaleBill(client, orderId);
  return { credit_applied: bill.returns_credit, balance_amount: bill.balance };
}

// How much of a return is still unsettled.
async function openBalance(client, returnNoteId) {
  const r = await client.query(
    `SELECT n.return_amount - COALESCE(SUM(s.amount), 0) AS open
     FROM customer_return_notes n
     LEFT JOIN customer_return_settlements s ON s.return_note_id = n.id
     WHERE n.id = $1
     GROUP BY n.return_amount`,
    [returnNoteId]
  );
  return r2(r.rows[0]?.open ?? 0);
}

// A customer's available store credit.
async function storeCreditBalance(runner, customerId) {
  const r = await runner.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type = 'issued' THEN amount ELSE -amount END), 0) AS balance
     FROM customer_store_credit_ledger
     WHERE customer_id = $1 AND deleted_at IS NULL`,
    [customerId]
  );
  return r2(r.rows[0].balance);
}

// Per order_item: sold, already returned (accepted notes only), still returnable.
async function returnableItems(runner, orderId, excludeReturnNoteId = null) {
  const r = await runner.query(
    `SELECT
       oi.id AS order_item_id, oi.sku_id, oi.lot_id, oi.quantity AS sold,
       oi.unit_price,
       s.sku_code, s.variety, p.name AS product_name,
       COALESCE((
         SELECT SUM(cri.quantity)
         FROM customer_return_items cri
         JOIN customer_return_notes crn ON crn.id = cri.return_note_id
         WHERE cri.order_item_id = oi.id
           AND crn.status = 'accepted'
           AND crn.deleted_at IS NULL
           AND ($2::uuid IS NULL OR crn.id <> $2::uuid)
       ), 0) AS already_returned
     FROM order_items oi
     JOIN skus s ON s.id = oi.sku_id
     JOIN products p ON p.id = s.product_id
     WHERE oi.order_id = $1
     ORDER BY p.name, s.sku_code`,
    [orderId, excludeReturnNoteId]
  );
  return r.rows.map((row) => ({
    ...row,
    sold: parseInt(row.sold, 10),
    already_returned: parseInt(row.already_returned, 10),
    returnable: parseInt(row.sold, 10) - parseInt(row.already_returned, 10),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-returns/order/:orderId/returnable
// What can still be returned on an order, for the UI.
// ─────────────────────────────────────────────────────────────────────────────
const getReturnable = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await db.query(
      `SELECT o.id, o.order_number, o.customer_id, o.status, o.subtotal_amount, o.total_amount,
              o.paid_amount, o.credit_applied, o.balance_amount, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND o.deleted_at IS NULL`,
      [orderId]
    );
    if (order.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

    const items = await returnableItems(db, orderId);
    res.json({ success: true, data: { order: order.rows[0], items } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns        (creates a DRAFT — nothing moves yet)
// body: { order_id, return_date?, reason?, notes?, items: [{order_item_id, quantity, lot_id?}] }
// ─────────────────────────────────────────────────────────────────────────────
const createReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { order_id, return_date = null, reason = null, notes = null, items } = req.body;

    if (!order_id) return res.status(400).json({ success: false, message: 'order_id is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }
    for (const it of items) {
      const q = Number(it.quantity);
      if (!it.order_item_id || !Number.isInteger(q) || q <= 0) {
        return res.status(400).json({ success: false, message: 'Each item needs an order_item_id and a whole-number quantity above 0' });
      }
    }
    // One line per order item — duplicates would dodge the per-item quantity check.
    const ids = items.map((i) => i.order_item_id);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ success: false, message: 'Each order item may appear only once in a return' });
    }

    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT id, customer_id, status FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [order_id]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'A cancelled order cannot have a return' });
    }

    const returnable = await returnableItems(client, order_id);
    const byId = new Map(returnable.map((r) => [r.order_item_id, r]));

    const lines = [];
    for (const it of items) {
      const src = byId.get(it.order_item_id);
      if (!src) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Item ${it.order_item_id} is not on this order` });
      }
      const qty = Number(it.quantity);
      if (qty > src.returnable) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `${src.product_name} (${src.sku_code}): only ${src.returnable} can still be returned (${qty} requested)`,
        });
      }

      // Stock destination: the lot the sale came from; if the sale never
      // allocated one, an explicit lot of the same SKU is required.
      let lotId = src.lot_id;
      if (!lotId) {
        if (!it.lot_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `${src.product_name} (${src.sku_code}) was sold without a lot — choose the lot the returned plants go into`,
          });
        }
        const lot = await client.query(
          `SELECT id FROM lots WHERE id = $1 AND sku_id = $2 AND deleted_at IS NULL`,
          [it.lot_id, src.sku_id]
        );
        if (lot.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Lot not found for ${src.sku_code}` });
        }
        lotId = it.lot_id;
      }
      lines.push({ ...src, qty, lotId });
    }

    const date = return_date || new Date().toISOString().split('T')[0];
    const returnNumber = await generateDocNumber(client, 'customer_return_notes', 'return_number', 'CRN', date);

    const noteRes = await client.query(
      `INSERT INTO customer_return_notes
         (return_number, customer_id, order_id, return_date, status, reason, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $7)
       RETURNING *`,
      [returnNumber, order.customer_id, order_id, date, reason, notes, req.user.id]
    );
    const note = noteRes.rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO customer_return_items
           (return_note_id, order_item_id, sku_id, lot_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [note.id, l.order_item_id, l.sku_id, l.lotId, l.qty, l.unit_price]
      );
    }

    await client.query('COMMIT');
    logger.info('Customer return drafted', { returnId: note.id, orderId: order_id, lines: lines.length, userId: req.user.id });
    res.status(201).json({ success: true, data: note });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns/:id/accept
// Restocks, fixes the value, and posts the order offset. Everything together.
// ─────────────────────────────────────────────────────────────────────────────
const acceptReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const noteRes = await client.query(
      `SELECT * FROM customer_return_notes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (noteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    const note = noteRes.rows[0];
    if (note.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Only a draft return can be accepted (this one is ${note.status})` });
    }

    // Lock the order — the offset and the balance must be read and written together.
    const orderRes = await client.query(
      `SELECT id, subtotal_amount, total_amount, paid_amount, credit_applied
       FROM orders WHERE id = $1 FOR UPDATE`,
      [note.order_id]
    );
    const order = orderRes.rows[0];

    // What the customer still owes is measured against the sale's REAL bill —
    // its invoice if it has one — using every payment received. The order's
    // own paid figure is capped, so on an invoiced sale it could say "fully
    // paid" when the customer still owed transport or more: the return would
    // then be treated as owed back, and cash refunded, while they were still in
    // debt. And if more has been recorded than billed, the payments may contain
    // duplicates — nothing is paid out until they are reviewed.
    const billBefore = await bills.getSaleBill(client, note.order_id);
    bills.assertNotOverCollected(billBefore, 'accept a return');

    const itemsRes = await client.query(
      `SELECT cri.*, oi.lot_id AS sold_from_lot
       FROM customer_return_items cri
       JOIN order_items oi ON oi.id = cri.order_item_id
       WHERE cri.return_note_id = $1`,
      [id]
    );
    const items = itemsRes.rows;
    if (items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Return note has no items' });
    }

    // Re-check quantities under the lock — another return may have been
    // accepted since this draft was created.
    const returnable = await returnableItems(client, note.order_id, id);
    const byId = new Map(returnable.map((r) => [r.order_item_id, r]));
    for (const it of items) {
      const src = byId.get(it.order_item_id);
      if (!src || it.quantity > src.returnable) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `${src ? src.sku_code : it.order_item_id}: only ${src ? src.returnable : 0} can still be returned — another return was accepted in the meantime`,
        });
      }
    }

    // ── Restock ──────────────────────────────────────────────────────────────
    for (const it of items) {
      let method;
      if (it.sold_from_lot && it.sold_from_lot === it.lot_id) {
        // The sale reserved this lot; returning releases that reservation.
        // lots_allocated_quantity_check (>= 0) is the backstop.
        await client.query(
          `UPDATE lots SET allocated_quantity = allocated_quantity - $1, updated_at = NOW() WHERE id = $2`,
          [it.quantity, it.lot_id]
        );
        method = 'released_allocation';
      } else {
        // The sale never allocated this lot; these plants are genuinely extra stock.
        await client.query(
          `UPDATE lots SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
          [it.quantity, it.lot_id]
        );
        method = 'added_quantity';
      }
      // Record how stock moved, so it never has to be inferred later.
      await client.query(
        `UPDATE customer_return_items SET restock_method = $1 WHERE id = $2`,
        [method, it.id]
      );
      // available_quantity is recomputed by trigger_calculate_available_quantity.
    }

    // ── Value — prorated and cumulative, in exact NUMERIC ────────────────────
    const valueRes = await client.query(
      `WITH prior AS (
         SELECT COALESCE(SUM(cri.quantity * cri.unit_price), 0) AS gross
         FROM customer_return_items cri
         JOIN customer_return_notes crn ON crn.id = cri.return_note_id
         WHERE crn.order_id = $1 AND crn.status = 'accepted'
           AND crn.deleted_at IS NULL AND crn.id <> $2
       ),
       this AS (
         SELECT COALESCE(SUM(quantity * unit_price), 0) AS gross
         FROM customer_return_items WHERE return_note_id = $2
       )
       SELECT
         this.gross AS gross,
         CASE WHEN o.subtotal_amount > 0 THEN
             ROUND((prior.gross + this.gross) * o.total_amount / o.subtotal_amount, 2)
           - ROUND(prior.gross * o.total_amount / o.subtotal_amount, 2)
         ELSE 0 END AS value
       FROM prior, this, orders o
       WHERE o.id = $1`,
      [note.order_id, id]
    );
    const gross = r2(valueRes.rows[0].gross);
    const value = r2(valueRes.rows[0].value);

    await client.query(
      `UPDATE customer_return_notes
          SET status = 'accepted', gross_amount = $1, return_amount = $2,
              accepted_at = NOW(), updated_by = $3, updated_at = NOW()
        WHERE id = $4`,
      [gross, value, req.user.id, id]
    );

    // ── Order offset — cancels what they still owe, before anything is owed back
    const outstanding = r2(billBefore.balance);
    const offset = r2(Math.min(value, Math.max(0, outstanding)));
    if (offset > 0) {
      await client.query(
        `INSERT INTO customer_return_settlements
           (return_note_id, settlement_type, amount, settlement_date, target_order_id, notes, created_by)
         VALUES ($1, 'order_offset', $2, $3, $4, $5, $6)`,
        [id, offset, note.return_date, note.order_id, 'Offset against the order\'s unpaid balance', req.user.id]
      );
    }
    const orderAfter = await recomputeOrderCredit(client, note.order_id);
    const owedBack = r2(value - offset);

    await client.query('COMMIT');

    logger.info('Customer return accepted', {
      returnId: id, orderId: note.order_id, gross, value, offset, owedBack, userId: req.user.id,
    });
    res.json({
      success: true,
      message: owedBack > 0
        ? `Return accepted and restocked. ${offset > 0 ? `${offset.toFixed(2)} offset against the unpaid balance. ` : ''}${owedBack.toFixed(2)} is owed back to the customer — choose Refund or Store credit.`
        : `Return accepted and restocked. ${offset.toFixed(2)} offset against the unpaid balance — nothing is owed back.`,
      data: {
        gross_amount: gross,
        return_amount: value,
        order_offset: offset,
        owed_back: owedBack,
        order_balance_after: parseFloat(orderAfter.balance_amount),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared guard for the two explicit settlements of the owed-back amount.
// ─────────────────────────────────────────────────────────────────────────────
async function lockAcceptedNote(client, id) {
  const r = await client.query(
    `SELECT crn.*, COALESCE(c.name, 'Customer') AS customer_name
     FROM customer_return_notes crn
     LEFT JOIN customers c ON c.id = crn.customer_id
     WHERE crn.id = $1 AND crn.deleted_at IS NULL
     FOR UPDATE OF crn`,
    [id]
  );
  return r.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns/:id/refund
// body: { amount, payment_source, bank_account_id | cash_account_id, refund_date?, notes? }
// Money goes OUT to the customer — posts a DEBIT.
// ─────────────────────────────────────────────────────────────────────────────
const recordRefund = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, payment_source, bank_account_id = null, cash_account_id = null, refund_date = null, notes = null } = req.body;

    const amt = r2(amount);
    if (!(amt > 0)) return res.status(400).json({ success: false, message: 'A positive amount is required' });
    if (!['cash', 'bank'].includes(payment_source)) {
      return res.status(400).json({ success: false, message: 'payment_source must be cash or bank' });
    }
    if (payment_source === 'bank' && !bank_account_id) {
      return res.status(400).json({ success: false, message: 'bank_account_id is required when refunding from a bank' });
    }
    if (payment_source === 'cash' && !cash_account_id) {
      return res.status(400).json({ success: false, message: 'cash_account_id is required when refunding in cash' });
    }

    await client.query('BEGIN');
    const note = await lockAcceptedNote(client, id);
    if (!note) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (note.status !== 'accepted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only an accepted return can be refunded' });
    }

    // Paying cash out on a sale whose recorded payments exceed its bill could
    // be paying back money that was only ever recorded twice, never received.
    await bills.lockSale(client, note.order_id);
    bills.assertNotOverCollected(await bills.getSaleBill(client, note.order_id), 'refund anything');

    const open = await openBalance(client, id);
    if (amt > open) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Only ${open.toFixed(2)} is owed back on this return (${amt.toFixed(2)} requested)` });
    }

    const acct = payment_source === 'bank'
      ? await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [bank_account_id])
      : await client.query(`SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [cash_account_id]);
    if (acct.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `${payment_source === 'bank' ? 'Bank' : 'Cash'} account not found or inactive` });
    }

    const entryDate = refund_date || new Date().toISOString().split('T')[0];
    const ins = await client.query(
      `INSERT INTO customer_return_settlements
         (return_note_id, settlement_type, amount, settlement_date,
          payment_source, bank_account_id, cash_account_id, notes, created_by)
       VALUES ($1, 'refund', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [id, amt, entryDate, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        notes, req.user.id]
    );

    // Money leaving the business.
    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: payment_source === 'bank' ? bank_account_id : null,
      cashAccountId: payment_source === 'cash' ? cash_account_id : null,
      entryDate,
      amount: amt,
      partyName: note.customer_name,
      narration: `Customer refund for return ${note.return_number}`,
      referenceNumber: note.return_number,
      sourceType: 'customer_return_refund',
      sourceId: ins.rows[0].id,
      userId: req.user.id,
    });

    const remaining = await openBalance(client, id);
    await client.query('COMMIT');

    logger.info('Customer return refunded', { returnId: id, amount: amt, source: payment_source, remaining, userId: req.user.id });
    res.status(201).json({
      success: true,
      message: remaining > 0
        ? `Refunded ${amt.toFixed(2)}. ${remaining.toFixed(2)} still owed back on this return.`
        : `Refunded ${amt.toFixed(2)}. Return fully settled.`,
      data: { refunded: amt, open_balance: remaining },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns/:id/store-credit
// body: { amount, notes? }
// Keeps the owed-back amount as store credit for a future order. No money moves.
// ─────────────────────────────────────────────────────────────────────────────
const issueStoreCredit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount, notes = null } = req.body;

    const amt = r2(amount);
    if (!(amt > 0)) return res.status(400).json({ success: false, message: 'A positive amount is required' });

    await client.query('BEGIN');
    const note = await lockAcceptedNote(client, id);
    if (!note) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Return note not found' });
    }
    if (note.status !== 'accepted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only an accepted return can be converted to store credit' });
    }

    // Every counter sale shares one "Walk-in Customer" record, so credit kept
    // there could be spent by whoever is at the counter next. Walk-ins are
    // refunded, never credited.
    if (await bills.isWalkInCustomer(client, note.customer_id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Walk-in customers share one account, so store credit cannot be kept for them. Refund the amount instead.',
      });
    }

    await bills.lockSale(client, note.order_id);
    bills.assertNotOverCollected(await bills.getSaleBill(client, note.order_id), 'issue store credit');

    const open = await openBalance(client, id);
    if (amt > open) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Only ${open.toFixed(2)} is owed back on this return (${amt.toFixed(2)} requested)` });
    }

    const ins = await client.query(
      `INSERT INTO customer_return_settlements
         (return_note_id, settlement_type, amount, notes, created_by)
       VALUES ($1, 'store_credit', $2, $3, $4)
       RETURNING id`,
      [id, amt, notes, req.user.id]
    );
    await client.query(
      `INSERT INTO customer_store_credit_ledger
         (customer_id, entry_type, amount, return_settlement_id, notes, created_by)
       VALUES ($1, 'issued', $2, $3, $4, $5)`,
      [note.customer_id, amt, ins.rows[0].id, `From return ${note.return_number}`, req.user.id]
    );

    const remaining = await openBalance(client, id);
    const balance = await storeCreditBalance(client, note.customer_id);
    await client.query('COMMIT');

    logger.info('Store credit issued', { returnId: id, customerId: note.customer_id, amount: amt, balance, userId: req.user.id });
    res.status(201).json({
      success: true,
      message: `${amt.toFixed(2)} kept as store credit. Customer's available credit is now ${balance.toFixed(2)}.`,
      data: { issued: amt, open_balance: remaining, customer_store_credit: balance },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-returns/store-credit/:customerId
// ─────────────────────────────────────────────────────────────────────────────
const getStoreCredit = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const balance = await storeCreditBalance(db, customerId);
    const history = await db.query(
      `SELECT scl.id, scl.entry_type, scl.amount, scl.entry_date, scl.notes, scl.created_at,
              scl.order_id, o.order_number, crn.return_number
       FROM customer_store_credit_ledger scl
       LEFT JOIN orders o ON o.id = scl.order_id
       LEFT JOIN customer_return_settlements crs ON crs.id = scl.return_settlement_id
       LEFT JOIN customer_return_notes crn ON crn.id = crs.return_note_id
       WHERE scl.customer_id = $1 AND scl.deleted_at IS NULL
       ORDER BY scl.created_at DESC`,
      [customerId]
    );
    res.json({ success: true, data: { balance, history: history.rows } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns/store-credit/apply
// body: { order_id, amount, notes? }
// Explicit, never automatic: spends the customer's store credit against an order.
// ─────────────────────────────────────────────────────────────────────────────
const applyStoreCredit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { order_id, amount, notes = null } = req.body;
    const amt = r2(amount);
    if (!order_id) return res.status(400).json({ success: false, message: 'order_id is required' });
    if (!(amt > 0)) return res.status(400).json({ success: false, message: 'A positive amount is required' });

    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT id, customer_id, status, total_amount, paid_amount, credit_applied, order_number
       FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [order_id]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Store credit cannot be applied to a cancelled order' });
    }

    // Serialise all credit movements for this customer so two concurrent
    // applications cannot both read the same balance.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`store_credit:${order.customer_id}`]);

    const balance = await storeCreditBalance(client, order.customer_id);
    if (amt > balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Customer has only ${balance.toFixed(2)} store credit (${amt.toFixed(2)} requested)` });
    }
    // Measured against the sale's real bill (its invoice if it has one), with
    // every payment received — exactly like a payment, because it settles the
    // bill exactly like one.
    const bill = await bills.getSaleBill(client, order_id);
    bills.assertNotOverCollected(bill, 'apply store credit');
    const outstanding = r2(bill.balance);
    if (amt > outstanding + bills.EPSILON) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Order ${order.order_number} has only ${outstanding.toFixed(2)} outstanding (${amt.toFixed(2)} requested). ${bills.position(bill)}`,
      });
    }

    await client.query(
      `INSERT INTO customer_store_credit_ledger
         (customer_id, entry_type, amount, order_id, notes, created_by)
       VALUES ($1, 'applied', $2, $3, $4, $5)`,
      [order.customer_id, amt, order_id, notes || `Applied to order ${order.order_number}`, req.user.id]
    );
    const orderAfter = await recomputeOrderCredit(client, order_id);
    const balanceAfter = await storeCreditBalance(client, order.customer_id);

    await client.query('COMMIT');

    logger.info('Store credit applied', { orderId: order_id, customerId: order.customer_id, amount: amt, balanceAfter, userId: req.user.id });
    res.status(201).json({
      success: true,
      message: `${amt.toFixed(2)} store credit applied to ${order.order_number}. ${balanceAfter.toFixed(2)} credit remains.`,
      data: {
        applied: amt,
        order_balance_after: parseFloat(orderAfter.balance_amount),
        customer_store_credit: balanceAfter,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (bills.respondIfBillError(res, err)) return;
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-returns/:id/cancel   (draft only — nothing has moved)
// ─────────────────────────────────────────────────────────────────────────────
const cancelReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await db.query(
      `UPDATE customer_return_notes
          SET status = 'cancelled', updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL AND status = 'draft'
        RETURNING id`,
      [req.user.id, id]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Only a draft return can be cancelled' });
    }
    res.json({ success: true, message: 'Return cancelled' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-returns        and        GET /api/customer-returns/:id
// ─────────────────────────────────────────────────────────────────────────────
const RETURN_SELECT = `
  SELECT crn.*, c.name AS customer_name, o.order_number,
         COALESCE(st.offset_total, 0)       AS offset_total,
         COALESCE(st.refund_total, 0)       AS refund_total,
         COALESCE(st.store_credit_total, 0) AS store_credit_total,
         crn.return_amount - COALESCE(st.settled, 0) AS open_balance
  FROM customer_return_notes crn
  JOIN customers c ON c.id = crn.customer_id
  JOIN orders o ON o.id = crn.order_id
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS settled,
           SUM(amount) FILTER (WHERE settlement_type = 'order_offset') AS offset_total,
           SUM(amount) FILTER (WHERE settlement_type = 'refund')       AS refund_total,
           SUM(amount) FILTER (WHERE settlement_type = 'store_credit') AS store_credit_total
    FROM customer_return_settlements WHERE return_note_id = crn.id
  ) st ON true
`;

const listReturns = async (req, res, next) => {
  try {
    const { customer_id, order_id, status, page = 1, limit = 20 } = req.query;
    const params = [];
    const where = ['crn.deleted_at IS NULL'];
    if (customer_id) { params.push(customer_id); where.push(`crn.customer_id = $${params.length}`); }
    if (order_id)    { params.push(order_id);    where.push(`crn.order_id = $${params.length}`); }
    if (status)      { params.push(status);      where.push(`crn.status = $${params.length}`); }

    const count = await db.query(`SELECT COUNT(*) FROM customer_return_notes crn WHERE ${where.join(' AND ')}`, params);
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));
    const rows = await db.query(
      `${RETURN_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY crn.return_date DESC, crn.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = parseInt(count.rows[0].count, 10);
    res.json({
      success: true,
      data: rows.rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) },
    });
  } catch (err) {
    next(err);
  }
};

const getReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    const note = await db.query(`${RETURN_SELECT} WHERE crn.id = $1 AND crn.deleted_at IS NULL`, [id]);
    if (note.rows.length === 0) return res.status(404).json({ success: false, message: 'Return note not found' });

    const items = await db.query(
      `SELECT cri.*, s.sku_code, s.variety, p.name AS product_name, l.lot_number
       FROM customer_return_items cri
       JOIN skus s ON s.id = cri.sku_id
       JOIN products p ON p.id = s.product_id
       LEFT JOIN lots l ON l.id = cri.lot_id
       WHERE cri.return_note_id = $1
       ORDER BY p.name`,
      [id]
    );
    const settlements = await db.query(
      `SELECT crs.*, ba.account_name AS bank_account_name, ca.account_name AS cash_account_name
       FROM customer_return_settlements crs
       LEFT JOIN bank_accounts ba ON ba.id = crs.bank_account_id
       LEFT JOIN cash_accounts ca ON ca.id = crs.cash_account_id
       WHERE crs.return_note_id = $1
       ORDER BY crs.created_at`,
      [id]
    );
    res.json({ success: true, data: { ...note.rows[0], items: items.rows, settlements: settlements.rows } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getReturnable,
  createReturn,
  acceptReturn,
  recordRefund,
  issueStoreCredit,
  getStoreCredit,
  applyStoreCredit,
  cancelReturn,
  listReturns,
  getReturn,
  // exported for the reconciliation report
  storeCreditBalance,
};
