/* eslint-disable camelcase */

/**
 * Migration: Create scan_logs table for audit trail
 * Issue #17: [Inventory] Create lot scanning mobile API endpoint
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create scan_logs table
  pgm.createTable('scan_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    lot_id: {
      type: 'uuid',
      notNull: true,
      references: 'lots',
      onDelete: 'CASCADE',
    },
    scanned_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    scanned_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    scan_method: {
      type: 'varchar(20)',
      notNull: true,
    },
    device_info: {
      type: 'jsonb',
    },
    gps_latitude: {
      type: 'decimal(10,8)',
    },
    gps_longitude: {
      type: 'decimal(11,8)',
    },
    action_taken: {
      type: 'varchar(50)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes for better query performance
  pgm.createIndex('scan_logs', 'lot_id', { name: 'idx_scan_logs_lot_id' });
  pgm.createIndex('scan_logs', 'scanned_by', { name: 'idx_scan_logs_scanned_by' });
  pgm.createIndex('scan_logs', 'scanned_at', { name: 'idx_scan_logs_scanned_at' });
  pgm.createIndex('scan_logs', ['lot_id', 'scanned_at'], {
    name: 'idx_scan_logs_lot_scanned',
    method: 'btree',
  });

  // Add check constraint for scan_method
  pgm.addConstraint('scan_logs', 'scan_method_check', {
    check: "scan_method IN ('qr_camera', 'manual_entry', 'nfc')",
  });
};

exports.down = (pgm) => {
  // Drop table (indexes and constraints will be dropped automatically)
  pgm.dropTable('scan_logs', { ifExists: true });
};
