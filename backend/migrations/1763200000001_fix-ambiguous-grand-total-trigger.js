/**
 * Fix ambiguous column reference "grand_total" in update_seed_purchase_payment_status trigger.
 * PL/pgSQL variable `grand_total` clashed with seed_purchases.grand_total column in UPDATE.
 * Rename variable to v_grand_total to remove ambiguity.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      v_total_paid  DECIMAL(12,2);
      v_grand_total DECIMAL(12,2);
      v_purchase_id UUID;
    BEGIN
      v_purchase_id := COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM seed_purchase_payments
      WHERE seed_purchase_id = v_purchase_id;

      SELECT sp.grand_total INTO v_grand_total
      FROM seed_purchases sp
      WHERE sp.id = v_purchase_id;

      UPDATE seed_purchases
      SET
        amount_paid    = v_total_paid,
        payment_status = CASE
          WHEN v_total_paid = 0              THEN 'pending'
          WHEN v_total_paid >= v_grand_total THEN 'paid'
          ELSE 'partial'
        END
      WHERE id = v_purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      total_paid  DECIMAL(12,2);
      grand_total DECIMAL(12,2);
      purchase_id UUID;
    BEGIN
      purchase_id := COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO total_paid
      FROM seed_purchase_payments
      WHERE seed_purchase_id = purchase_id;

      SELECT sp.grand_total INTO grand_total
      FROM seed_purchases sp
      WHERE sp.id = purchase_id;

      UPDATE seed_purchases
      SET
        amount_paid    = total_paid,
        payment_status = CASE
          WHEN total_paid = 0              THEN 'pending'
          WHEN total_paid >= grand_total   THEN 'paid'
          ELSE 'partial'
        END
      WHERE id = purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);
};
