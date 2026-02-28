/* eslint-disable camelcase */

/**
 * Migration: Create vendors table
 * Phase 22: Purchase & Seeds Management
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create vendor status enum
  pgm.createType('vendor_status_enum', ['active', 'inactive', 'blacklisted']);

  // Create vendors table
  pgm.createTable('vendors', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    vendor_code: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    vendor_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    contact_person: {
      type: 'varchar(255)',
    },
    phone: {
      type: 'varchar(20)',
    },
    email: {
      type: 'varchar(255)',
    },
    address: {
      type: 'text',
    },
    gst_number: {
      type: 'varchar(50)',
    },
    payment_terms: {
      type: 'integer',
      default: 30,
    },
    status: {
      type: 'vendor_status_enum',
      notNull: true,
      default: 'active',
    },
    notes: {
      type: 'text',
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
    deleted_at: {
      type: 'timestamp',
    },
  });

  // Create indexes
  pgm.createIndex('vendors', 'vendor_code');
  pgm.createIndex('vendors', 'status');
  pgm.createIndex('vendors', 'deleted_at');

  // Create trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER trigger_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTrigger('vendors', 'trigger_vendors_updated_at', { ifExists: true });
  pgm.dropTable('vendors', { ifExists: true, cascade: true });
  pgm.dropType('vendor_status_enum', { ifExists: true });
};
