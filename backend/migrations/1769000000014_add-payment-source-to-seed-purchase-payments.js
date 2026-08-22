/* eslint-disable camelcase */

/**
 * Migration: record WHICH account paid a vendor.
 *
 * `seed_purchase_payments` (behind both Vendor Bills and Purchases) had no
 * bank_account_id / cash_account_id / payment_source, so there was nowhere to
 * say where the money came from, and neither writer posted a ledger debit. The
 * only way a vendor payment reached the Bank Ledger was the debit half of
 * syncFromPayments, which had no account filter and therefore debited EVERY
 * bank/cheque vendor payment to whichever account happened to be synced.
 *
 * This mirrors `material_purchase_payments` (the later Supplies module), which
 * already models this correctly.
 *
 * Safety / compatibility:
 *   - Purely additive: three nullable columns + one enum value. No data rewritten.
 *   - Existing rows keep payment_source = NULL, meaning "legacy, account
 *     unknown". The CHECK only constrains rows that DO set a source, so nothing
 *     historical can violate it.
 *   - `vendor_payment` is added to cash_ledger_source_type_enum because it was
 *     missing: bank_ledger_source_type_enum has had it since the ledger was
 *     created, but paying a vendor in CASH would have failed on an invalid enum
 *     value. addTypeValue with ifNotExists keeps this re-runnable.
 *   - Enum values cannot be dropped safely on a live table, so `down` leaves it
 *     in place (harmless when unused) and only removes the columns.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Cash-side vendor payouts need this source type; the bank side already has it.
  pgm.addTypeValue('cash_ledger_source_type_enum', 'vendor_payment', { ifNotExists: true });

  pgm.addColumns('seed_purchase_payments', {
    payment_source: {
      type: 'expense_payment_source_enum',
      comment: 'cash | bank. NULL = legacy row recorded before the account was tracked.',
    },
    bank_account_id: {
      type: 'uuid',
      references: 'bank_accounts',
      onDelete: 'RESTRICT',
    },
    cash_account_id: {
      type: 'uuid',
      references: 'cash_accounts',
      onDelete: 'RESTRICT',
    },
  }, { ifNotExists: true });

  // Exactly one account, consistent with payment_source — but only for rows
  // that declare a source, so pre-existing rows remain valid.
  pgm.addConstraint('seed_purchase_payments', 'chk_spp_source_consistency', {
    check: `
      payment_source IS NULL
      OR (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  pgm.createIndex('seed_purchase_payments', 'bank_account_id', {
    name: 'idx_spp_bank_account',
    where: 'bank_account_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('seed_purchase_payments', 'bank_account_id', { name: 'idx_spp_bank_account', ifExists: true });
  pgm.dropConstraint('seed_purchase_payments', 'chk_spp_source_consistency', { ifExists: true });
  pgm.dropColumns('seed_purchase_payments', ['payment_source', 'bank_account_id', 'cash_account_id'], { ifExists: true });
  // cash_ledger_source_type_enum keeps 'vendor_payment' — dropping an enum value
  // on a live table is unsafe, and an unused value is harmless.
};
