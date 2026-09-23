/* eslint-disable camelcase */

/**
 * Migration: bulk vendor payments (Tally-style "one payment, many bills").
 *
 * WHY THIS EXISTS
 *
 * Every vendor payment was tied to exactly one bill, so paying a vendor for
 * ten invoices meant recording ten payments — and the bank book showed ten
 * debits for what was really one transfer. A `vendor_payments` voucher records
 * the money ONCE, and its allocations spread it across the vendor's seed and
 * supplies bills.
 *
 * THE MODEL
 *
 *   - An allocation is an ordinary row in `seed_purchase_payments` or
 *     `material_purchase_payments`, carrying the new `vendor_payment_id`.
 *     The existing triggers therefore keep each bill's amount_paid /
 *     payment_status correct with no change.
 *   - Only the VOUCHER posts to the cash/bank ledger
 *     (source_type 'vendor_bulk_payment', source_id = vendor_payments.id).
 *     Allocation rows post nothing — otherwise the money would count twice.
 *   - Vendor advance = voucher amount − SUM(its allocations). Derived, never
 *     stored, so it cannot drift.
 *
 *     vendor_payments.amount = SUM(allocations) + advance   (advance >= 0)
 *
 *   The database enforces advance >= 0 and same-vendor allocations below.
 *
 * ALSO FIXED HERE — update_seed_purchase_payment_status() ignored
 * vendor_credit_applied, so a bill settled partly by a return credit and
 * partly by payment ended as 'partial' with ₹0 due, and could no longer be
 * paid or credited. The new body agrees with refreshPurchaseCredit() in
 * vendorReturnController. Only the function is replaced; existing rows are
 * NOT rewritten here.
 *
 * Safety: additive only — one table, two nullable columns, two enum values,
 * three trigger functions (one a replaced body). No new enum value is used
 * inside this migration.
 */

exports.shorthands = undefined;

const SEED_STATUS_FN_NEW = `
  CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
  RETURNS TRIGGER AS $$
  DECLARE
    v_total_paid  DECIMAL(12,2);
    v_grand_total DECIMAL(12,2);
    v_credit      DECIMAL(12,2);
    v_purchase_id UUID;
  BEGIN
    v_purchase_id := COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM seed_purchase_payments
    WHERE seed_purchase_id = v_purchase_id;

    SELECT sp.grand_total, COALESCE(sp.vendor_credit_applied, 0)
      INTO v_grand_total, v_credit
    FROM seed_purchases sp
    WHERE sp.id = v_purchase_id;

    -- Same rule as refreshPurchaseCredit(): credit offset against the bill
    -- counts towards settling it.
    UPDATE seed_purchases
    SET
      amount_paid    = v_total_paid,
      payment_status = CASE
        WHEN v_grand_total - v_total_paid - v_credit <= 0.005 THEN 'paid'::purchase_payment_status_enum
        WHEN v_total_paid > 0 OR v_credit > 0                  THEN 'partial'::purchase_payment_status_enum
        ELSE                                                        'pending'::purchase_payment_status_enum
      END
    WHERE id = v_purchase_id;

    RETURN COALESCE(NEW, OLD);
  END;
  $$ LANGUAGE plpgsql;
`;

// Body from 1763200000002 — restored on rollback.
const SEED_STATUS_FN_OLD = `
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
`;

exports.up = (pgm) => {
  // Added here, first used by the controller in a later transaction.
  pgm.addTypeValue('bank_ledger_source_type_enum', 'vendor_bulk_payment', { ifNotExists: true });
  pgm.addTypeValue('cash_ledger_source_type_enum', 'vendor_bulk_payment', { ifNotExists: true });

  pgm.createTable('vendor_payments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    payment_number: { type: 'varchar(30)', notNull: true, unique: true },
    vendor_id: { type: 'uuid', notNull: true, references: 'vendors', onDelete: 'RESTRICT' },
    payment_date: { type: 'date', notNull: true },
    amount: { type: 'numeric(12,2)', notNull: true },

    payment_source: { type: 'expense_payment_source_enum', notNull: true },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    payment_method: { type: 'varchar(20)', notNull: true },
    reference_number: { type: 'varchar(100)' },
    notes: { type: 'varchar(500)' },

    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  }, { ifNotExists: true });

  pgm.createIndex('vendor_payments', 'vendor_id', { name: 'idx_vpay_vendor', ifNotExists: true });
  pgm.createIndex('vendor_payments', 'payment_date', { name: 'idx_vpay_date', ifNotExists: true });

  pgm.addConstraint('vendor_payments', 'chk_vpay_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('vendor_payments', 'chk_vpay_method', {
    check: `payment_method IN ('cash', 'cheque', 'upi', 'bank_transfer')`,
  });
  pgm.addConstraint('vendor_payments', 'chk_vpay_source_consistency', {
    check: `
      (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR
      (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  // Allocation link on both bill-payment tables. NULL = an ordinary single-bill
  // payment that posts its own ledger entry, exactly as before.
  pgm.addColumns('seed_purchase_payments', {
    vendor_payment_id: { type: 'uuid', references: 'vendor_payments', onDelete: 'RESTRICT' },
  }, { ifNotExists: true });
  pgm.addColumns('material_purchase_payments', {
    vendor_payment_id: { type: 'uuid', references: 'vendor_payments', onDelete: 'RESTRICT' },
  }, { ifNotExists: true });

  pgm.createIndex('seed_purchase_payments', 'vendor_payment_id', {
    name: 'idx_spp_vendor_payment', where: 'vendor_payment_id IS NOT NULL', ifNotExists: true,
  });
  pgm.createIndex('material_purchase_payments', 'vendor_payment_id', {
    name: 'idx_matpurpay_vendor_payment', where: 'vendor_payment_id IS NOT NULL', ifNotExists: true,
  });

  // ── The guarantee ──────────────────────────────────────────────────────────
  // A voucher can never be allocated beyond its amount, and only to bills of
  // its own vendor. Enforced in the database so a hand-written SQL fix cannot
  // break the invariant either.
  pgm.createFunction(
    'assert_vendor_payment_allocation',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    DECLARE
      v_voucher_id     uuid;
      v_voucher_vendor uuid;
      v_voucher_amount numeric(12,2);
      v_bill_vendor    uuid;
      v_allocated      numeric(12,2);
    BEGIN
      v_voucher_id := NEW.vendor_payment_id;
      IF v_voucher_id IS NULL THEN
        RETURN NULL;
      END IF;

      SELECT vendor_id, amount INTO v_voucher_vendor, v_voucher_amount
      FROM vendor_payments WHERE id = v_voucher_id;

      IF TG_TABLE_NAME = 'seed_purchase_payments' THEN
        SELECT vendor_id INTO v_bill_vendor FROM seed_purchases WHERE id = NEW.seed_purchase_id;
      ELSE
        SELECT vendor_id INTO v_bill_vendor FROM material_purchases WHERE id = NEW.material_purchase_id;
      END IF;

      IF v_bill_vendor IS DISTINCT FROM v_voucher_vendor THEN
        RAISE EXCEPTION 'Vendor payment % allocated to a bill of a different vendor', v_voucher_id;
      END IF;

      SELECT
        COALESCE((SELECT SUM(amount) FROM seed_purchase_payments     WHERE vendor_payment_id = v_voucher_id), 0)
      + COALESCE((SELECT SUM(amount) FROM material_purchase_payments WHERE vendor_payment_id = v_voucher_id), 0)
      INTO v_allocated;

      -- half-paisa tolerance for numeric rounding
      IF v_allocated > v_voucher_amount + 0.005 THEN
        RAISE EXCEPTION
          'Vendor payment % over-allocated: allocations % exceed payment amount %',
          v_voucher_id, v_allocated, v_voucher_amount;
      END IF;

      RETURN NULL;
    END;
    `
  );

  pgm.createTrigger('seed_purchase_payments', 'trg_spp_vendor_payment_alloc', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    level: 'ROW',
    function: 'assert_vendor_payment_allocation',
  });
  pgm.createTrigger('material_purchase_payments', 'trg_matpurpay_vendor_payment_alloc', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    level: 'ROW',
    function: 'assert_vendor_payment_allocation',
  });

  // A bill holding bulk-payment money cannot be moved to another vendor —
  // the allocation would then settle the wrong vendor's account.
  pgm.createFunction(
    'assert_bill_vendor_unchanged_when_allocated',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    DECLARE
      v_allocated boolean;
    BEGIN
      IF NEW.vendor_id IS NOT DISTINCT FROM OLD.vendor_id THEN
        RETURN NEW;
      END IF;

      IF TG_TABLE_NAME = 'seed_purchases' THEN
        SELECT EXISTS (SELECT 1 FROM seed_purchase_payments
                       WHERE seed_purchase_id = NEW.id AND vendor_payment_id IS NOT NULL)
          INTO v_allocated;
      ELSE
        SELECT EXISTS (SELECT 1 FROM material_purchase_payments
                       WHERE material_purchase_id = NEW.id AND vendor_payment_id IS NOT NULL)
          INTO v_allocated;
      END IF;

      IF v_allocated THEN
        RAISE EXCEPTION 'Bill % has vendor payment allocations; its vendor cannot be changed', NEW.id;
      END IF;
      RETURN NEW;
    END;
    `
  );
  pgm.createTrigger('seed_purchases', 'trg_sp_vendor_locked_when_allocated', {
    when: 'BEFORE',
    operation: 'UPDATE OF vendor_id',
    level: 'ROW',
    function: 'assert_bill_vendor_unchanged_when_allocated',
  });
  pgm.createTrigger('material_purchases', 'trg_mp_vendor_locked_when_allocated', {
    when: 'BEFORE',
    operation: 'UPDATE OF vendor_id',
    level: 'ROW',
    function: 'assert_bill_vendor_unchanged_when_allocated',
  });

  pgm.sql(SEED_STATUS_FN_NEW);
};

exports.down = (pgm) => {
  pgm.sql(SEED_STATUS_FN_OLD);

  pgm.dropTrigger('material_purchases', 'trg_mp_vendor_locked_when_allocated', { ifExists: true });
  pgm.dropTrigger('seed_purchases', 'trg_sp_vendor_locked_when_allocated', { ifExists: true });
  pgm.dropFunction('assert_bill_vendor_unchanged_when_allocated', [], { ifExists: true });

  pgm.dropTrigger('material_purchase_payments', 'trg_matpurpay_vendor_payment_alloc', { ifExists: true });
  pgm.dropTrigger('seed_purchase_payments', 'trg_spp_vendor_payment_alloc', { ifExists: true });
  pgm.dropFunction('assert_vendor_payment_allocation', [], { ifExists: true });

  pgm.dropColumns('material_purchase_payments', ['vendor_payment_id'], { ifExists: true });
  pgm.dropColumns('seed_purchase_payments', ['vendor_payment_id'], { ifExists: true });

  pgm.dropTable('vendor_payments', { ifExists: true, cascade: true });
  // Ledger enum values intentionally left in place — dropping an enum value on
  // a live table is unsafe, and an unused value is harmless.
};
