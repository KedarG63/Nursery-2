/* eslint-disable camelcase */

/**
 * Migration: Create credit_transactions table
 * Issue: #21 - Create customer credit management table
 * Description: Track all credit transactions history with audit trail
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create credit_transaction_type enum
  pgm.createType('credit_transaction_type_enum', [
    'order_created',
    'order_cancelled',
    'payment_received',
    'credit_adjustment',
    'credit_limit_change'
  ]);

  // Create credit_transactions table
  pgm.createTable('credit_transactions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'CASCADE'
    },
    transaction_type: {
      type: 'credit_transaction_type_enum',
      notNull: true
    },
    amount: {
      type: 'decimal(12,2)',
      notNull: true
    },
    balance_after: {
      type: 'decimal(12,2)',
      notNull: true
    },
    reference_type: {
      type: 'varchar(50)'
    },
    reference_id: {
      type: 'uuid'
    },
    description: {
      type: 'text'
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    }
  });

  // Create indexes
  pgm.createIndex('credit_transactions', 'customer_id', {
    name: 'idx_credit_transactions_customer_id'
  });

  pgm.createIndex('credit_transactions', 'created_at', {
    name: 'idx_credit_transactions_created_at',
    method: 'btree',
    order: 'DESC'
  });

  pgm.createIndex('credit_transactions', 'transaction_type', {
    name: 'idx_credit_transactions_type'
  });

  pgm.createIndex('credit_transactions', ['reference_type', 'reference_id'], {
    name: 'idx_credit_transactions_reference'
  });

  // Add constraint
  pgm.addConstraint('credit_transactions', 'chk_amount_not_zero', {
    check: 'amount != 0'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE credit_transactions IS 'Complete audit trail of all credit transactions';
    COMMENT ON COLUMN credit_transactions.amount IS 'Transaction amount (positive for credit used, negative for credit released)';
    COMMENT ON COLUMN credit_transactions.balance_after IS 'Credit used balance after this transaction';
    COMMENT ON COLUMN credit_transactions.reference_type IS 'Related entity type (e.g., orders, payments)';
    COMMENT ON COLUMN credit_transactions.reference_id IS 'Related entity UUID';
  `);
};

exports.down = (pgm) => {
  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('credit_transactions', { ifExists: true, cascade: true });

  // Drop enum
  pgm.dropType('credit_transaction_type_enum', { ifExists: true });
};
