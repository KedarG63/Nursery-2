/* eslint-disable camelcase */

/**
 * Migration: add payments.cash_account_id (nullable).
 *
 * Customer payments received in cash need to know WHICH cash drawer they
 * landed in, so the payment can post a matching credit to that Cash Book
 * (Phase 2 of the walk-in plan). `payments` already has bank_account_id for
 * the bank side; this adds the cash-side equivalent.
 *
 * Purely additive: a single nullable column with an FK to cash_accounts.
 * No data change, no backfill for the column itself. Existing rows keep NULL.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('payments', {
    cash_account_id: {
      type: 'uuid',
      references: 'cash_accounts',
      onDelete: 'RESTRICT',
      comment: 'Cash drawer a cash payment was received into (Cash Book posting)',
    },
  });
  pgm.createIndex('payments', 'cash_account_id', {
    name: 'idx_payments_cash_account',
    where: 'cash_account_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('payments', 'cash_account_id', { name: 'idx_payments_cash_account', ifExists: true });
  pgm.dropColumn('payments', 'cash_account_id', { ifExists: true });
};
