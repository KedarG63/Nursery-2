/* eslint-disable camelcase */

/**
 * Migration: repair orders.paid_amount corrupted by the payment double-count bug.
 *
 * Background: orders.paid_amount was bumped by BOTH the update_order_paid_amount()
 * trigger (migration 1768100000001) AND a redundant manual UPDATE in the payment
 * controller (recordOfflinePayment + gateway verifyPayment). Every offline payment
 * was therefore added twice. The LEAST(total_amount, …) cap in both masked it for
 * FULL payments (amount = whole balance → capped correct), so only PARTIAL / split
 * payments drifted (a ₹20,000 partial recorded as ₹40,000 paid).
 *
 * The controller code has been fixed (the manual updates removed), so no NEW drift
 * occurs. This migration heals the EXISTING data by recomputing paid_amount from the
 * authoritative source — the sum of an order's successful, non-deleted payments,
 * capped at total_amount. balance_amount is recomputed automatically by the existing
 * BEFORE-UPDATE set_balance_amount trigger.
 *
 * Safety:
 *   - Only orders that HAVE at least one successful, non-deleted payment AND whose
 *     stored paid_amount differs from the recomputed value are touched.
 *   - Orders with paid_amount > 0 but no successful payment are NOT changed; they are
 *     only reported (RAISE NOTICE) for manual review — this migration never zeroes a
 *     paid amount it cannot explain from the payments ledger.
 *   - Idempotent: re-running corrects nothing further (values already authoritative).
 *   - Runs in the migration's own transaction.
 *
 * Refunds: the `refunded` status / refund_amount path is unused in this deployment
 * (0 refunded rows); success-payment sum is the authoritative figure. If refunds are
 * ever used, revisit this formula.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      v_fixed  INT;
      v_orphan INT;
    BEGIN
      WITH correct AS (
        SELECT
          o.id,
          o.total_amount,
          o.paid_amount AS stored_paid,
          LEAST(
            o.total_amount,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'success' AND p.deleted_at IS NULL), 0)
          ) AS correct_paid,
          COUNT(p.id) FILTER (WHERE p.status = 'success' AND p.deleted_at IS NULL) AS pay_count
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.deleted_at IS NULL
        GROUP BY o.id, o.total_amount, o.paid_amount
      )
      UPDATE orders o
      SET paid_amount = c.correct_paid,
          updated_at  = NOW()
      FROM correct c
      WHERE o.id = c.id
        AND c.pay_count > 0
        AND ROUND(o.paid_amount, 2) <> ROUND(c.correct_paid, 2);

      GET DIAGNOSTICS v_fixed = ROW_COUNT;
      RAISE NOTICE 'paid_amount repair: corrected % order(s) with drifted paid_amount', v_fixed;

      SELECT COUNT(*) INTO v_orphan
      FROM orders o
      WHERE o.deleted_at IS NULL
        AND o.paid_amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.order_id = o.id AND p.status = 'success' AND p.deleted_at IS NULL
        );

      IF v_orphan > 0 THEN
        RAISE NOTICE 'paid_amount repair: % order(s) have paid_amount > 0 but no successful payment — left UNCHANGED for manual review', v_orphan;
      END IF;
    END $$;
  `);
};

exports.down = () => {
  // Irreversible data repair — there is no meaningful rollback (the previous
  // values were corrupt). Intentionally a no-op.
};
