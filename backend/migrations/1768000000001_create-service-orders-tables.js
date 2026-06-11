/* eslint-disable camelcase */

/**
 * Migration: Create service_orders + service_order_payments tables
 * Feature: Service / Grow-Only orders
 * Description: Customers bring their own seeds and pay the nursery only a flat
 *   service charge to grow them. These are tracked separately from product
 *   orders (no SKUs, lots, inventory allocation). Self-contained module that
 *   does not touch the orders / order_items / payments tables.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Ensure UUID extension exists
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create service_order_status enum
  pgm.createType('service_order_status_enum', [
    'pending',
    'in_progress',
    'ready',
    'completed',
    'cancelled',
  ]);

  // Create sequence for service order number
  pgm.createSequence('service_order_number_seq', {
    ifNotExists: true,
    increment: 1,
    minvalue: 1,
    maxvalue: 9999,
    start: 1,
    cache: 1,
    cycle: true,
  });

  // ---- service_orders table ----
  pgm.createTable('service_orders', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    service_order_number: {
      type: 'varchar(50)',
      unique: true,
      notNull: true,
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT',
    },
    description: {
      type: 'text',
      notNull: true,
    },
    quantity: {
      type: 'integer',
    },
    service_fee: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    paid_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.0,
    },
    status: {
      type: 'service_order_status_enum',
      notNull: true,
      default: 'pending',
    },
    order_date: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    start_date: {
      type: 'date',
    },
    expected_ready_date: {
      type: 'date',
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
    deleted_by: {
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

  // balance_amount as a STORED generated column (service_fee - paid_amount)
  pgm.sql(
    `ALTER TABLE service_orders
       ADD COLUMN balance_amount decimal(12,2)
       GENERATED ALWAYS AS (service_fee - paid_amount) STORED;`
  );

  // Indexes
  pgm.createIndex('service_orders', 'customer_id', {
    name: 'idx_service_orders_customer_id',
  });
  pgm.createIndex('service_orders', 'service_order_number', {
    name: 'idx_service_orders_number',
    unique: true,
  });
  pgm.createIndex('service_orders', 'status', {
    name: 'idx_service_orders_status',
  });
  pgm.createIndex('service_orders', 'deleted_at', {
    name: 'idx_service_orders_deleted_at',
    where: 'deleted_at IS NULL',
  });

  // Constraints
  pgm.addConstraint('service_orders', 'chk_service_fee_positive', {
    check: 'service_fee >= 0',
  });
  pgm.addConstraint('service_orders', 'chk_service_paid_amount_positive', {
    check: 'paid_amount >= 0',
  });
  pgm.addConstraint('service_orders', 'chk_service_paid_not_exceed_fee', {
    check: 'paid_amount <= service_fee',
  });
  pgm.addConstraint('service_orders', 'chk_service_quantity_positive', {
    check: 'quantity IS NULL OR quantity > 0',
  });

  // Auto-generate service_order_number (SO-YYYYMMDD-XXXX)
  pgm.createFunction(
    'generate_service_order_number',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.service_order_number IS NULL THEN
        NEW.service_order_number := 'SO-' || TO_CHAR(NEW.order_date, 'YYYYMMDD') || '-' ||
                                    LPAD(nextval('service_order_number_seq')::TEXT, 4, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('service_orders', 'set_service_order_number', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_service_order_number',
    level: 'ROW',
  });

  // updated_at maintenance (reuse shared function)
  pgm.createTrigger('service_orders', 'update_service_orders_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // ---- service_order_payments table ----
  pgm.createTable('service_order_payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    service_order_id: {
      type: 'uuid',
      notNull: true,
      references: 'service_orders',
      onDelete: 'CASCADE',
    },
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    payment_method: {
      type: 'payment_method_enum',
      notNull: true,
    },
    payment_date: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    notes: {
      type: 'text',
    },
    received_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('service_order_payments', 'service_order_id', {
    name: 'idx_service_order_payments_order_id',
  });

  pgm.addConstraint('service_order_payments', 'chk_service_payment_amount_positive', {
    check: 'amount > 0',
  });

  // Keep service_orders.paid_amount in sync when payments are recorded
  pgm.createFunction(
    'update_service_order_paid_amount',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE service_orders
        SET paid_amount = paid_amount + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.service_order_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE service_orders
        SET paid_amount = paid_amount - OLD.amount,
            updated_at = NOW()
        WHERE id = OLD.service_order_id;
      END IF;
      RETURN NULL;
    END;
    `
  );

  pgm.createTrigger('service_order_payments', 'trigger_update_service_order_paid_amount', {
    when: 'AFTER',
    operation: ['INSERT', 'DELETE'],
    function: 'update_service_order_paid_amount',
    level: 'ROW',
  });

  // Comments
  pgm.sql(`
    COMMENT ON TABLE service_orders IS 'Grow-only service orders: customer supplies seeds, nursery charges a flat service fee';
    COMMENT ON COLUMN service_orders.service_order_number IS 'Auto-generated (SO-YYYYMMDD-XXXX)';
    COMMENT ON COLUMN service_orders.description IS 'What is being grown / note that customer supplied own seeds';
    COMMENT ON COLUMN service_orders.quantity IS 'Informational only (e.g. number of trays/plants)';
    COMMENT ON COLUMN service_orders.service_fee IS 'Flat total service charge';
    COMMENT ON COLUMN service_orders.balance_amount IS 'Auto-calculated (service_fee - paid_amount)';
  `);
};

exports.down = (pgm) => {
  pgm.dropTrigger('service_order_payments', 'trigger_update_service_order_paid_amount', {
    ifExists: true,
  });
  pgm.dropFunction('update_service_order_paid_amount', [], { ifExists: true });
  pgm.dropTable('service_order_payments', { ifExists: true, cascade: true });

  pgm.dropTrigger('service_orders', 'update_service_orders_updated_at', { ifExists: true });
  pgm.dropTrigger('service_orders', 'set_service_order_number', { ifExists: true });
  pgm.dropFunction('generate_service_order_number', [], { ifExists: true });
  pgm.dropTable('service_orders', { ifExists: true, cascade: true });

  pgm.dropSequence('service_order_number_seq', { ifExists: true });
  pgm.dropType('service_order_status_enum', { ifExists: true });
};
