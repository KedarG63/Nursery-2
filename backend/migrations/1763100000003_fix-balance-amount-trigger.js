/**
 * Fix the calculate_balance_amount trigger to use GREATEST(0, ROUND(..., 2))
 * so that floating-point rounding errors (e.g. -0.0000000001) do not
 * violate the chk_balance_amount_positive CHECK constraint when a customer
 * pays the exact remaining balance.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_balance_amount()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.balance_amount := GREATEST(0, ROUND(NEW.total_amount - NEW.paid_amount, 2));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_balance_amount()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.balance_amount := NEW.total_amount - NEW.paid_amount;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
};
