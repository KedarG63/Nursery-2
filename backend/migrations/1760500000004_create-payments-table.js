/* eslint-disable camelcase */

/**
 * Migration: Create Payments Table
 * Creates the payments table with enums, indexes, constraints, triggers
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create payment_method enum
  pgm.createType('payment_method_enum', [
    'cash',
    'card',
    'upi',
    'bank_transfer',
    'credit',
    'cod',
  ]);

  // Create payment_status enum
  pgm.createType('payment_status_enum', [
    'pending',
    'processing',
    'success',
    'failed',
    'refunded',
    'cancelled',
  ]);

  // Create payment_gateway enum
  pgm.createType('payment_gateway_enum', [
    'mock',
    'razorpay',
    'payu',
    'cashfree',
    'manual',
  ]);

  // Create payments table
  pgm.createTable('payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },

    // References
    order_id: {
      type: 'uuid',
      notNull: true,
      references: 'orders',
      onDelete: 'RESTRICT',
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT',
    },

    // Payment details
    payment_method: {
      type: 'payment_method_enum',
      notNull: true,
    },
    payment_gateway: {
      type: 'payment_gateway_enum',
      notNull: true,
    },
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    currency: {
      type: 'varchar(3)',
      notNull: true,
      default: 'INR',
    },

    // Transaction tracking
    transaction_id: {
      type: 'varchar(255)',
      unique: true,
    },
    gateway_transaction_id: {
      type: 'varchar(255)',
    },
    gateway_order_id: {
      type: 'varchar(255)',
    },

    // Status tracking
    status: {
      type: 'payment_status_enum',
      notNull: true,
      default: 'pending',
    },
    payment_date: {
      type: 'timestamp',
    },

    // Gateway response (for debugging and reconciliation)
    gateway_response: {
      type: 'jsonb',
    },
    gateway_error_code: {
      type: 'varchar(100)',
    },
    gateway_error_message: {
      type: 'text',
    },

    // Offline payment details
    received_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    receipt_number: {
      type: 'varchar(100)',
    },

    // Refund tracking
    refund_amount: {
      type: 'decimal(12,2)',
      default: 0.0,
    },
    refunded_at: {
      type: 'timestamp',
    },
    refund_reference: {
      type: 'varchar(255)',
    },
    refund_reason: {
      type: 'text',
    },

    // Metadata
    notes: {
      type: 'text',
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },

    // Audit fields
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

  // Create indexes
  pgm.createIndex('payments', 'order_id', { name: 'idx_payments_order_id' });
  pgm.createIndex('payments', 'customer_id', {
    name: 'idx_payments_customer_id',
  });
  pgm.createIndex('payments', 'status', { name: 'idx_payments_status' });
  pgm.createIndex('payments', 'payment_date', {
    name: 'idx_payments_payment_date',
  });
  pgm.createIndex('payments', 'transaction_id', {
    name: 'idx_payments_transaction_id',
  });
  pgm.createIndex('payments', 'gateway_transaction_id', {
    name: 'idx_payments_gateway_transaction_id',
  });
  pgm.createIndex('payments', 'deleted_at', {
    name: 'idx_payments_deleted_at',
    where: 'deleted_at IS NULL',
  });

  // Composite indexes for common queries
  pgm.createIndex('payments', ['customer_id', 'status'], {
    name: 'idx_payments_customer_status',
  });
  pgm.createIndex('payments', ['order_id', 'status'], {
    name: 'idx_payments_order_status',
  });
  pgm.createIndex('payments', ['payment_date', 'status'], {
    name: 'idx_payments_date_status',
  });

  // Add constraints
  pgm.addConstraint('payments', 'chk_amount_positive', {
    check: 'amount > 0',
  });

  pgm.addConstraint('payments', 'chk_refund_amount_valid', {
    check: 'refund_amount >= 0 AND refund_amount <= amount',
  });

  pgm.addConstraint('payments', 'chk_currency_valid', {
    check: "currency IN ('INR', 'USD', 'EUR')",
  });

  pgm.addConstraint('payments', 'chk_gateway_transaction_for_online', {
    check:
      "payment_method IN ('cash', 'credit') OR gateway_transaction_id IS NOT NULL",
  });

  // Create sequence for transaction ID
  pgm.createSequence('payment_txn_seq', {
    increment: 1,
    minvalue: 1,
    maxvalue: 999999,
    start: 1,
    cycle: true,
  });

  // Create function to auto-generate transaction ID
  pgm.createFunction(
    'generate_transaction_id',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.transaction_id IS NULL THEN
        NEW.transaction_id := 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                              LPAD(nextval('payment_txn_seq')::TEXT, 6, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger to set transaction ID
  pgm.createTrigger('payments', 'set_transaction_id', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_transaction_id',
    level: 'ROW',
  });

  // Create trigger to auto-update updated_at
  pgm.createTrigger('payments', 'update_payments_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Create function to update order paid_amount
  pgm.createFunction(
    'update_order_paid_amount',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      -- Only update on status change to success
      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = paid_amount + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.order_id;
      END IF;

      -- Handle refunds
      IF NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        UPDATE orders
        SET paid_amount = paid_amount - NEW.refund_amount,
            updated_at = NOW()
        WHERE id = NEW.order_id;
      END IF;

      RETURN NEW;
    END;
    `
  );

  // Create trigger to update order paid_amount
  pgm.createTrigger('payments', 'trigger_update_order_paid_amount', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    function: 'update_order_paid_amount',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('payments', 'trigger_update_order_paid_amount', {
    ifExists: true,
  });
  pgm.dropTrigger('payments', 'update_payments_updated_at', { ifExists: true });
  pgm.dropTrigger('payments', 'set_transaction_id', { ifExists: true });

  // Drop functions
  pgm.dropFunction('update_order_paid_amount', [], { ifExists: true });
  pgm.dropFunction('generate_transaction_id', [], { ifExists: true });

  // Drop sequence
  pgm.dropSequence('payment_txn_seq', { ifExists: true });

  // Drop table
  pgm.dropTable('payments', { ifExists: true });

  // Drop enums
  pgm.dropType('payment_gateway_enum', { ifExists: true });
  pgm.dropType('payment_status_enum', { ifExists: true });
  pgm.dropType('payment_method_enum', { ifExists: true });
};
