/* eslint-disable camelcase */

/**
 * Migration: Fix update_order_paid_amount trigger to cap with LEAST
 *
 * The existing trigger did a plain `paid_amount + NEW.amount` which could
 * exceed total_amount and violate chk_paid_amount_not_exceed_total when
 * recording invoice payments on already-fully-paid orders.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createFunction(
    'update_order_paid_amount',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.order_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = LEAST(total_amount, paid_amount + NEW.amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        UPDATE orders
        SET paid_amount = GREATEST(0, paid_amount - NEW.refund_amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;

      RETURN NEW;
    END;
    `
  );
};

exports.down = (pgm) => {
  pgm.createFunction(
    'update_order_paid_amount',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = paid_amount + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.order_id;
      END IF;

      IF NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        UPDATE orders
        SET paid_amount = paid_amount - NEW.refund_amount,
            updated_at = NOW()
        WHERE id = NEW.order_id;
      END IF;

      RETURN NEW;
    END;
    `
  );
};
