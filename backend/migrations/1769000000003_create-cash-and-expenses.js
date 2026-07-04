/* eslint-disable camelcase */

/**
 * Migration: Cash-in-Hand + Expenses + Fund Transfers (Phase 1 of Accounting Suite)
 *
 * Purely additive — creates NEW tables/enums only. No existing object is
 * altered or dropped here (the bank enum extension lives in its own migration).
 *
 * Tables:
 *   - cash_accounts          : cash drawer(s); mirrors bank_accounts
 *   - cash_ledger_entries    : Tally-style cash book; mirrors bank_ledger_entries
 *   - expense_categories     : seeded category master (Transport, Cocopit, ...)
 *   - expenses               : daily expenses; each posts a DEBIT to cash/bank ledger
 *   - fund_transfers         : Cash -> Bank deposits (paired cash debit + bank credit)
 *
 * Error-free design: every expense/transfer selects exactly ONE payment source
 * (enforced by CHECK constraints) and the application layer atomically writes
 * the matching ledger entry so cash & bank balances always self-reconcile.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── ENUMs ──────────────────────────────────────────────────────────────────
  pgm.createType('cash_ledger_entry_type_enum', [
    'opening_balance',
    'credit', // money received into cash
    'debit',  // money paid out of cash
  ]);

  pgm.createType('cash_ledger_source_type_enum', [
    'manual',
    'customer_payment', // reserved for future cash-receipt sync
    'expense',
    'payroll',
    'advance',
    'cash_deposit', // money moved out of cash into bank
  ]);

  pgm.createType('expense_payment_source_enum', ['cash', 'bank']);

  // ── cash_accounts ────────────────────────────────────────────────────────────
  pgm.createTable('cash_accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    account_name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name, e.g. "Main Cash Drawer"',
    },
    is_active: { type: 'boolean', notNull: true, default: true },
    sort_order: { type: 'smallint', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('cash_accounts', 'is_active', { name: 'idx_cash_accounts_active' });

  pgm.createTrigger('cash_accounts', 'update_cash_accounts_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Seed a single default cash drawer — name editable via UI
  pgm.sql(`
    INSERT INTO cash_accounts (account_name, sort_order)
    VALUES ('Main Cash Drawer', 1);
  `);

  // ── cash_ledger_entries (mirrors bank_ledger_entries) ────────────────────────
  pgm.createTable('cash_ledger_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    cash_account_id: {
      type: 'uuid',
      notNull: true,
      references: 'cash_accounts',
      onDelete: 'RESTRICT',
    },
    entry_date: { type: 'date', notNull: true },
    financial_year: {
      type: 'varchar(7)',
      notNull: true,
      comment: 'e.g. "2025-26". Computed from entry_date (April–March cycle).',
    },
    entry_type: { type: 'cash_ledger_entry_type_enum', notNull: true },
    amount: { type: 'numeric(14,2)', notNull: true },
    narration: { type: 'varchar(500)' },
    party_name: {
      type: 'varchar(200)',
      comment: 'Required for non-opening-balance entries',
    },
    reference_number: { type: 'varchar(100)' },
    source_type: {
      type: 'cash_ledger_source_type_enum',
      notNull: true,
      default: 'manual',
    },
    source_id: {
      type: 'uuid',
      comment: 'FK to expenses.id / fund_transfers.id / payroll / advances when auto-posted',
    },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz', comment: 'Soft delete — only on manual entries' },
  });

  pgm.createIndex('cash_ledger_entries', ['cash_account_id', 'entry_date'], { name: 'idx_cle_account_date' });
  pgm.createIndex('cash_ledger_entries', ['cash_account_id', 'financial_year'], { name: 'idx_cle_account_fy' });
  pgm.createIndex('cash_ledger_entries', ['source_type', 'source_id'], { name: 'idx_cle_source', where: 'source_id IS NOT NULL' });
  pgm.createIndex('cash_ledger_entries', 'deleted_at', { name: 'idx_cle_deleted_at', where: 'deleted_at IS NULL' });

  pgm.addConstraint('cash_ledger_entries', 'chk_cle_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('cash_ledger_entries', 'chk_cle_party_name_required', {
    check: `entry_type = 'opening_balance' OR party_name IS NOT NULL`,
  });

  // Partial unique index: prevent duplicate auto-posts for the same source record
  pgm.sql(`
    CREATE UNIQUE INDEX uq_cle_source_id
      ON cash_ledger_entries (source_type, source_id)
      WHERE source_id IS NOT NULL AND deleted_at IS NULL;
  `);

  // Auto-compute financial_year (dedicated function so this migration is
  // independently reversible and does not depend on the bank ledger's function)
  pgm.createFunction(
    'compute_cash_ledger_financial_year',
    [],
    { returns: 'TRIGGER', language: 'plpgsql', replace: true },
    `
    DECLARE
      yr  INT;
      mon INT;
    BEGIN
      yr  := EXTRACT(YEAR  FROM NEW.entry_date)::INT;
      mon := EXTRACT(MONTH FROM NEW.entry_date)::INT;
      IF mon >= 4 THEN
        NEW.financial_year := yr::TEXT || '-' || LPAD(((yr + 1) % 100)::TEXT, 2, '0');
      ELSE
        NEW.financial_year := (yr - 1)::TEXT || '-' || LPAD((yr % 100)::TEXT, 2, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('cash_ledger_entries', 'trg_cle_compute_financial_year', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'compute_cash_ledger_financial_year',
    level: 'ROW',
  });

  pgm.createTrigger('cash_ledger_entries', 'update_cash_ledger_entries_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // ── expense_categories ───────────────────────────────────────────────────────
  pgm.createTable('expense_categories', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    name: { type: 'varchar(100)', notNull: true, unique: true },
    code: { type: 'varchar(30)', comment: 'Optional short code' },
    is_active: { type: 'boolean', notNull: true, default: true },
    sort_order: { type: 'smallint', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTrigger('expense_categories', 'update_expense_categories_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Seed common nursery expense categories (admin can add more via UI)
  pgm.sql(`
    INSERT INTO expense_categories (name, code, sort_order) VALUES
      ('Transport',     'TRANSPORT',  1),
      ('Cocopit',       'COCOPIT',    2),
      ('Tray',          'TRAY',       3),
      ('Pesticide',     'PESTICIDE',  4),
      ('Fertilizer',    'FERTILIZER', 5),
      ('Stationery',    'STATIONERY', 6),
      ('Labour',        'LABOUR',     7),
      ('Utilities',     'UTILITIES',  8),
      ('Miscellaneous', 'MISC',       9)
    ON CONFLICT (name) DO NOTHING;
  `);

  // ── expenses ─────────────────────────────────────────────────────────────────
  pgm.createTable('expenses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    expense_number: { type: 'varchar(30)', notNull: true, unique: true, comment: 'EXP-YYYYMMDD-XXXX' },
    expense_date: { type: 'date', notNull: true },
    financial_year: { type: 'varchar(7)', notNull: true },
    category_id: { type: 'uuid', notNull: true, references: 'expense_categories', onDelete: 'RESTRICT' },
    vendor_id: {
      type: 'uuid',
      references: 'vendors',
      onDelete: 'SET NULL',
      comment: 'Optional — links the expense to a vendor for the vendor 360 view',
    },
    amount: { type: 'numeric(14,2)', notNull: true, comment: 'Base amount (excl. tax)' },
    tax_amount: { type: 'numeric(14,2)', notNull: true, default: 0 },
    description: { type: 'varchar(500)' },
    payment_source: { type: 'expense_payment_source_enum', notNull: true },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    attachment_url: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('expenses', 'expense_date', { name: 'idx_expenses_date' });
  pgm.createIndex('expenses', 'category_id', { name: 'idx_expenses_category' });
  pgm.createIndex('expenses', 'vendor_id', { name: 'idx_expenses_vendor', where: 'vendor_id IS NOT NULL' });
  pgm.createIndex('expenses', 'financial_year', { name: 'idx_expenses_fy' });
  pgm.createIndex('expenses', 'deleted_at', { name: 'idx_expenses_deleted_at', where: 'deleted_at IS NULL' });

  pgm.addConstraint('expenses', 'chk_expenses_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('expenses', 'chk_expenses_tax_nonneg', { check: 'tax_amount >= 0' });

  // Exactly one payment source must be set, consistent with payment_source.
  pgm.addConstraint('expenses', 'chk_expenses_source_consistency', {
    check: `
      (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR
      (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  pgm.createTrigger('expenses', 'update_expenses_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // ── fund_transfers (Cash -> Bank deposits) ───────────────────────────────────
  pgm.createTable('fund_transfers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    transfer_number: { type: 'varchar(30)', notNull: true, unique: true, comment: 'DEP-YYYYMMDD-XXXX' },
    transfer_date: { type: 'date', notNull: true },
    financial_year: { type: 'varchar(7)', notNull: true },
    from_cash_account_id: { type: 'uuid', notNull: true, references: 'cash_accounts', onDelete: 'RESTRICT' },
    to_bank_account_id: { type: 'uuid', notNull: true, references: 'bank_accounts', onDelete: 'RESTRICT' },
    amount: { type: 'numeric(14,2)', notNull: true },
    reference_number: { type: 'varchar(100)', comment: 'Deposit slip / UTR' },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('fund_transfers', 'transfer_date', { name: 'idx_fund_transfers_date' });
  pgm.createIndex('fund_transfers', 'deleted_at', { name: 'idx_fund_transfers_deleted_at', where: 'deleted_at IS NULL' });

  pgm.addConstraint('fund_transfers', 'chk_fund_transfers_amount_positive', { check: 'amount > 0' });

  pgm.createTrigger('fund_transfers', 'update_fund_transfers_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  // Drop in reverse dependency order. cascade clears FKs/indexes/triggers.
  pgm.dropTable('fund_transfers', { ifExists: true, cascade: true });
  pgm.dropTable('expenses', { ifExists: true, cascade: true });
  pgm.dropTable('expense_categories', { ifExists: true, cascade: true });

  pgm.dropTrigger('cash_ledger_entries', 'trg_cle_compute_financial_year', { ifExists: true });
  pgm.dropTrigger('cash_ledger_entries', 'update_cash_ledger_entries_updated_at', { ifExists: true });
  pgm.dropTable('cash_ledger_entries', { ifExists: true, cascade: true });
  pgm.dropFunction('compute_cash_ledger_financial_year', [], { ifExists: true });

  pgm.dropTrigger('cash_accounts', 'update_cash_accounts_updated_at', { ifExists: true });
  pgm.dropTable('cash_accounts', { ifExists: true, cascade: true });

  pgm.dropType('expense_payment_source_enum', { ifExists: true });
  pgm.dropType('cash_ledger_source_type_enum', { ifExists: true });
  pgm.dropType('cash_ledger_entry_type_enum', { ifExists: true });
};
