/* eslint-disable camelcase */

/**
 * Migration: Create customer_addresses table
 * Issue: #19 - Create customer addresses table
 * Description: Support multiple delivery locations per customer with GPS tracking
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create address_type enum
  pgm.createType('address_type_enum', ['billing', 'delivery', 'both']);

  // Create customer_addresses table
  pgm.createTable('customer_addresses', {
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
    address_type: {
      type: 'address_type_enum',
      notNull: true,
      default: 'both'
    },
    address_line1: {
      type: 'varchar(255)',
      notNull: true
    },
    address_line2: {
      type: 'varchar(255)'
    },
    landmark: {
      type: 'varchar(100)'
    },
    city: {
      type: 'varchar(100)',
      notNull: true
    },
    state: {
      type: 'varchar(100)',
      notNull: true
    },
    pincode: {
      type: 'varchar(10)',
      notNull: true
    },
    country: {
      type: 'varchar(50)',
      notNull: true,
      default: 'India'
    },
    gps_latitude: {
      type: 'decimal(10,8)'
    },
    gps_longitude: {
      type: 'decimal(11,8)'
    },
    is_default: {
      type: 'boolean',
      notNull: true,
      default: false
    },
    delivery_instructions: {
      type: 'text'
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
  pgm.createIndex('customer_addresses', 'customer_id', {
    name: 'idx_customer_addresses_customer_id'
  });

  pgm.createIndex('customer_addresses', ['customer_id', 'is_default'], {
    name: 'idx_customer_addresses_is_default'
  });

  pgm.createIndex('customer_addresses', 'pincode', {
    name: 'idx_customer_addresses_pincode'
  });

  pgm.createIndex('customer_addresses', 'city', {
    name: 'idx_customer_addresses_city'
  });

  pgm.createIndex('customer_addresses', 'deleted_at', {
    name: 'idx_customer_addresses_deleted_at',
    where: 'deleted_at IS NULL'
  });

  // Add constraints
  pgm.addConstraint('customer_addresses', 'chk_pincode_format', {
    check: "pincode ~ '^[0-9]{6}$'"
  });

  pgm.addConstraint('customer_addresses', 'chk_gps_latitude', {
    check: 'gps_latitude BETWEEN -90 AND 90'
  });

  pgm.addConstraint('customer_addresses', 'chk_gps_longitude', {
    check: 'gps_longitude BETWEEN -180 AND 180'
  });

  // Create unique index to ensure only one default address per customer
  pgm.addIndex('customer_addresses', ['customer_id'], {
    name: 'idx_one_default_address_per_customer',
    unique: true,
    where: 'is_default = TRUE AND deleted_at IS NULL'
  });

  // Create trigger function to ensure single default address
  pgm.createFunction(
    'ensure_default_address',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      -- If setting default to true, unset all other defaults for this customer
      IF NEW.is_default = TRUE THEN
        UPDATE customer_addresses
        SET is_default = FALSE
        WHERE customer_id = NEW.customer_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND deleted_at IS NULL;
      END IF;

      RETURN NEW;
    END;
    `
  );

  // Create trigger for ensuring single default address
  pgm.createTrigger('customer_addresses', 'enforce_single_default_address', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'ensure_default_address',
    level: 'ROW'
  });

  // Create trigger for updated_at
  pgm.createTrigger('customer_addresses', 'update_customer_addresses_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE customer_addresses IS 'Multiple delivery addresses per customer with GPS tracking';
    COMMENT ON COLUMN customer_addresses.is_default IS 'Only one default address allowed per customer';
    COMMENT ON COLUMN customer_addresses.gps_latitude IS 'Latitude coordinate for delivery routing';
    COMMENT ON COLUMN customer_addresses.gps_longitude IS 'Longitude coordinate for delivery routing';
    COMMENT ON COLUMN customer_addresses.delivery_instructions IS 'Special instructions for delivery personnel';
  `);
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('customer_addresses', 'update_customer_addresses_updated_at', {
    ifExists: true
  });
  pgm.dropTrigger('customer_addresses', 'enforce_single_default_address', {
    ifExists: true
  });

  // Drop function
  pgm.dropFunction('ensure_default_address', [], { ifExists: true });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('customer_addresses', { ifExists: true, cascade: true });

  // Drop enum
  pgm.dropType('address_type_enum', { ifExists: true });
};
