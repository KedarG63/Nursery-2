/**
 * Migration: Add bank_account_id to payments table
 * Allows linking a payment to a specific bank account from the bank ledger.
 */

exports.up = (pgm) => {
  pgm.addColumn('payments', {
    bank_account_id: {
      type: 'uuid',
      references: 'bank_accounts',
      onDelete: 'SET NULL',
      notNull: false,
    },
  });

  pgm.createIndex('payments', 'bank_account_id', {
    name: 'idx_payments_bank_account_id',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('payments', 'bank_account_id', {
    name: 'idx_payments_bank_account_id',
    ifExists: true,
  });
  pgm.dropColumn('payments', 'bank_account_id');
};
