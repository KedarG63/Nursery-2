/* eslint-disable camelcase */

/**
 * Migration: Create invoices and invoice_items tables
 * Phase 23: Billing & Accounting
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create invoice status enum
  pgm.createType('invoice_status_enum', ['draft', 'issued', 'partially_paid', 'paid', 'void']);

  // Create sequence for race-condition-safe invoice number generation
  pgm.sql(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1`);

  // Function: generate invoice number (INV-YYYY-XXXX)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_invoice_number()
    RETURNS TRIGGER AS $$
    DECLARE
      v_year TEXT;
      v_seq  BIGINT;
    BEGIN
      v_year := TO_CHAR(NOW(), 'YYYY');
      v_seq  := nextval('invoice_number_seq');
      NEW.invoice_number := 'INV-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: compute invoice item line_total and tax_amount
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_invoice_item_totals()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.line_total  := (NEW.quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);
      NEW.tax_amount  := ROUND(NEW.line_total * NEW.tax_rate / 100, 2);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: recompute invoice header totals after any item change
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_invoice_totals_from_items()
    RETURNS TRIGGER AS $$
    DECLARE
      v_invoice_id UUID;
      v_subtotal   DECIMAL(12,2);
      v_tax        DECIMAL(12,2);
    BEGIN
      v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

      SELECT
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(SUM(tax_amount), 0)
      INTO v_subtotal, v_tax
      FROM invoice_items
      WHERE invoice_id = v_invoice_id;

      UPDATE invoices
      SET
        subtotal_amount = v_subtotal,
        tax_amount      = v_tax,
        total_amount    = v_subtotal - COALESCE(discount_amount, 0) + v_tax,
        balance_amount  = (v_subtotal - COALESCE(discount_amount, 0) + v_tax) - paid_amount,
        updated_at      = NOW()
      WHERE id = v_invoice_id;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create invoices table
  pgm.createTable('invoices', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    invoice_number: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    order_id: {
      type: 'uuid',
      references: 'orders',
      onDelete: 'RESTRICT',
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT',
    },
    invoice_date: {
      type: 'date',
      notNull: true,
      default: pgm.func('CURRENT_DATE'),
    },
    due_date: {
      type: 'date',
      notNull: true,
    },
    status: {
      type: 'invoice_status_enum',
      notNull: true,
      default: 'draft',
    },
    subtotal_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
    },
    discount_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0,
    },
    tax_rate: {
      type: 'decimal(5,2)',
      notNull: true,
      default: 0.00,
    },
    tax_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0,
    },
    total_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
    },
    paid_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
    },
    balance_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
    },
    terms_and_conditions: {
      type: 'text',
    },
    notes: {
      type: 'text',
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: {
      type: 'timestamp',
    },
  });

  // Constraints on invoices
  pgm.addConstraint('invoices', 'chk_invoice_subtotal_positive', { check: 'subtotal_amount >= 0' });
  pgm.addConstraint('invoices', 'chk_invoice_discount_positive', { check: 'discount_amount >= 0' });
  pgm.addConstraint('invoices', 'chk_invoice_tax_rate_valid',    { check: 'tax_rate >= 0 AND tax_rate <= 100' });
  pgm.addConstraint('invoices', 'chk_invoice_tax_positive',      { check: 'tax_amount >= 0' });
  pgm.addConstraint('invoices', 'chk_invoice_total_positive',    { check: 'total_amount >= 0' });
  pgm.addConstraint('invoices', 'chk_invoice_paid_positive',     { check: 'paid_amount >= 0' });
  pgm.addConstraint('invoices', 'chk_invoice_due_date',          { check: 'due_date >= invoice_date' });
  pgm.addConstraint('invoices', 'chk_invoice_paid_valid',        { check: 'paid_amount <= total_amount' });

  // Triggers on invoices
  pgm.createTrigger('invoices', 'set_invoice_number', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_invoice_number',
    level: 'ROW',
  });

  pgm.createTrigger('invoices', 'update_invoices_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Indexes on invoices
  pgm.createIndex('invoices', 'customer_id');
  pgm.createIndex('invoices', 'order_id');
  pgm.createIndex('invoices', 'status');
  pgm.createIndex('invoices', 'invoice_date');
  pgm.createIndex('invoices', 'due_date');
  pgm.createIndex('invoices', 'invoice_number');
  pgm.createIndex('invoices', 'deleted_at');
  pgm.createIndex('invoices', ['customer_id', 'status'], { name: 'idx_invoices_customer_status' });

  // -------------------------------------------------------------------------
  // invoice_items table
  // -------------------------------------------------------------------------
  pgm.createTable('invoice_items', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    invoice_id: {
      type: 'uuid',
      notNull: true,
      references: 'invoices',
      onDelete: 'CASCADE',
    },
    order_item_id: {
      type: 'uuid',
      references: 'order_items',
      onDelete: 'SET NULL',
    },
    description: {
      type: 'varchar(255)',
      notNull: true,
    },
    sku_id: {
      type: 'uuid',
      references: 'skus',
      onDelete: 'SET NULL',
    },
    quantity: {
      type: 'integer',
      notNull: true,
    },
    unit_price: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    discount_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0,
    },
    line_total: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
    },
    tax_rate: {
      type: 'decimal(5,2)',
      notNull: true,
      default: 0,
    },
    tax_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0,
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Constraints on invoice_items
  pgm.addConstraint('invoice_items', 'chk_item_quantity_positive',  { check: 'quantity > 0' });
  pgm.addConstraint('invoice_items', 'chk_item_unit_price_valid',   { check: 'unit_price >= 0' });
  pgm.addConstraint('invoice_items', 'chk_item_discount_valid',     { check: 'discount_amount >= 0' });
  pgm.addConstraint('invoice_items', 'chk_item_tax_rate_valid',     { check: 'tax_rate >= 0 AND tax_rate <= 100' });

  // Triggers on invoice_items
  pgm.createTrigger('invoice_items', 'set_invoice_item_totals', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_invoice_item_totals',
    level: 'ROW',
  });

  pgm.createTrigger('invoice_items', 'sync_invoice_totals', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    function: 'update_invoice_totals_from_items',
    level: 'ROW',
  });

  pgm.createTrigger('invoice_items', 'update_invoice_items_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Indexes on invoice_items
  pgm.createIndex('invoice_items', 'invoice_id');
  pgm.createIndex('invoice_items', 'sku_id');
  pgm.createIndex('invoice_items', 'order_item_id');
};

exports.down = (pgm) => {
  // Drop invoice_items first (child)
  pgm.dropTrigger('invoice_items', 'update_invoice_items_updated_at', { ifExists: true });
  pgm.dropTrigger('invoice_items', 'sync_invoice_totals',             { ifExists: true });
  pgm.dropTrigger('invoice_items', 'set_invoice_item_totals',         { ifExists: true });
  pgm.dropTable('invoice_items', { ifExists: true, cascade: true });

  // Drop invoices
  pgm.dropTrigger('invoices', 'update_invoices_updated_at', { ifExists: true });
  pgm.dropTrigger('invoices', 'set_invoice_number',         { ifExists: true });
  pgm.dropTable('invoices', { ifExists: true, cascade: true });

  // Drop functions
  pgm.sql('DROP FUNCTION IF EXISTS update_invoice_totals_from_items()');
  pgm.sql('DROP FUNCTION IF EXISTS calculate_invoice_item_totals()');
  pgm.sql('DROP FUNCTION IF EXISTS generate_invoice_number()');

  // Drop sequence
  pgm.sql('DROP SEQUENCE IF EXISTS invoice_number_seq');

  // Drop enum
  pgm.dropType('invoice_status_enum', { ifExists: true });
};
