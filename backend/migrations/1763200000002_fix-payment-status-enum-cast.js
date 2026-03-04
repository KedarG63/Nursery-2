/**
 * Fix: CASE expression in update_seed_purchase_payment_status returns text
 * but payment_status column is purchase_payment_status_enum.
 * Add explicit ::purchase_payment_status_enum cast.
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
          WHEN v_total_paid = 0              THEN 'pending'::purchase_payment_status_enum
          WHEN v_total_paid >= v_grand_total THEN 'paid'::purchase_payment_status_enum
          ELSE                                    'partial'::purchase_payment_status_enum
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
