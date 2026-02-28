/* eslint-disable camelcase */

/**
 * Migration: Create customer_credit table
 * Issue: #21 - Create customer credit management table
 * Description: Track credit limits, usage, and balances for customers
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create customer_credit table
  pgm.createTable('customer_credit', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    customer_id: {
      type: 'uuid',
      unique: true,
      notNull: true,
      references: 'customers',
      onDelete: 'CASCADE'
    },
    credit_limit: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.0
    },
    credit_used: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.0
    },
    credit_available: {
      type: 'decimal(12,2)',
      notNull: true
    },
    alert_threshold: {
      type: 'decimal(5,2)',
      notNull: true,
      default: 80.0
    },
    last_payment_date: {
      type: 'timestamp'
    },
    last_credit_review_date: {
      type: 'timestamp'
    },
    overdue_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.0
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
    }
  });

  // Drop and recreate credit_available as generated column
  pgm.sql(`
    ALTER TABLE customer_credit DROP COLUMN credit_available;
    ALTER TABLE customer_credit ADD COLUMN credit_available decimal(12,2)
    GENERATED ALWAYS AS (credit_limit - credit_used) STORED NOT NULL;
  `);

  // Create indexes
  pgm.createIndex('customer_credit', 'customer_id', {
    name: 'idx_customer_credit_customer_id'
  });

  // Create index for customers exceeding alert threshold
  pgm.sql(`
    CREATE INDEX idx_customer_credit_alert
    ON customer_credit(customer_id)
    WHERE (credit_used / NULLIF(credit_limit, 0)) * 100 >= alert_threshold;
  `);

  // Add constraints
  pgm.addConstraint('customer_credit', 'chk_credit_used_within_limit', {
    check: 'credit_used <= credit_limit'
  });

  pgm.addConstraint('customer_credit', 'chk_credit_amounts_positive', {
    check: 'credit_limit >= 0 AND credit_used >= 0 AND overdue_amount >= 0'
  });

  pgm.addConstraint('customer_credit', 'chk_alert_threshold_range', {
    check: 'alert_threshold BETWEEN 0 AND 100'
  });

  // Create trigger for updated_at
  pgm.createTrigger('customer_credit', 'update_customer_credit_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });

  // Create trigger function to auto-create credit record when customer is created
  pgm.createFunction(
    'create_customer_credit_record',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      INSERT INTO customer_credit (customer_id, credit_limit)
      VALUES (NEW.id, NEW.credit_limit)
      ON CONFLICT (customer_id) DO NOTHING;
      RETURN NEW;
    END;
    `
  );

  // Create trigger on customers table to auto-create credit record
  pgm.createTrigger('customers', 'auto_create_credit_record', {
    when: 'AFTER',
    operation: 'INSERT',
    function: 'create_customer_credit_record',
    level: 'ROW'
  });

  // Create trigger function to sync credit limit from customers table
  pgm.createFunction(
    'sync_credit_limit',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF NEW.credit_limit IS DISTINCT FROM OLD.credit_limit THEN
        UPDATE customer_credit
        SET credit_limit = NEW.credit_limit
        WHERE customer_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger on customers table to sync credit limit
  pgm.createTrigger('customers', 'sync_customer_credit_limit', {
    when: 'AFTER',
    operation: 'UPDATE',
    function: 'sync_credit_limit',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE customer_credit IS 'Track credit limits, usage, and balances for customers';
    COMMENT ON COLUMN customer_credit.credit_limit IS 'Maximum credit allowed in INR';
    COMMENT ON COLUMN customer_credit.credit_used IS 'Currently used credit amount';
    COMMENT ON COLUMN customer_credit.credit_available IS 'Auto-calculated: credit_limit - credit_used';
    COMMENT ON COLUMN customer_credit.alert_threshold IS 'Alert when usage reaches this percentage of limit';
    COMMENT ON COLUMN customer_credit.overdue_amount IS 'Amount past due date';
  `);
};

exports.down = (pgm) => {
  // Drop triggers on customers table
  pgm.dropTrigger('customers', 'sync_customer_credit_limit', { ifExists: true });
  pgm.dropTrigger('customers', 'auto_create_credit_record', { ifExists: true });

  // Drop trigger functions
  pgm.dropFunction('sync_credit_limit', [], { ifExists: true });
  pgm.dropFunction('create_customer_credit_record', [], { ifExists: true });

  // Drop trigger on customer_credit table
  pgm.dropTrigger('customer_credit', 'update_customer_credit_updated_at', {
    ifExists: true
  });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('customer_credit', { ifExists: true, cascade: true });
};
