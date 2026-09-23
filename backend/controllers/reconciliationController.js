/**
 * Reconciliation Report
 *
 * Proves, in one request, that the returns and credit machinery has not drifted
 * by a single rupee — and names the exact rows if it has.
 *
 * WHY THIS EXISTS
 * ---------------
 * The database triggers stop bad writes as they happen. They cannot speak for
 * rows written before those triggers existed, rows written by a migration or a
 * maintenance script (which can disable triggers with session_replication_role),
 * or a future code path that posts a settlement and forgets its ledger entry.
 *
 * So this is a separate, independent check: it recomputes every derived number
 * from the underlying rows and compares it against what is stored. Nothing here
 * trusts a cached column — that is the whole point.
 *
 * Every check answers one question and returns the offending rows, never just a
 * count, because "3 mismatches" cannot be fixed and "these 3 rows" can.
 *
 * A clean report means:
 *   - no document is settled for more than it is worth
 *   - every cached credit total equals the sum of its settlement rows
 *   - every refund that moved money has exactly one matching ledger entry
 *   - every bulk vendor payment has exactly one ledger entry, is never applied
 *     to bills beyond its amount, and none of its bills is booked separately
 *   - no customer's store credit is negative
 *   - no order is settled beyond its own total
 */

const db = require('../utils/db');
const logger = require('../config/logger');

// Money compares to the paisa. Anything smaller is float noise, not a mismatch.
const EPSILON = 0.005;

/**
 * Each check carries TWO labels, because the same check reads very differently
 * depending on the result:
 *
 *   verified — shown when it passes. A calm statement of what is confirmed
 *              correct. Most of the time every check passes, so this is what
 *              staff actually read, and it must not sound like an accusation.
 *   title    — shown only when rows are found. Names the problem directly.
 *   explain  — why it matters. Only shown alongside a real finding.
 *
 * None of these may contain table or column names: this page is read by the
 * people running the nursery, not by whoever maintains the schema.
 */
const CHECKS = [
  {
    key: 'customer_return_oversettled',
    verified: 'Every customer return is settled within its value',
    title: 'Some customer returns have been settled for more than they are worth',
    explain:
      'A return can be put against an unpaid order, refunded, or kept as store credit — but the three '
      + 'together must never add up to more than the return is worth.',
    severity: 'critical',
    sql: `
      SELECT crn.id, crn.return_number, c.name AS customer_name,
             crn.return_amount,
             COALESCE(SUM(crs.amount), 0)                       AS settled,
             COALESCE(SUM(crs.amount), 0) - crn.return_amount   AS excess
      FROM customer_return_notes crn
      JOIN customers c ON c.id = crn.customer_id
      LEFT JOIN customer_return_settlements crs ON crs.return_note_id = crn.id
      WHERE crn.deleted_at IS NULL
      GROUP BY crn.id, crn.return_number, c.name, crn.return_amount
      HAVING COALESCE(SUM(crs.amount), 0) > crn.return_amount + $1
      ORDER BY excess DESC`,
  },

  {
    key: 'vendor_return_oversettled',
    verified: 'Every vendor return is settled within its value',
    title: 'Some vendor returns have been settled for more than they are worth',
    explain:
      'The same rule on the purchase side: credit taken against bills, plus any cash the vendor paid '
      + 'back, must never add up to more than the value of what was returned.',
    severity: 'critical',
    sql: `
      SELECT vrn.id, vrn.return_number, v.vendor_name,
             vrn.return_amount,
             COALESCE(SUM(vrs.amount), 0)                       AS settled,
             COALESCE(SUM(vrs.amount), 0) - vrn.return_amount   AS excess
      FROM vendor_return_notes vrn
      JOIN vendors v ON v.id = vrn.vendor_id
      LEFT JOIN vendor_return_settlements vrs ON vrs.return_note_id = vrn.id
      WHERE vrn.deleted_at IS NULL
      GROUP BY vrn.id, vrn.return_number, v.vendor_name, vrn.return_amount
      HAVING COALESCE(SUM(vrs.amount), 0) > vrn.return_amount + $1
      ORDER BY excess DESC`,
  },

  {
    key: 'order_credit_applied_drift',
    verified: 'Order balances match the returns and store credit behind them',
    title: 'Some order balances do not match the returns and credit behind them',
    explain:
      'The credit shown on an order should equal the returns and store credit actually recorded against it. '
      + 'Where it differs, that order is showing the customer the wrong balance.',
    severity: 'critical',
    sql: `
      SELECT o.id, o.order_number, c.name AS customer_name,
             o.credit_applied AS stored,
             recomputed.total AS should_be,
             o.credit_applied - recomputed.total AS difference
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      CROSS JOIN LATERAL (
        SELECT
          COALESCE((SELECT SUM(amount) FROM customer_return_settlements
                     WHERE target_order_id = o.id AND settlement_type = 'order_offset'), 0)
        + COALESCE((SELECT SUM(amount) FROM customer_store_credit_ledger
                     WHERE order_id = o.id AND entry_type = 'applied' AND deleted_at IS NULL), 0)
          AS total
      ) recomputed
      WHERE o.deleted_at IS NULL
        AND ABS(o.credit_applied - recomputed.total) > $1
      ORDER BY ABS(o.credit_applied - recomputed.total) DESC`,
  },

  {
    key: 'purchase_credit_applied_drift',
    verified: 'Purchase bills match the return credit taken against them',
    title: 'Some purchase bills do not match the return credit taken against them',
    explain:
      'The credit shown on a purchase bill should equal the vendor returns actually set against it. '
      + 'Where it differs, the amount owed to that vendor is wrong by the difference.',
    severity: 'critical',
    sql: `
      SELECT sp.id, sp.purchase_number, v.vendor_name,
             sp.vendor_credit_applied AS stored,
             recomputed.total AS should_be,
             sp.vendor_credit_applied - recomputed.total AS difference
      FROM seed_purchases sp
      JOIN vendors v ON v.id = sp.vendor_id
      CROSS JOIN LATERAL (
        SELECT COALESCE((SELECT SUM(amount) FROM vendor_return_settlements
                          WHERE target_purchase_id = sp.id AND settlement_type = 'credit_offset'), 0)
          AS total
      ) recomputed
      WHERE sp.deleted_at IS NULL
        AND ABS(sp.vendor_credit_applied - recomputed.total) > $1
      ORDER BY ABS(sp.vendor_credit_applied - recomputed.total) DESC`,
  },

  {
    key: 'customer_refund_missing_ledger',
    verified: 'Every customer refund appears in the cash book or bank ledger',
    title: 'Some customer refunds are missing from the cash book and bank ledger',
    explain:
      'Every refund paid to a customer should appear once, for the same amount, in the cash book or the '
      + 'bank ledger. One that is missing is money that left without being written down anywhere.',
    severity: 'critical',
    sql: `
      SELECT crs.id, crn.return_number, c.name AS customer_name,
             crs.amount, crs.settlement_date, crs.payment_source,
             COALESCE(led.entries, 0)     AS ledger_entries,
             COALESCE(led.ledger_total, 0) AS ledger_total
      FROM customer_return_settlements crs
      JOIN customer_return_notes crn ON crn.id = crs.return_note_id
      JOIN customers c ON c.id = crn.customer_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS entries, COALESCE(SUM(amount), 0) AS ledger_total
        FROM (
          SELECT amount FROM bank_ledger_entries
           WHERE source_type = 'customer_return_refund' AND source_id = crs.id AND deleted_at IS NULL
          UNION ALL
          SELECT amount FROM cash_ledger_entries
           WHERE source_type = 'customer_return_refund' AND source_id = crs.id AND deleted_at IS NULL
        ) x
      ) led
      WHERE crs.settlement_type = 'refund'
        AND (led.entries <> 1 OR ABS(led.ledger_total - crs.amount) > $1)
      ORDER BY crs.settlement_date DESC`,
  },

  {
    key: 'vendor_refund_missing_ledger',
    verified: 'Every vendor refund appears in the cash book or bank ledger',
    title: 'Some vendor refunds are missing from the cash book and bank ledger',
    explain:
      'Money a vendor paid back should appear once, for the same amount, in the cash book or the bank '
      + 'ledger. One that is missing means cash came in that the books never saw.',
    severity: 'critical',
    sql: `
      SELECT vrs.id, vrn.return_number, v.vendor_name,
             vrs.amount, vrs.settlement_date, vrs.payment_source,
             COALESCE(led.entries, 0)      AS ledger_entries,
             COALESCE(led.ledger_total, 0) AS ledger_total
      FROM vendor_return_settlements vrs
      JOIN vendor_return_notes vrn ON vrn.id = vrs.return_note_id
      JOIN vendors v ON v.id = vrn.vendor_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS entries, COALESCE(SUM(amount), 0) AS ledger_total
        FROM (
          SELECT amount FROM bank_ledger_entries
           WHERE source_type = 'vendor_return_refund' AND source_id = vrs.id AND deleted_at IS NULL
          UNION ALL
          SELECT amount FROM cash_ledger_entries
           WHERE source_type = 'vendor_return_refund' AND source_id = vrs.id AND deleted_at IS NULL
        ) x
      ) led
      WHERE vrs.settlement_type = 'refund'
        AND (led.entries <> 1 OR ABS(led.ledger_total - vrs.amount) > $1)
      ORDER BY vrs.settlement_date DESC`,
  },

  {
    key: 'orphan_refund_ledger_entries',
    verified: 'No leftover refund entries in the cash book or bank ledger',
    title: 'Some cash book or bank entries refer to a refund that no longer exists',
    explain:
      'The opposite of the two checks above: an entry still counted in an account balance, for a refund '
      + 'that has since been removed. It moves that balance with nothing to justify it.',
    severity: 'critical',
    sql: `
      SELECT * FROM (
        -- source_type is a DIFFERENT enum in each ledger table, so both sides of
        -- the UNION are cast to text; without it Postgres refuses to combine them.
        SELECT 'bank' AS ledger, ble.id, ble.entry_date, ble.amount,
               ble.source_type::text AS source_type, ble.source_id, ble.narration
        FROM bank_ledger_entries ble
        WHERE ble.deleted_at IS NULL
          AND ble.source_type IN ('customer_return_refund', 'vendor_return_refund')
          AND NOT EXISTS (
            SELECT 1 FROM customer_return_settlements s WHERE s.id = ble.source_id
            UNION ALL
            SELECT 1 FROM vendor_return_settlements s WHERE s.id = ble.source_id
          )
        UNION ALL
        SELECT 'cash' AS ledger, cle.id, cle.entry_date, cle.amount,
               cle.source_type::text AS source_type, cle.source_id, cle.narration
        FROM cash_ledger_entries cle
        WHERE cle.deleted_at IS NULL
          AND cle.source_type IN ('customer_return_refund', 'vendor_return_refund')
          AND NOT EXISTS (
            SELECT 1 FROM customer_return_settlements s WHERE s.id = cle.source_id
            UNION ALL
            SELECT 1 FROM vendor_return_settlements s WHERE s.id = cle.source_id
          )
      ) orphans
      -- This check needs no tolerance, but every query is called with the same
      -- single parameter, so it is consumed here. The cast is required: Postgres
      -- cannot infer a bare parameter's type from "IS NOT NULL" alone.
      WHERE $1::numeric IS NOT NULL
      ORDER BY entry_date DESC`,
  },

  {
    key: 'vendor_payment_missing_ledger',
    verified: 'Every payment made to a vendor for several bills appears once in the cash book or bank ledger',
    title: 'Some vendor payments are missing from the cash book and bank ledger',
    explain:
      'A single payment that settles several bills leaves the account once, for its full amount. '
      + 'One that is missing, doubled, or for a different amount means the account balance is wrong.',
    severity: 'critical',
    sql: `
      SELECT vp.id, vp.payment_number, v.vendor_name, vp.amount, vp.payment_date, vp.payment_source,
             COALESCE(led.entries, 0)      AS ledger_entries,
             COALESCE(led.ledger_total, 0) AS ledger_total
      FROM vendor_payments vp
      JOIN vendors v ON v.id = vp.vendor_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS entries, COALESCE(SUM(amount), 0) AS ledger_total
        FROM (
          SELECT amount FROM bank_ledger_entries
           WHERE source_type = 'vendor_bulk_payment' AND source_id = vp.id AND deleted_at IS NULL
          UNION ALL
          SELECT amount FROM cash_ledger_entries
           WHERE source_type = 'vendor_bulk_payment' AND source_id = vp.id AND deleted_at IS NULL
        ) x
      ) led
      WHERE vp.deleted_at IS NULL
        AND (led.entries <> 1 OR ABS(led.ledger_total - vp.amount) > $1)
      ORDER BY vp.payment_date DESC`,
  },

  {
    key: 'vendor_payment_overallocated',
    verified: 'No vendor payment has been spread across bills for more than was paid',
    title: 'Some vendor payments have been applied to bills for more than was paid',
    explain:
      'The bills a payment settles can add up to at most the payment itself; anything left over is an '
      + 'advance with the vendor. Where they add up to more, bills are shown as paid with money that never left.',
    severity: 'critical',
    sql: `
      SELECT vp.id, vp.payment_number, v.vendor_name, vp.amount, alloc.allocated,
             alloc.allocated - vp.amount AS excess,
             vp.deleted_at IS NOT NULL AS voided
      FROM vendor_payments vp
      JOIN vendors v ON v.id = vp.vendor_id
      CROSS JOIN LATERAL (
        SELECT COALESCE((SELECT SUM(amount) FROM seed_purchase_payments     WHERE vendor_payment_id = vp.id), 0)
             + COALESCE((SELECT SUM(amount) FROM material_purchase_payments WHERE vendor_payment_id = vp.id), 0)
               AS allocated
      ) alloc
      -- A voided payment must have no bills left against it at all.
      WHERE alloc.allocated > vp.amount + $1
         OR (vp.deleted_at IS NOT NULL AND alloc.allocated > 0)
      ORDER BY vp.payment_date DESC`,
  },

  {
    key: 'vendor_payment_allocation_double_posted',
    verified: 'No bill settled by a combined vendor payment was also counted separately in the books',
    title: 'Some bills settled by a combined vendor payment were also counted separately in the books',
    explain:
      'When one payment settles several bills, only the payment itself goes in the cash book or bank '
      + 'ledger. A separate entry for one of its bills counts that money twice.',
    severity: 'critical',
    sql: `
      SELECT * FROM (
        SELECT 'bank' AS ledger, ble.id, ble.entry_date, ble.amount, ble.narration,
               vp.payment_number
        FROM bank_ledger_entries ble
        JOIN (
          SELECT id, vendor_payment_id FROM seed_purchase_payments     WHERE vendor_payment_id IS NOT NULL
          UNION ALL
          SELECT id, vendor_payment_id FROM material_purchase_payments WHERE vendor_payment_id IS NOT NULL
        ) a ON a.id = ble.source_id
        JOIN vendor_payments vp ON vp.id = a.vendor_payment_id
        WHERE ble.deleted_at IS NULL
        UNION ALL
        SELECT 'cash', cle.id, cle.entry_date, cle.amount, cle.narration,
               vp.payment_number
        FROM cash_ledger_entries cle
        JOIN (
          SELECT id, vendor_payment_id FROM seed_purchase_payments     WHERE vendor_payment_id IS NOT NULL
          UNION ALL
          SELECT id, vendor_payment_id FROM material_purchase_payments WHERE vendor_payment_id IS NOT NULL
        ) a ON a.id = cle.source_id
        JOIN vendor_payments vp ON vp.id = a.vendor_payment_id
        WHERE cle.deleted_at IS NULL
      ) doubled
      -- Tolerance is irrelevant here; consumed so every check shares one call signature.
      WHERE $1::numeric IS NOT NULL
      ORDER BY entry_date DESC`,
  },

  {
    key: 'orphan_vendor_payment_ledger_entries',
    verified: 'No leftover vendor payment entries in the cash book or bank ledger',
    title: 'Some cash book or bank entries refer to a vendor payment that was cancelled or no longer exists',
    explain:
      'Cancelling a vendor payment takes it out of the cash book or bank ledger. An entry still counted '
      + 'for a cancelled payment moves that balance with nothing to justify it.',
    severity: 'critical',
    sql: `
      SELECT * FROM (
        SELECT 'bank' AS ledger, ble.id, ble.entry_date, ble.amount, ble.narration
        FROM bank_ledger_entries ble
        WHERE ble.deleted_at IS NULL
          AND ble.source_type = 'vendor_bulk_payment'
          AND NOT EXISTS (SELECT 1 FROM vendor_payments vp WHERE vp.id = ble.source_id AND vp.deleted_at IS NULL)
        UNION ALL
        SELECT 'cash', cle.id, cle.entry_date, cle.amount, cle.narration
        FROM cash_ledger_entries cle
        WHERE cle.deleted_at IS NULL
          AND cle.source_type = 'vendor_bulk_payment'
          AND NOT EXISTS (SELECT 1 FROM vendor_payments vp WHERE vp.id = cle.source_id AND vp.deleted_at IS NULL)
      ) orphans
      WHERE $1::numeric IS NOT NULL
      ORDER BY entry_date DESC`,
  },

  {
    key: 'negative_store_credit',
    verified: 'No customer has spent more store credit than they were given',
    title: 'Some customers have spent more store credit than they were given',
    explain:
      'Store credit spent can never be more than store credit issued. Where it is, an order was reduced '
      + 'using credit the customer never actually had.',
    severity: 'critical',
    sql: `
      SELECT scl.customer_id, c.name AS customer_name,
             SUM(CASE WHEN scl.entry_type = 'issued'  THEN scl.amount ELSE 0 END) AS issued,
             SUM(CASE WHEN scl.entry_type = 'applied' THEN scl.amount ELSE 0 END) AS applied,
             SUM(CASE WHEN scl.entry_type = 'issued'  THEN scl.amount ELSE -scl.amount END) AS balance
      FROM customer_store_credit_ledger scl
      JOIN customers c ON c.id = scl.customer_id
      WHERE scl.deleted_at IS NULL
      GROUP BY scl.customer_id, c.name
      HAVING SUM(CASE WHEN scl.entry_type = 'issued' THEN scl.amount ELSE -scl.amount END) < -($1::numeric)
      ORDER BY balance ASC`,
  },

  {
    key: 'order_overcollected',
    verified: 'No order has been collected beyond its total',
    title: 'Some orders have been collected beyond their total',
    explain:
      'Cash taken plus credit applied should never come to more than the order is worth. '
      + 'Anything above that has been collected from the customer twice.',
    severity: 'critical',
    sql: `
      SELECT o.id, o.order_number, c.name AS customer_name,
             o.total_amount, o.paid_amount, o.credit_applied,
             o.paid_amount + o.credit_applied - o.total_amount AS excess
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at IS NULL
        AND o.status <> 'cancelled'
        AND o.paid_amount + o.credit_applied > o.total_amount + $1
      ORDER BY excess DESC`,
  },

  {
    key: 'accepted_return_without_restock',
    verified: 'Every accepted return recorded how its plants went back into stock',
    title: 'Some accepted returns did not record how their plants went back into stock',
    explain:
      'Accepting a return always puts the plants back into a lot, and how that happened is written down '
      + 'at the time. A blank means the stock may not have gone back at all — worth counting those trays.',
    severity: 'warning',
    sql: `
      SELECT crn.return_number, c.name AS customer_name, crn.accepted_at,
             cri.id AS return_item_id, s.sku_code, cri.quantity
      FROM customer_return_items cri
      JOIN customer_return_notes crn ON crn.id = cri.return_note_id
      JOIN customers c ON c.id = crn.customer_id
      JOIN skus s ON s.id = cri.sku_id
      WHERE crn.status = 'accepted'
        AND crn.deleted_at IS NULL
        AND cri.restock_method IS NULL
        -- Tolerance is irrelevant here; the parameter is consumed so every
        -- check can share one call signature. Cast for the same reason as above.
        AND $1::numeric IS NOT NULL
      ORDER BY crn.accepted_at DESC`,
  },

  {
    key: 'unsettled_returns',
    verified: 'Nothing is waiting to be refunded or credited to a customer',
    title: 'Money still to be given back to customers',
    explain:
      'Not a mistake — these returns have been accepted and are waiting for someone to choose a refund '
      + 'or store credit. They are listed so the amount owed to customers is never a surprise.',
    severity: 'info',
    sql: `
      SELECT crn.id, crn.return_number, c.name AS customer_name, o.order_number,
             crn.return_amount,
             crn.return_amount - COALESCE(SUM(crs.amount), 0) AS owed_back,
             crn.accepted_at
      FROM customer_return_notes crn
      JOIN customers c ON c.id = crn.customer_id
      JOIN orders o ON o.id = crn.order_id
      LEFT JOIN customer_return_settlements crs ON crs.return_note_id = crn.id
      WHERE crn.status = 'accepted' AND crn.deleted_at IS NULL
      GROUP BY crn.id, crn.return_number, c.name, o.order_number, crn.return_amount, crn.accepted_at
      HAVING crn.return_amount - COALESCE(SUM(crs.amount), 0) > $1
      ORDER BY owed_back DESC`,
  },

  {
    key: 'unsettled_vendor_returns',
    verified: 'No vendor owes us anything on returns',
    title: 'Money vendors still owe us on returns',
    explain:
      'Not a mistake — credit a vendor owes that has not yet been taken off a bill or paid back. '
      + 'This is the money most easily forgotten, so it is listed until it is claimed.',
    severity: 'info',
    sql: `
      SELECT vrn.id, vrn.return_number, v.vendor_name,
             vrn.return_amount,
             vrn.return_amount - COALESCE(SUM(vrs.amount), 0) AS open_balance,
             vrn.return_date
      FROM vendor_return_notes vrn
      JOIN vendors v ON v.id = vrn.vendor_id
      LEFT JOIN vendor_return_settlements vrs ON vrs.return_note_id = vrn.id
      WHERE vrn.status IN ('accepted', 'credited') AND vrn.deleted_at IS NULL
      GROUP BY vrn.id, vrn.return_number, v.vendor_name, vrn.return_amount, vrn.return_date
      HAVING vrn.return_amount - COALESCE(SUM(vrs.amount), 0) > $1
      ORDER BY open_balance DESC`,
  },
];

/**
 * GET /api/reconciliation/returns
 *
 * Runs every check and reports the result. Checks run independently: one that
 * fails to execute is reported as an error against that check alone, so a
 * single broken query never hides the other results.
 */
const getReturnsReconciliation = async (req, res, next) => {
  try {
    const results = [];

    for (const check of CHECKS) {
      try {
        const r = await db.query(check.sql, [EPSILON]);
        results.push({
          key: check.key,
          title: check.title,
          verified: check.verified,
          explain: check.explain,
          severity: check.severity,
          passed: r.rows.length === 0,
          count: r.rows.length,
          rows: r.rows,
        });
      } catch (err) {
        // The real error goes to the server log. The page is read by the people
        // running the nursery, so it gets a plain sentence — a raw database
        // error on screen tells them nothing and looks alarming.
        logger.error('Reconciliation check failed to run', { check: check.key, error: err.message });
        results.push({
          key: check.key,
          title: check.title,
          verified: check.verified,
          explain: check.explain,
          severity: check.severity,
          passed: null,
          error: 'This check could not be completed. The details have been logged for support.',
          count: 0,
          rows: [],
        });
      }
    }

    // "Balanced" is only about things that are actually wrong. The info checks
    // list real open balances, which are business as usual, not defects.
    const problems = results.filter((r) => r.severity !== 'info' && r.passed === false);
    const failedToRun = results.filter((r) => r.passed === null);

    const summary = {
      balanced: problems.length === 0 && failedToRun.length === 0,
      checks_run: results.length,
      checks_passed: results.filter((r) => r.passed === true).length,
      problems: problems.length,
      critical: problems.filter((r) => r.severity === 'critical').length,
      warnings: problems.filter((r) => r.severity === 'warning').length,
      checks_errored: failedToRun.length,
      generated_at: new Date().toISOString(),
    };

    // Money at stake, so the header can state it without the UI re-deriving it.
    const owed = results.find((r) => r.key === 'unsettled_returns');
    const owedToUs = results.find((r) => r.key === 'unsettled_vendor_returns');
    summary.owed_to_customers = (owed?.rows || [])
      .reduce((s, r) => s + parseFloat(r.owed_back || 0), 0);
    summary.owed_by_vendors = (owedToUs?.rows || [])
      .reduce((s, r) => s + parseFloat(r.open_balance || 0), 0);

    logger.info('Reconciliation report generated', {
      balanced: summary.balanced,
      problems: summary.problems,
      userId: req.user?.id,
    });

    res.json({ success: true, data: { summary, checks: results } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getReturnsReconciliation };
