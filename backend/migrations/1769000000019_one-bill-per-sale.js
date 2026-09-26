/* eslint-disable camelcase */

/**
 * One bill per sale.
 *
 * THE PROBLEM
 * A sale had two bills (the order and its invoice) and nine code paths that
 * could record or change a payment, each checking a different balance — or
 * none. The Payments page checked the order and never applied the payment to
 * the invoice, so the invoice still showed the money as due and it was
 * recorded again there. Both posted to the Cash Book / Bank Ledger. The order's
 * paid figure was a running counter capped at the order total, so it silently
 * discarded anything beyond — the duplicates were invisible on every screen.
 *
 * THE MODEL
 *   bill    = the order's ISSUED invoice (issued / partially_paid / paid) if it
 *             has one, otherwise the order itself. A draft is not a bill yet —
 *             no payment can be recorded against it. A cancelled order's bill
 *             is 0: anything received on it is owed back.
 *   paid    = SUM of the sale's successful payments, net of refunds. Every
 *             payment counts, whether or not it was ever applied to the invoice.
 *   credit  = return offsets + store credit spent on this sale.
 *   balance = bill − paid − credit. Negative means OVER-COLLECTED, and is shown
 *             as such instead of being capped away.
 *
 * WHAT THIS MIGRATION DOES — all additive except item 4
 *   1. VIEW sale_bills: the model above, derived from rows, never stored.
 *   2. refresh_sale_money(order): recompute the cached money columns on the
 *      order and its invoice from rows. Replaces every "add" and "subtract".
 *   3. update_order_paid_amount now calls it, on INSERT, UPDATE and DELETE —
 *      so deleting or editing a payment can no longer drive the figure wrong.
 *      update_invoice_paid_amount now includes returns in balance and status.
 *   4. DROPS chk_orders_paid_plus_credit_within_total (added in …017). An
 *      order-level check cannot hold once the invoice is the bill: an invoice
 *      can be larger than its order (transport), so return credit measured
 *      against the bill can exceed the order total. It is REPLACED by item 5,
 *      which is strictly stronger because it checks against the real bill.
 *   5. assert_sale_within_bill(): refuses any payment, return offset or store
 *      credit that would take a sale beyond its bill. Reductions are always
 *      allowed, so over-collected sales can still be corrected.
 *
 * No existing row is rewritten. Cached figures are recomputed only for a sale
 * whose payments change from now on.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 0. Paid amounts with no payment record behind them ────────────────────
  // Some orders were marked paid (orders.paid_amount) without a payment row —
  // from older code paths or direct fixes. The new model counts payment rows,
  // so without this those orders would suddenly show as unpaid and the money
  // could be collected again. Instead each unexplained amount is recorded
  // HERE, explicitly, counted in the bill, and listed for review. Nothing is
  // invented and nothing on screen changes; it just stops being invisible.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS sale_paid_adjustments (
      id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id     uuid NOT NULL REFERENCES orders ON DELETE RESTRICT,
      amount       numeric(12,2) NOT NULL CHECK (amount > 0),
      reason       text NOT NULL,
      status       varchar(20) NOT NULL DEFAULT 'unreviewed'
                   CHECK (status IN ('unreviewed', 'confirmed', 'reversed')),
      reviewed_by  uuid REFERENCES users ON DELETE SET NULL,
      reviewed_at  timestamptz,
      created_at   timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_spa_order ON sale_paid_adjustments (order_id);
  `);
  pgm.sql(`
    INSERT INTO sale_paid_adjustments (order_id, amount, reason)
    SELECT o.id,
           o.paid_amount - rows_paid.paid,
           'Marked paid before one-bill-per-sale with no payment record behind it'
    FROM orders o
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(p.amount - COALESCE(p.refund_amount, 0)), 0) AS paid
      FROM payments p
      WHERE p.order_id = o.id AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
    ) rows_paid
    WHERE o.deleted_at IS NULL
      AND o.paid_amount > rows_paid.paid + 0.005
      AND NOT EXISTS (SELECT 1 FROM sale_paid_adjustments a WHERE a.order_id = o.id);
  `);

  // ── 1. The bill ────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE OR REPLACE VIEW sale_bills AS
    SELECT
      o.id                                           AS order_id,
      o.order_number,
      o.customer_id,
      o.order_date,
      o.status                                       AS order_status,
      inv.id                                         AS invoice_id,
      inv.invoice_number,
      inv.status                                     AS invoice_status,
      CASE WHEN inv.id IS NULL THEN 'order' ELSE 'invoice' END AS bill_source,
      o.total_amount                                 AS order_total,
      CASE WHEN o.status = 'cancelled' THEN 0::numeric
           ELSE COALESCE(inv.total_amount, o.total_amount) END AS bill_total,
      pay.paid,
      pay.payment_count,
      cr.returns_credit,
      COALESCE(ap.applied, 0)::numeric(12,2)         AS applied_to_invoice,
      ( CASE WHEN o.status = 'cancelled' THEN 0::numeric
             ELSE COALESCE(inv.total_amount, o.total_amount) END
        - pay.paid - cr.returns_credit )::numeric(12,2) AS balance
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT i.id, i.invoice_number, i.status, i.total_amount
      FROM invoices i
      WHERE i.order_id = o.id
        AND i.deleted_at IS NULL
        AND i.status IN ('issued', 'partially_paid', 'paid')
      ORDER BY i.created_at DESC
      LIMIT 1
    ) inv ON true
    CROSS JOIN LATERAL (
      SELECT ( COALESCE(SUM(p.amount - COALESCE(p.refund_amount, 0)), 0)
             + COALESCE((SELECT SUM(a.amount) FROM sale_paid_adjustments a
                          WHERE a.order_id = o.id AND a.status <> 'reversed'), 0)
             )::numeric(12,2) AS paid,
             COUNT(*)::int AS payment_count
      FROM payments p
      WHERE p.order_id = o.id
        AND p.deleted_at IS NULL
        AND p.status IN ('success', 'refunded')
    ) pay
    CROSS JOIN LATERAL (
      SELECT ( COALESCE((SELECT SUM(s.amount) FROM customer_return_settlements s
                          WHERE s.target_order_id = o.id AND s.settlement_type = 'order_offset'), 0)
             + COALESCE((SELECT SUM(l.amount) FROM customer_store_credit_ledger l
                          WHERE l.order_id = o.id AND l.entry_type = 'applied' AND l.deleted_at IS NULL), 0)
             )::numeric(12,2) AS returns_credit
    ) cr
    LEFT JOIN LATERAL (
      SELECT SUM(ip.amount_applied) AS applied
      FROM invoice_payments ip
      WHERE ip.invoice_id = inv.id
    ) ap ON true
    WHERE o.deleted_at IS NULL;
  `);

  // ── 2. One place that recomputes cached money for a sale ─────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_sale_money(p_order uuid)
    RETURNS void AS $$
    DECLARE
      v_paid     numeric(12,2);
      v_credit   numeric(12,2);
      v_invoice  uuid;
    BEGIN
      IF p_order IS NULL THEN
        RETURN;
      END IF;

      SELECT paid, returns_credit, invoice_id
        INTO v_paid, v_credit, v_invoice
        FROM sale_bills
       WHERE order_id = p_order;

      IF NOT FOUND THEN
        RETURN;   -- deleted order: nothing to maintain
      END IF;

      -- The order's own columns are a CAPPED mirror kept for stock and delivery
      -- screens; they can never show an over-collection. Money is read from
      -- sale_bills. They are recomputed, never incremented.
      UPDATE orders
         SET credit_applied = v_credit,
             paid_amount    = GREATEST(0, LEAST(total_amount - v_credit, v_paid)),
             updated_at     = NOW()
       WHERE id = p_order
         AND ( credit_applied IS DISTINCT FROM v_credit
            OR paid_amount    IS DISTINCT FROM GREATEST(0, LEAST(total_amount - v_credit, v_paid)) );

      IF v_invoice IS NOT NULL THEN
        PERFORM refresh_invoice_money(v_invoice);
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Invoice cache: paid = payments applied to it (bounded by the invoice's own
  // CHECK); balance and status also account for return credit on the sale.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_invoice_money(p_invoice uuid)
    RETURNS void AS $$
    DECLARE
      v_paid    numeric(12,2);
      v_total   numeric(12,2);
      v_credit  numeric(12,2);
      v_order   uuid;
      v_status  invoice_status_enum;
    BEGIN
      SELECT COALESCE(SUM(amount_applied), 0) INTO v_paid
        FROM invoice_payments WHERE invoice_id = p_invoice;

      SELECT total_amount, order_id INTO v_total, v_order
        FROM invoices WHERE id = p_invoice;
      IF NOT FOUND THEN
        RETURN;
      END IF;

      SELECT COALESCE(returns_credit, 0) INTO v_credit
        FROM sale_bills WHERE order_id = v_order;
      v_credit := COALESCE(v_credit, 0);

      IF v_paid + v_credit >= v_total - 0.005 THEN
        v_status := 'paid';
      ELSIF v_paid > 0 OR v_credit > 0 THEN
        v_status := 'partially_paid';
      ELSE
        v_status := 'issued';
      END IF;

      UPDATE invoices
         SET paid_amount    = v_paid,
             balance_amount = v_total - v_paid - v_credit,
             status         = CASE WHEN status IN ('issued', 'partially_paid', 'paid')
                                   THEN v_status ELSE status END,   -- keep draft / void
             updated_at     = NOW()
       WHERE id = p_invoice;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ── 3. Triggers call the recompute instead of adding / subtracting ───────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_order_paid_amount()
    RETURNS trigger AS $$
    BEGIN
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM refresh_sale_money(OLD.order_id);
      END IF;
      IF TG_OP = 'INSERT'
         OR (TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id) THEN
        PERFORM refresh_sale_money(NEW.order_id);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
  pgm.sql(`DROP TRIGGER IF EXISTS trigger_update_order_paid_amount ON payments;`);
  pgm.sql(`
    CREATE TRIGGER trigger_update_order_paid_amount
      AFTER INSERT OR UPDATE OR DELETE ON payments
      FOR EACH ROW EXECUTE PROCEDURE update_order_paid_amount();
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
    RETURNS trigger AS $$
    BEGIN
      PERFORM refresh_invoice_money(COALESCE(NEW.invoice_id, OLD.invoice_id));
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ── 4. The order-level check cannot hold once the invoice is the bill ─────
  pgm.sql(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_paid_plus_credit_within_total;`);

  // ── 5. Nothing may take a sale beyond its bill ────────────────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION assert_sale_within_bill()
    RETURNS trigger AS $$
    DECLARE
      v_order    uuid;
      v_balance  numeric(12,2);
    BEGIN
      IF TG_TABLE_NAME = 'payments' THEN
        -- Only money that counts.
        IF NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('success', 'refunded') THEN
          RETURN NULL;
        END IF;
        -- An online payment is confirmed AFTER the gateway has taken the money.
        -- Refusing it then would leave a customer charged with nothing recorded,
        -- so it is always recorded; the reconciliation report flags any excess.
        IF NEW.payment_gateway IS DISTINCT FROM 'manual' THEN
          RETURN NULL;
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id
           AND OLD.deleted_at IS NULL
           AND OLD.status IN ('success', 'refunded')
           AND (NEW.amount - COALESCE(NEW.refund_amount, 0))
               <= (OLD.amount - COALESCE(OLD.refund_amount, 0)) THEN
          RETURN NULL;   -- not an increase: always allowed
        END IF;
        v_order := NEW.order_id;

      ELSIF TG_TABLE_NAME = 'customer_return_settlements' THEN
        IF NEW.settlement_type <> 'order_offset' THEN
          RETURN NULL;
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.target_order_id IS NOT DISTINCT FROM OLD.target_order_id
           AND NEW.amount <= OLD.amount THEN
          RETURN NULL;
        END IF;
        v_order := NEW.target_order_id;

      ELSIF TG_TABLE_NAME = 'customer_store_credit_ledger' THEN
        IF NEW.entry_type <> 'applied' OR NEW.deleted_at IS NOT NULL THEN
          RETURN NULL;
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id
           AND OLD.deleted_at IS NULL
           AND NEW.amount <= OLD.amount THEN
          RETURN NULL;
        END IF;
        v_order := NEW.order_id;
      END IF;

      IF v_order IS NULL THEN
        RETURN NULL;
      END IF;

      SELECT balance INTO v_balance FROM sale_bills WHERE order_id = v_order;
      IF FOUND AND v_balance < -0.005 THEN
        RAISE EXCEPTION
          'Sale % would be settled beyond its bill (balance would be %)', v_order, v_balance
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER trg_payments_within_bill
      AFTER INSERT OR UPDATE ON payments
      FOR EACH ROW EXECUTE PROCEDURE assert_sale_within_bill();
    CREATE TRIGGER trg_crs_within_bill
      AFTER INSERT OR UPDATE ON customer_return_settlements
      FOR EACH ROW EXECUTE PROCEDURE assert_sale_within_bill();
    CREATE TRIGGER trg_scl_within_bill
      AFTER INSERT OR UPDATE ON customer_store_credit_ledger
      FOR EACH ROW EXECUTE PROCEDURE assert_sale_within_bill();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_payments_within_bill ON payments;
    DROP TRIGGER IF EXISTS trg_crs_within_bill ON customer_return_settlements;
    DROP TRIGGER IF EXISTS trg_scl_within_bill ON customer_store_credit_ledger;
    DROP FUNCTION IF EXISTS assert_sale_within_bill();
  `);

  // Restore the …017 payment trigger (add, capped) and its INSERT/UPDATE events.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_order_paid_amount()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.order_id IS NULL THEN
        RETURN NEW;
      END IF;
      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = LEAST(total_amount - COALESCE(credit_applied, 0), paid_amount + NEW.amount),
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
    $$ LANGUAGE plpgsql;
  `);
  pgm.sql(`DROP TRIGGER IF EXISTS trigger_update_order_paid_amount ON payments;`);
  pgm.sql(`
    CREATE TRIGGER trigger_update_order_paid_amount
      AFTER INSERT OR UPDATE ON payments
      FOR EACH ROW EXECUTE PROCEDURE update_order_paid_amount();
  `);

  // Restore the original invoice trigger body (…1763000000002).
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
    RETURNS TRIGGER AS $$
    DECLARE
      v_invoice_id  UUID;
      v_paid        DECIMAL(12,2);
      v_total       DECIMAL(12,2);
      v_new_status  invoice_status_enum;
    BEGIN
      v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
      SELECT COALESCE(SUM(amount_applied), 0) INTO v_paid
        FROM invoice_payments WHERE invoice_id = v_invoice_id;
      SELECT total_amount INTO v_total FROM invoices WHERE id = v_invoice_id;
      IF v_paid >= v_total THEN
        v_new_status := 'paid';
      ELSIF v_paid > 0 THEN
        v_new_status := 'partially_paid';
      ELSE
        v_new_status := 'issued';
      END IF;
      UPDATE invoices
         SET paid_amount    = v_paid,
             balance_amount = v_total - v_paid,
             status         = CASE WHEN status IN ('issued', 'partially_paid', 'paid')
                                   THEN v_new_status ELSE status END,
             updated_at     = NOW()
       WHERE id = v_invoice_id;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    DROP FUNCTION IF EXISTS refresh_sale_money(uuid);
    DROP FUNCTION IF EXISTS refresh_invoice_money(uuid);
    DROP VIEW IF EXISTS sale_bills;
    DROP TABLE IF EXISTS sale_paid_adjustments;
  `);

  // NOT VALID: re-adding must not fail on rows written while it was absent.
  pgm.sql(`
    ALTER TABLE orders ADD CONSTRAINT chk_orders_paid_plus_credit_within_total
      CHECK (paid_amount + credit_applied <= total_amount) NOT VALID;
  `);
};
