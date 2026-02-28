/* eslint-disable camelcase */

/**
 * Migration: Create orders table
 * Issue #22: [Orders] Create orders table schema
 * Description: Comprehensive orders table for customer orders with delivery scheduling
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Ensure UUID extension exists
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create order_status enum
  pgm.createType('order_status_enum', [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'dispatched',
    'delivered',
    'cancelled'
  ]);

  // Create payment_type enum
  pgm.createType('payment_type_enum', [
    'advance',
    'installment',
    'credit',
    'cod'
  ]);

  // Create delivery_slot enum
  pgm.createType('delivery_slot_enum', [
    'morning',
    'afternoon',
    'evening'
  ]);

  // Create sequence for order number
  pgm.createSequence('order_number_seq', {
    ifNotExists: true,
    increment: 1,
    minvalue: 1,
    maxvalue: 9999,
    start: 1,
    cache: 1,
    cycle: true
  });

  // Create orders table
  pgm.createTable('orders', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    order_number: {
      type: 'varchar(50)',
      unique: true,
      notNull: true
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT'
    },
    delivery_address_id: {
      type: 'uuid',
      notNull: true,
      references: 'customer_addresses',
      onDelete: 'RESTRICT'
    },
    order_date: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    delivery_date: {
      type: 'date',
      notNull: true
    },
    delivery_slot: {
      type: 'delivery_slot_enum'
    },
    status: {
      type: 'order_status_enum',
      notNull: true,
      default: 'pending'
    },
    payment_type: {
      type: 'payment_type_enum',
      notNull: true
    },
    subtotal_amount: {
      type: 'decimal(12,2)',
      notNull: true
    },
    discount_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0.00
    },
    tax_amount: {
      type: 'decimal(10,2)',
      notNull: true,
      default: 0.00
    },
    total_amount: {
      type: 'decimal(12,2)',
      notNull: true
    },
    paid_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.00
    },
    balance_amount: {
      type: 'decimal(12,2)',
      notNull: true
    },
    expected_ready_date: {
      type: 'date'
    },
    notes: {
      type: 'text'
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    deleted_at: {
      type: 'timestamp'
    }
  });

  // Create indexes
  pgm.createIndex('orders', 'customer_id', { name: 'idx_orders_customer_id' });
  pgm.createIndex('orders', 'order_number', { name: 'idx_orders_order_number', unique: true });
  pgm.createIndex('orders', 'status', { name: 'idx_orders_status' });
  pgm.createIndex('orders', 'order_date', { name: 'idx_orders_order_date' });
  pgm.createIndex('orders', 'delivery_date', { name: 'idx_orders_delivery_date' });
  pgm.createIndex('orders', 'deleted_at', {
    name: 'idx_orders_deleted_at',
    where: 'deleted_at IS NULL'
  });
  pgm.createIndex('orders', ['customer_id', 'status'], {
    name: 'idx_orders_customer_status'
  });

  // Add constraints
  pgm.addConstraint('orders', 'chk_subtotal_amount_positive', {
    check: 'subtotal_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_discount_amount_positive', {
    check: 'discount_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_tax_amount_positive', {
    check: 'tax_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_total_amount_positive', {
    check: 'total_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_paid_amount_positive', {
    check: 'paid_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_balance_amount_positive', {
    check: 'balance_amount >= 0'
  });

  pgm.addConstraint('orders', 'chk_paid_amount_not_exceed_total', {
    check: 'paid_amount <= total_amount'
  });

  pgm.addConstraint('orders', 'chk_delivery_date_after_order', {
    check: 'delivery_date >= order_date::date'
  });

  // Create trigger function for auto-generating order_number
  pgm.createFunction(
    'generate_order_number',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF NEW.order_number IS NULL THEN
        NEW.order_number := 'ORD-' || TO_CHAR(NEW.order_date, 'YYYYMMDD') || '-' ||
                           LPAD(nextval('order_number_seq')::TEXT, 4, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger for order_number generation
  pgm.createTrigger('orders', 'set_order_number', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_order_number',
    level: 'ROW'
  });

  // Create trigger function for auto-calculating balance_amount
  pgm.createFunction(
    'calculate_balance_amount',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      NEW.balance_amount := NEW.total_amount - NEW.paid_amount;
      RETURN NEW;
    END;
    `
  );

  // Create trigger for balance_amount calculation
  pgm.createTrigger('orders', 'set_balance_amount', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_balance_amount',
    level: 'ROW'
  });

  // Create trigger for updated_at
  pgm.createTrigger('orders', 'update_orders_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE orders IS 'Customer orders with delivery scheduling and payment tracking';
    COMMENT ON COLUMN orders.order_number IS 'Auto-generated order number (ORD-YYYYMMDD-XXXX)';
    COMMENT ON COLUMN orders.delivery_slot IS 'Preferred delivery time slot';
    COMMENT ON COLUMN orders.subtotal_amount IS 'Sum of all order items before discount and tax';
    COMMENT ON COLUMN orders.discount_amount IS 'Total discount applied to order';
    COMMENT ON COLUMN orders.tax_amount IS 'Total tax amount (GST, etc.)';
    COMMENT ON COLUMN orders.total_amount IS 'Final amount after discount and tax';
    COMMENT ON COLUMN orders.paid_amount IS 'Amount paid so far';
    COMMENT ON COLUMN orders.balance_amount IS 'Remaining amount to be paid (auto-calculated)';
    COMMENT ON COLUMN orders.expected_ready_date IS 'Expected date when order will be ready based on lot availability';
  `);
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('orders', 'update_orders_updated_at', { ifExists: true });
  pgm.dropTrigger('orders', 'set_balance_amount', { ifExists: true });
  pgm.dropTrigger('orders', 'set_order_number', { ifExists: true });

  // Drop functions
  pgm.dropFunction('calculate_balance_amount', [], { ifExists: true });
  pgm.dropFunction('generate_order_number', [], { ifExists: true });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('orders', { ifExists: true, cascade: true });

  // Drop sequence
  pgm.dropSequence('order_number_seq', { ifExists: true });

  // Drop enums
  pgm.dropType('delivery_slot_enum', { ifExists: true });
  pgm.dropType('payment_type_enum', { ifExists: true });
  pgm.dropType('order_status_enum', { ifExists: true });
};
