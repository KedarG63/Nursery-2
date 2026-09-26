/**
 * Sale Bill Service — the ONE place that decides how much a sale can receive.
 *
 * Every path that records or changes customer money goes through here:
 * payment at order creation, the Payments page, invoice payments, applying or
 * unlinking a payment, editing, deleting, online payments, returns and store
 * credit. Before this, each checked a different balance — or none — which is
 * how the same money came to be recorded twice.
 *
 * The figures come from the sale_bills view (migration …019), which derives
 * them from rows every time:
 *   bill    = the order's issued invoice if it has one, else the order
 *   paid    = every successful payment on the sale, net of refunds
 *   balance = bill − paid − return credit   (negative ⇒ over-collected)
 *
 * CONCURRENCY: callers must lockSale() first, inside their transaction. The
 * view reads committed rows, so two payments racing on one sale would each see
 * the old balance and both pass. Locking the order row serialises them.
 * Lock order is always order → invoice, never the reverse, to avoid deadlock.
 */

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const inr = (n) => `₹${r2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Money is compared to the paisa; anything smaller is float noise.
const EPSILON = 0.005;

/** An error meant to be shown to the person using the screen. */
class SaleBillError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SaleBillError';
    this.status = status;
  }
}

/** Lock the sale for the rest of the transaction. Returns false if not found. */
async function lockSale(client, orderId) {
  const r = await client.query(
    `SELECT id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [orderId]
  );
  return r.rows.length > 0;
}

/** The sale's bill, with every money figure as a number rounded to the paisa. */
async function getSaleBill(runner, orderId) {
  const r = await runner.query(`SELECT * FROM sale_bills WHERE order_id = $1`, [orderId]);
  const b = r.rows[0];
  if (!b) return null;
  return {
    ...b,
    order_total: r2(b.order_total),
    bill_total: r2(b.bill_total),
    paid: r2(b.paid),
    returns_credit: r2(b.returns_credit),
    applied_to_invoice: r2(b.applied_to_invoice),
    balance: r2(b.balance),
    over_collected: r2(b.balance) < -EPSILON,
  };
}

/** "invoice INV-2026-0012" or "order ORD-…" — whichever is the bill. */
function billName(bill) {
  return bill.bill_source === 'invoice'
    ? `invoice ${bill.invoice_number}`
    : `order ${bill.order_number}`;
}

/** One sentence stating the sale's position, used in every refusal. */
function position(bill) {
  const parts = [`The bill (${billName(bill)}) is ${inr(bill.bill_total)}`];
  parts.push(`${inr(bill.paid)} has been received`);
  if (bill.returns_credit > EPSILON) parts.push(`${inr(bill.returns_credit)} settled by returns`);
  return `${parts.join(', ')}.`;
}

/**
 * Refuse a sale whose recorded money already exceeds its bill. Paying anything
 * out or taking anything more on such a sale could compound a duplicate, so
 * the payments have to be reviewed first.
 */
function assertNotOverCollected(bill, action = 'record anything more') {
  if (bill.over_collected) {
    throw new SaleBillError(
      409,
      `${inr(-bill.balance)} more has been recorded against ${bill.order_number} than it was billed. `
      + `${position(bill)} Check this sale's payments for duplicates before you ${action}.`
    );
  }
}

/** Refuse anything that would take the sale beyond its bill. */
function assertCanReceive(bill, amount) {
  if (!bill) throw new SaleBillError(404, 'Order not found');
  if (bill.order_status === 'cancelled') {
    throw new SaleBillError(409, `Order ${bill.order_number} is cancelled, so no payment can be recorded against it.`);
  }
  assertNotOverCollected(bill);
  const amt = r2(amount);
  if (!(amt > 0)) throw new SaleBillError(400, 'The amount must be greater than zero.');
  if (amt > bill.balance + EPSILON) {
    throw new SaleBillError(
      400,
      `${inr(amt)} is more than is still due. ${position(bill)} Only ${inr(Math.max(0, bill.balance))} can still be received.`
    );
  }
}

/**
 * Apply a payment to the sale's invoice, if the invoice is the bill, so the
 * invoice can never show as unpaid money that has been received.
 * Idempotent on (invoice, payment).
 */
async function applyToInvoice(client, bill, paymentId, amount, userId, notes = null) {
  if (!bill || !bill.invoice_id) return;
  await client.query(`SELECT id FROM invoices WHERE id = $1 FOR UPDATE`, [bill.invoice_id]);
  await client.query(
    `INSERT INTO invoice_payments (invoice_id, payment_id, amount_applied, applied_by, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (invoice_id, payment_id) DO NOTHING`,
    [bill.invoice_id, paymentId, r2(amount), userId, notes]
  );
}

/**
 * Apply every payment on the sale that is not yet on its invoice — used when
 * an invoice is issued after money has already been received, which is
 * otherwise exactly how a received payment ends up shown as unpaid.
 * Oldest first, each limited to what the invoice can still hold.
 */
async function applyUnappliedPayments(client, orderId, invoiceId, userId) {
  const inv = await client.query(
    `SELECT total_amount - COALESCE((SELECT SUM(amount_applied) FROM invoice_payments WHERE invoice_id = $1), 0) AS room
     FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId]
  );
  let room = r2(inv.rows[0]?.room);
  const pays = await client.query(
    `SELECT p.id, p.amount - COALESCE(p.refund_amount, 0)
                  - COALESCE((SELECT SUM(amount_applied) FROM invoice_payments ip WHERE ip.payment_id = p.id), 0) AS unapplied
     FROM payments p
     WHERE p.order_id = $1 AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
     ORDER BY p.payment_date, p.created_at`,
    [orderId]
  );
  let applied = 0;
  for (const p of pays.rows) {
    const take = r2(Math.min(r2(p.unapplied), room));
    if (take <= EPSILON) continue;
    await client.query(
      `INSERT INTO invoice_payments (invoice_id, payment_id, amount_applied, applied_by, notes)
       VALUES ($1, $2, $3, $4, 'Applied when the invoice was issued')
       ON CONFLICT (invoice_id, payment_id) DO NOTHING`,
      [invoiceId, p.id, take, userId]
    );
    room = r2(room - take);
    applied = r2(applied + take);
  }
  return applied;
}

/** Recompute the cached money columns on the order and its invoice from rows. */
async function refreshSaleMoney(client, orderId) {
  await client.query(`SELECT refresh_sale_money($1)`, [orderId]);
}

/**
 * The customer is the shared walk-in record used by Quick Counter Sale. Store
 * credit on it would be spendable by whoever is at the counter next.
 */
async function isWalkInCustomer(runner, customerId) {
  const r = await runner.query(
    `SELECT 1 FROM customers WHERE id = $1 AND LOWER(TRIM(name)) = 'walk-in customer'`,
    [customerId]
  );
  return r.rows.length > 0;
}

/**
 * Send a SaleBillError to the client as { success:false, message }, the shape
 * every screen reads. Returns true if it handled the error.
 */
function respondIfBillError(res, err) {
  if (err instanceof SaleBillError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  // The database guard (assert_sale_within_bill) is the backstop behind the
  // checks above; if it ever fires, say so plainly rather than a raw error.
  if (err && err.code === '23514' && /settled beyond its bill/.test(err.message || '')) {
    res.status(409).json({
      success: false,
      message: 'This would take the sale beyond its bill, so it was not recorded. Refresh the page — another payment may have just been recorded.',
    });
    return true;
  }
  return false;
}

module.exports = {
  EPSILON,
  r2,
  inr,
  SaleBillError,
  lockSale,
  getSaleBill,
  billName,
  position,
  assertCanReceive,
  assertNotOverCollected,
  applyToInvoice,
  applyUnappliedPayments,
  refreshSaleMoney,
  isWalkInCustomer,
  respondIfBillError,
};
