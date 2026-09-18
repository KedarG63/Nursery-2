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
 *   - no customer's store credit is negative
 *   - no order is settled beyond its own total
 */

const db = require('../utils/db');
const logger = require('../config/logger');

// Money compares to the paisa. Anything smaller is float noise, not a mismatch.
const EPSILON = 0.005;

/**
 * Each check: a title, why it matters in plain words, and a query returning the
 * rows that violate it. An empty result set is a pass.
 */
const CHECKS = [
  {
    key: 'customer_return_oversettled',
    title: 'Customer returns settled for more than they are worth',
    explain:
      'A return can be offset, refunded and credited, but the three together must never exceed its value. '
      + 'If they do, the business has given back more than it took in.',
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
    title: 'Vendor returns settled for more than they are worth',
    explain:
      'The same rule on the purchase side: credit taken against bills plus cash the vendor paid back '
      + 'must never exceed the value of what was returned.',
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
    title: 'Order credit does not match its settlement rows',
    explain:
      'orders.credit_applied is a cached total of the return offsets and store credit applied to that order. '
      + 'Recomputed from the rows themselves, it must match exactly — a difference means an order balance is wrong.',
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
    title: 'Purchase bill credit does not match its settlement rows',
    explain:
      'seed_purchases.vendor_credit_applied is the cached total of vendor return credit set against that bill. '
      + 'If it drifts, accounts payable is overstated or understated by the difference.',
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
    title: 'Customer refunds with no matching ledger entry',
    explain:
      'Every refund paid to a customer must appear once in the cash book or bank ledger for the same amount. '
      + 'A refund missing here is money that left the business without being recorded anywhere.',
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
    title: 'Vendor refunds with no matching ledger entry',
    explain:
      'Money a vendor paid back must appear once in the cash book or bank ledger for the same amount. '
      + 'Missing here means cash came in that the books never saw.',
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
    title: 'Ledger entries pointing at a refund that no longer exists',
    explain:
      'The mirror of the previous two checks: a live ledger entry whose settlement row has gone. '
      + 'This inflates or deflates an account balance with nothing to justify it.',
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
    key: 'negative_store_credit',
    title: 'Customers whose store credit has gone negative',
    explain:
      'Store credit applied can never exceed store credit issued. A negative balance means an order '
      + 'was discounted with credit the customer never had.',
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
    title: 'Orders settled beyond their own total',
    explain:
      'Cash taken plus credit applied must never exceed what the order is worth. '
      + 'Beyond that, the customer has been charged for something they did not buy.',
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
    title: 'Accepted returns whose stock movement was never recorded',
    explain:
      'Accepting a return always puts the plants back into a lot, and which way it did that is written down. '
      + 'A blank here means stock may have moved without a record, or not moved at all.',
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
    title: 'Accepted returns still owing money back',
    explain:
      'Not an error — these are real open liabilities waiting for a refund or a store credit decision. '
      + 'They are listed so the amount owed to customers is never a surprise.',
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
    title: 'Accepted vendor returns still owed to us',
    explain:
      'Also not an error — credit the vendor owes that has not yet been taken against a bill or paid back. '
      + 'Left unwatched, this is the money most often quietly lost.',
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
          explain: check.explain,
          severity: check.severity,
          passed: r.rows.length === 0,
          count: r.rows.length,
          rows: r.rows,
        });
      } catch (err) {
        logger.error('Reconciliation check failed to run', { check: check.key, error: err.message });
        results.push({
          key: check.key,
          title: check.title,
          explain: check.explain,
          severity: check.severity,
          passed: null,
          error: err.message,
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
