/* eslint-disable camelcase */

/**
 * Migration: Supplies & Materials purchases (cocopeat, fertilizer, trays, …)
 *
 * A lightweight vendor-payables register for non-seed supplies. Unlike the
 * Expenses module (which assumes money leaves the account immediately), a
 * material purchase is a PAYABLE: creating it records what you owe the vendor,
 * and money moves only when you record payment tranches against it.
 *
 * Money model (error-free / self-reconciling, mirrors the accounting suite):
 *   - Creating a purchase posts NOTHING to any ledger — it is a payable.
 *   - Each tranche in material_purchase_payments picks exactly ONE source
 *     (cash or a bank account); the application layer atomically posts a
 *     matching DEBIT to that ledger with source_type = 'material_purchase'.
 *   - A DB trigger keeps material_purchases.amount_paid / payment_status in
 *     sync with the sum of its tranches (pending → partial → paid).
 *
 * Purely additive — no existing table/enum is altered. Reuses the existing
 * purchase_payment_status_enum (pending/partial/paid) and
 * expense_payment_source_enum (cash/bank).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── material_purchases ───────────────────────────────────────────────────────
  pgm.createTable('material_purchases', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    purchase_number: { type: 'varchar(30)', notNull: true, unique: true, comment: 'SUP-YYYYMMDD-XXXX' },
    purchase_date: { type: 'date', notNull: true },
    financial_year: { type: 'varchar(7)', notNull: true, comment: 'e.g. "2026-27" (set by app, April–March cycle)' },
    vendor_id: { type: 'uuid', notNull: true, references: 'vendors', onDelete: 'RESTRICT' },
    category_id: {
      type: 'uuid',
      references: 'expense_categories',
      onDelete: 'SET NULL',
      comment: 'Material type — reuses the expense category master (Cocopeat, Fertilizer, …)',
    },
    item_description: { type: 'varchar(300)', comment: 'What was bought, e.g. "Cocopeat 5kg blocks"' },
    quantity: { type: 'numeric(12,2)', comment: 'Optional — informational' },
    unit: { type: 'varchar(30)', comment: 'Optional — e.g. bags, kg, litre' },
    rate: { type: 'numeric(12,2)', comment: 'Optional — price per unit' },
    amount: { type: 'numeric(14,2)', notNull: true, comment: 'Base subtotal (excl. tax)' },
    tax_amount: { type: 'numeric(14,2)', notNull: true, default: 0 },
    other_charges: { type: 'numeric(14,2)', notNull: true, default: 0 },
    grand_total: { type: 'numeric(14,2)', comment: 'Computed by trigger = amount + tax + other_charges' },
    amount_paid: { type: 'numeric(14,2)', notNull: true, default: 0, comment: 'Computed by payment trigger' },
    payment_status: { type: 'purchase_payment_status_enum', notNull: true, default: 'pending' },
    invoice_number: { type: 'varchar(100)' },
    invoice_date: { type: 'date' },
    due_date: { type: 'date' },
    notes: { type: 'text' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('material_purchases', 'vendor_id', { name: 'idx_matpur_vendor' });
  pgm.createIndex('material_purchases', 'category_id', { name: 'idx_matpur_category', where: 'category_id IS NOT NULL' });
  pgm.createIndex('material_purchases', 'purchase_date', { name: 'idx_matpur_date' });
  pgm.createIndex('material_purchases', 'payment_status', { name: 'idx_matpur_pay_status' });
  pgm.createIndex('material_purchases', 'financial_year', { name: 'idx_matpur_fy' });
  pgm.createIndex('material_purchases', 'deleted_at', { name: 'idx_matpur_deleted_at', where: 'deleted_at IS NULL' });

  pgm.addConstraint('material_purchases', 'chk_matpur_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('material_purchases', 'chk_matpur_tax_nonneg', { check: 'tax_amount >= 0' });
  pgm.addConstraint('material_purchases', 'chk_matpur_other_nonneg', { check: 'other_charges >= 0' });

  // grand_total is always derived from amount + tax + other_charges.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_material_purchase_fields()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.grand_total := NEW.amount + COALESCE(NEW.tax_amount, 0) + COALESCE(NEW.other_charges, 0);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('material_purchases', 'trg_matpur_calculate_fields', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_material_purchase_fields',
    level: 'ROW',
  });

  pgm.createTrigger('material_purchases', 'trg_matpur_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // ── material_purchase_payments (tranches) ────────────────────────────────────
  pgm.createTable('material_purchase_payments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    material_purchase_id: { type: 'uuid', notNull: true, references: 'material_purchases', onDelete: 'CASCADE' },
    payment_date: { type: 'date', notNull: true },
    amount: { type: 'numeric(14,2)', notNull: true },
    payment_source: { type: 'expense_payment_source_enum', notNull: true },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    reference_number: { type: 'varchar(100)' },
    notes: { type: 'text' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('material_purchase_payments', 'material_purchase_id', { name: 'idx_matpurpay_purchase' });
  pgm.createIndex('material_purchase_payments', 'payment_date', { name: 'idx_matpurpay_date' });

  pgm.addConstraint('material_purchase_payments', 'chk_matpurpay_amount_positive', { check: 'amount > 0' });

  // Exactly one payment source, consistent with payment_source.
  pgm.addConstraint('material_purchase_payments', 'chk_matpurpay_source_consistency', {
    check: `
      (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR
      (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  // Keep the parent purchase's amount_paid / payment_status in sync.
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

  pgm.createTrigger('material_purchase_payments', 'trg_matpurpay_status_after_insert', {
    when: 'AFTER', operation: 'INSERT', function: 'update_material_purchase_payment_status', level: 'ROW',
  });
  pgm.createTrigger('material_purchase_payments', 'trg_matpurpay_status_after_update', {
    when: 'AFTER', operation: 'UPDATE', function: 'update_material_purchase_payment_status', level: 'ROW',
  });
  pgm.createTrigger('material_purchase_payments', 'trg_matpurpay_status_after_delete', {
    when: 'AFTER', operation: 'DELETE', function: 'update_material_purchase_payment_status', level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('material_purchase_payments', 'trg_matpurpay_status_after_delete', { ifExists: true });
  pgm.dropTrigger('material_purchase_payments', 'trg_matpurpay_status_after_update', { ifExists: true });
  pgm.dropTrigger('material_purchase_payments', 'trg_matpurpay_status_after_insert', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_material_purchase_payment_status()');
  pgm.dropTable('material_purchase_payments', { ifExists: true, cascade: true });

  pgm.dropTrigger('material_purchases', 'trg_matpur_updated_at', { ifExists: true });
  pgm.dropTrigger('material_purchases', 'trg_matpur_calculate_fields', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS calculate_material_purchase_fields()');
  pgm.dropTable('material_purchases', { ifExists: true, cascade: true });
};
