/* eslint-disable camelcase */

/**
 * Migration: fix the material-purchase payment-status trigger.
 *
 * `update_material_purchase_payment_status()` assigned a bare CASE expression
 * to `payment_status`. In PL/pgSQL every branch is an unknown literal, so the
 * CASE resolves to `text`, and there is no implicit cast from text to
 * purchase_payment_status_enum. Every INSERT/UPDATE/DELETE on
 * material_purchase_payments therefore failed with:
 *
 *   column "payment_status" is of type purchase_payment_status_enum
 *   but expression is of type text
 *
 * i.e. NO payment could be recorded against a supplies purchase at all.
 *
 * Fix: cast the CASE result explicitly. Function body only — no table, column
 * or data changes, and the corrected function is idempotent on re-run.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_material_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      v_purchase_id UUID;
      v_total_paid  NUMERIC(14,2);
      v_grand_total NUMERIC(14,2);
    BEGIN
      v_purchase_id := COALESCE(NEW.material_purchase_id, OLD.material_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM material_purchase_payments
      WHERE material_purchase_id = v_purchase_id;

      SELECT grand_total INTO v_grand_total
      FROM material_purchases
      WHERE id = v_purchase_id;

      UPDATE material_purchases
      SET
        amount_paid = v_total_paid,
        payment_status = (CASE
          WHEN v_total_paid <= 0 THEN 'pending'
          WHEN v_total_paid >= COALESCE(v_grand_total, 0) THEN 'paid'
          ELSE 'partial'
        END)::purchase_payment_status_enum
      WHERE id = v_purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Re-sync any purchases whose stored status drifted (no payment could have
  // been recorded before this fix, but this makes the migration self-healing).
  pgm.sql(`
    UPDATE material_purchases mp
    SET
      amount_paid = COALESCE(t.paid, 0),
      payment_status = (CASE
        WHEN COALESCE(t.paid, 0) <= 0 THEN 'pending'
        WHEN COALESCE(t.paid, 0) >= COALESCE(mp.grand_total, 0) THEN 'paid'
        ELSE 'partial'
      END)::purchase_payment_status_enum
    FROM (
      SELECT mp2.id, COALESCE(SUM(p.amount), 0) AS paid
      FROM material_purchases mp2
      LEFT JOIN material_purchase_payments p ON p.material_purchase_id = mp2.id
      GROUP BY mp2.id
    ) t
    WHERE t.id = mp.id
      AND (mp.amount_paid IS DISTINCT FROM COALESCE(t.paid, 0));
  `);
};

exports.down = (pgm) => {
  // Restore the original (broken) body so the migration is reversible.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_material_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      v_purchase_id UUID;
      v_total_paid  NUMERIC(14,2);
      v_grand_total NUMERIC(14,2);
    BEGIN
      v_purchase_id := COALESCE(NEW.material_purchase_id, OLD.material_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM material_purchase_payments
      WHERE material_purchase_id = v_purchase_id;

      SELECT grand_total INTO v_grand_total
      FROM material_purchases
      WHERE id = v_purchase_id;

      UPDATE material_purchases
      SET
        amount_paid = v_total_paid,
        payment_status = CASE
          WHEN v_total_paid <= 0 THEN 'pending'
          WHEN v_total_paid >= COALESCE(v_grand_total, 0) THEN 'paid'
          ELSE 'partial'
        END
      WHERE id = v_purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);
};
