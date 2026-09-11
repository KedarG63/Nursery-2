/* eslint-disable camelcase */

/**
 * Migration: record WHICH account a service-order payment landed in.
 *
 * Service orders keep their money in `service_order_payments`, a table entirely
 * separate from `payments`. Every ledger posting in the accounting suite runs
 * off `payments` via postCustomerPaymentToLedger, so service collections never
 * reached the Cash Book or any Bank Ledger — and there was nowhere to record
 * the account even if they had. Service REVENUE was still recognised (the P&L
 * reads SUM(service_fee) on order_date), so the books showed the income while
 * the cash and bank balances were understated by every rupee collected.
 *
 * Same shape as migration 1769000000014 did for seed_purchase_payments.
 *
 * A dedicated `service_payment` source type is added rather than reusing
 * `customer_payment`: the ledgers carry a partial unique index on
 * (source_type, source_id), and reusing customer_payment would put
 * service_order_payments.id in the same namespace as payments.id — wrong
 * semantically, and it would make the two indistinguishable in reports.
 *
 * Safety:
 *   - Purely additive: three nullable columns + two enum values. No data rewritten.
 *   - Existing rows keep payment_source = NULL, meaning "legacy, account
 *     unknown". The CHECK only constrains rows that DO set a source, so nothing
 *     historical can violate it.
 *   - Enum values cannot be dropped safely on a live table, so `down` leaves
 *     them in place (harmless when unused) and only removes the columns.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Money received into a bank account or the cash drawer needs its own source
  // type on BOTH ledgers.
  pgm.addTypeValue('bank_ledger_source_type_enum', 'service_payment', { ifNotExists: true });
  pgm.addTypeValue('cash_ledger_source_type_enum', 'service_payment', { ifNotExists: true });

  pgm.addColumns('service_order_payments', {
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
  pgm.addConstraint('service_order_payments', 'chk_sop_source_consistency', {
    check: `
      payment_source IS NULL
      OR (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  pgm.createIndex('service_order_payments', 'bank_account_id', {
    name: 'idx_sop_bank_account',
    where: 'bank_account_id IS NOT NULL',
  });
  pgm.createIndex('service_order_payments', 'cash_account_id', {
    name: 'idx_sop_cash_account',
    where: 'cash_account_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('service_order_payments', 'cash_account_id', { name: 'idx_sop_cash_account', ifExists: true });
  pgm.dropIndex('service_order_payments', 'bank_account_id', { name: 'idx_sop_bank_account', ifExists: true });
  pgm.dropConstraint('service_order_payments', 'chk_sop_source_consistency', { ifExists: true });
  pgm.dropColumns('service_order_payments', ['payment_source', 'bank_account_id', 'cash_account_id'], { ifExists: true });
  // The ledger enums keep 'service_payment' — dropping an enum value on a live
  // table is unsafe, and an unused value is harmless.
};
