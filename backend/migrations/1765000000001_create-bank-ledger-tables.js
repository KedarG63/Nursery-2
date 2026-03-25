/* eslint-disable camelcase */

/**
 * Migration: Bank Accounts and Bank Ledger Entries
 *
 * Provides a simple Tally-style ledger for the business's bank accounts.
 * Supports:
 *   - Up to 3 bank accounts
 *   - Opening balance per account per financial year (April 1 start)
 *   - Manual debit/credit entries by Admin/Manager
 *   - Auto-sync from existing payments (customer receipts) and
 *     seed_purchase_payments (vendor debits) via application logic
 *   - Running balance computed dynamically (never stored)
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── ENUMs ──────────────────────────────────────────────────────────────────
  pgm.createType('bank_ledger_entry_type_enum', [
    'opening_balance',
    'credit',   // money received into the account
    'debit',    // money sent out of the account
  ]);

  pgm.createType('bank_ledger_source_type_enum', [
    'manual',
    'customer_payment',
    'vendor_payment',
  ]);

  // ── bank_accounts ──────────────────────────────────────────────────────────
  pgm.createTable('bank_accounts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    account_name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name, e.g. "HDFC Current Account"',
    },
    bank_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    account_number: {
      type: 'varchar(30)',
      notNull: true,
      unique: true,
    },
    ifsc_code: {
      type: 'varchar(20)',
    },
    branch: {
      type: 'varchar(100)',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    sort_order: {
      type: 'smallint',
      notNull: true,
      default: 0,
      comment: 'Controls display order of accounts (1, 2, 3)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('bank_accounts', 'is_active', { name: 'idx_bank_accounts_active' });

  pgm.createTrigger('bank_accounts', 'update_bank_accounts_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Seed 3 placeholder accounts — Admin can edit names/details via the UI
  pgm.sql(`
    INSERT INTO bank_accounts (account_name, bank_name, account_number, sort_order)
    VALUES
      ('Bank Account 1', 'Bank Name', 'ACCOUNT-001', 1),
      ('Bank Account 2', 'Bank Name', 'ACCOUNT-002', 2),
      ('Bank Account 3', 'Bank Name', 'ACCOUNT-003', 3);
  `);

  // ── bank_ledger_entries ────────────────────────────────────────────────────
  pgm.createTable('bank_ledger_entries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    bank_account_id: {
      type: 'uuid',
      notNull: true,
      references: 'bank_accounts',
      onDelete: 'RESTRICT',
    },
    entry_date: {
      type: 'date',
      notNull: true,
    },
    financial_year: {
      type: 'varchar(7)',
      notNull: true,
      comment: 'e.g. "2025-26". Computed from entry_date (April–March cycle).',
    },
    entry_type: {
      type: 'bank_ledger_entry_type_enum',
      notNull: true,
    },
    amount: {
      type: 'numeric(14,2)',
      notNull: true,
    },
    narration: {
      type: 'varchar(500)',
      comment: 'Description / reason for the transaction',
    },
    party_name: {
      type: 'varchar(200)',
      comment: '"Sent to" or "Received from". Required for non-opening-balance entries.',
    },
    reference_number: {
      type: 'varchar(100)',
      comment: 'Cheque number, UTR, transaction reference, etc.',
    },
    source_type: {
      type: 'bank_ledger_source_type_enum',
      notNull: true,
      default: 'manual',
    },
    source_id: {
      type: 'uuid',
      comment: 'FK to payments.id or seed_purchase_payments.id when auto-synced',
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
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: {
      type: 'timestamptz',
      comment: 'Soft delete — only allowed on manual entries',
    },
  });

  // ── Indexes ────────────────────────────────────────────────────────────────
  pgm.createIndex('bank_ledger_entries', ['bank_account_id', 'entry_date'],
    { name: 'idx_ble_account_date' });

  pgm.createIndex('bank_ledger_entries', ['bank_account_id', 'financial_year'],
    { name: 'idx_ble_account_fy' });

  pgm.createIndex('bank_ledger_entries', ['source_type', 'source_id'],
    { name: 'idx_ble_source', where: 'source_id IS NOT NULL' });

  pgm.createIndex('bank_ledger_entries', 'deleted_at',
    { name: 'idx_ble_deleted_at', where: 'deleted_at IS NULL' });

  // ── Constraints ────────────────────────────────────────────────────────────
  pgm.addConstraint('bank_ledger_entries', 'chk_ble_amount_positive', {
    check: 'amount > 0',
  });

  // party_name required for all non-opening-balance entries
  pgm.addConstraint('bank_ledger_entries', 'chk_ble_party_name_required', {
    check: `entry_type = 'opening_balance' OR party_name IS NOT NULL`,
  });

  // Prevent duplicate auto-sync entries for the same source record
  pgm.addConstraint('bank_ledger_entries', 'uq_ble_source_unique', {
    unique: ['source_type', 'source_id'],
    // partial unique — only enforced when source_id is not null
    // Note: node-pg-migrate doesn't support partial unique constraints directly;
    // we use a unique index instead (see below) and drop this constraint.
  });

  // Drop the full unique and replace with a partial unique index
  pgm.dropConstraint('bank_ledger_entries', 'uq_ble_source_unique');

  pgm.sql(`
    CREATE UNIQUE INDEX uq_ble_source_id
      ON bank_ledger_entries (source_type, source_id)
      WHERE source_id IS NOT NULL AND deleted_at IS NULL;
  `);

  // ── Auto-compute financial_year BEFORE INSERT/UPDATE ──────────────────────
  pgm.createFunction(
    'compute_bank_ledger_financial_year',
    [],
    { returns: 'TRIGGER', language: 'plpgsql', replace: true },
    `
    DECLARE
      yr   INT;
      mon  INT;
    BEGIN
      yr  := EXTRACT(YEAR  FROM NEW.entry_date)::INT;
      mon := EXTRACT(MONTH FROM NEW.entry_date)::INT;
      -- Indian FY: April (4) to March (3)
      IF mon >= 4 THEN
        NEW.financial_year := yr::TEXT || '-' || LPAD(((yr + 1) % 100)::TEXT, 2, '0');
      ELSE
        NEW.financial_year := (yr - 1)::TEXT || '-' || LPAD((yr % 100)::TEXT, 2, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('bank_ledger_entries', 'trg_ble_compute_financial_year', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'compute_bank_ledger_financial_year',
    level: 'ROW',
  });

  // ── updated_at trigger ─────────────────────────────────────────────────────
  pgm.createTrigger('bank_ledger_entries', 'update_bank_ledger_entries_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  // Drop triggers and functions
  pgm.dropTrigger('bank_ledger_entries', 'update_bank_ledger_entries_updated_at', { ifExists: true });
  pgm.dropTrigger('bank_ledger_entries', 'trg_ble_compute_financial_year',        { ifExists: true });
  pgm.dropFunction('compute_bank_ledger_financial_year', [],                       { ifExists: true });

  pgm.dropTrigger('bank_accounts', 'update_bank_accounts_updated_at', { ifExists: true });

  // Drop tables
  pgm.dropTable('bank_ledger_entries', { ifExists: true, cascade: true });
  pgm.dropTable('bank_accounts',       { ifExists: true, cascade: true });

  // Drop ENUMs
  pgm.dropType('bank_ledger_source_type_enum', { ifExists: true });
  pgm.dropType('bank_ledger_entry_type_enum',  { ifExists: true });
};
