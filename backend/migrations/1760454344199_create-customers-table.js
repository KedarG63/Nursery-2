/* eslint-disable camelcase */

/**
 * Migration: Create customers table
 * Issue: #18 - Create customers table schema
 * Description: Customer database schema for farmers, retailers, and home gardeners
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create customer_type enum
  pgm.createType('customer_type_enum', [
    'farmer',
    'retailer',
    'home_gardener',
    'institutional'
  ]);

  // Create customer_status enum
  pgm.createType('customer_status_enum', [
    'active',
    'inactive',
    'blocked'
  ]);

  // Create sequence for customer code
  pgm.createSequence('customer_code_seq', {
    ifNotExists: true,
    increment: 1,
    minvalue: 1,
    maxvalue: 999999,
    start: 1,
    cache: 1,
    cycle: false
  });

  // Create customers table
  pgm.createTable('customers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    customer_code: {
      type: 'varchar(50)',
      unique: true,
      notNull: true
    },
    name: {
      type: 'varchar(200)',
      notNull: true
    },
    email: {
      type: 'varchar(255)',
      unique: true
    },
    phone: {
      type: 'varchar(20)',
      unique: true,
      notNull: true
    },
    whatsapp_number: {
      type: 'varchar(20)'
    },
    customer_type: {
      type: 'customer_type_enum',
      notNull: true,
      default: 'home_gardener'
    },
    gst_number: {
      type: 'varchar(15)'
    },
    credit_limit: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0.00
    },
    credit_days: {
      type: 'integer',
      notNull: true,
      default: 30
    },
    status: {
      type: 'customer_status_enum',
      notNull: true,
      default: 'active'
    },
    preferences: {
      type: 'jsonb',
      notNull: true,
      default: '{}'
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
  pgm.createIndex('customers', 'phone', { name: 'idx_customers_phone' });
  pgm.createIndex('customers', 'email', { name: 'idx_customers_email' });
  pgm.createIndex('customers', 'customer_type', { name: 'idx_customers_customer_type' });
  pgm.createIndex('customers', 'status', { name: 'idx_customers_status' });
  pgm.createIndex('customers', 'created_at', { name: 'idx_customers_created_at' });
  pgm.createIndex('customers', 'customer_code', { name: 'idx_customers_customer_code' });
  pgm.createIndex('customers', 'deleted_at', {
    name: 'idx_customers_deleted_at',
    where: 'deleted_at IS NULL'
  });

  // Add constraints
  pgm.addConstraint('customers', 'chk_phone_format', {
    check: "phone ~ '^\\+91[0-9]{10}$'"
  });

  pgm.addConstraint('customers', 'chk_email_format', {
    check: "email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'"
  });

  pgm.addConstraint('customers', 'chk_credit_limit_positive', {
    check: 'credit_limit >= 0'
  });

  pgm.addConstraint('customers', 'chk_credit_days_positive', {
    check: 'credit_days > 0'
  });

  // Create trigger function for auto-generating customer_code
  pgm.createFunction(
    'generate_customer_code',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF NEW.customer_code IS NULL THEN
        NEW.customer_code := 'CUST-' || LPAD(nextval('customer_code_seq')::TEXT, 6, '0');
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger for customer_code generation
  pgm.createTrigger('customers', 'set_customer_code', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_customer_code',
    level: 'ROW'
  });

  // Create trigger for updated_at
  pgm.createTrigger('customers', 'update_customers_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE customers IS 'Customer profiles for farmers, retailers, and home gardeners';
    COMMENT ON COLUMN customers.customer_code IS 'Auto-generated customer code (CUST-XXXXXX)';
    COMMENT ON COLUMN customers.phone IS 'Primary phone number with country code (+91XXXXXXXXXX)';
    COMMENT ON COLUMN customers.whatsapp_number IS 'WhatsApp number if different from phone';
    COMMENT ON COLUMN customers.credit_limit IS 'Maximum credit allowed in INR';
    COMMENT ON COLUMN customers.credit_days IS 'Credit period in days';
    COMMENT ON COLUMN customers.preferences IS 'JSONB object for communication and delivery preferences';
  `);
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('customers', 'update_customers_updated_at', { ifExists: true });
  pgm.dropTrigger('customers', 'set_customer_code', { ifExists: true });

  // Drop function
  pgm.dropFunction('generate_customer_code', [], { ifExists: true });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('customers', { ifExists: true, cascade: true });

  // Drop sequence
  pgm.dropSequence('customer_code_seq', { ifExists: true });

  // Drop enums
  pgm.dropType('customer_status_enum', { ifExists: true });
  pgm.dropType('customer_type_enum', { ifExists: true });
};
