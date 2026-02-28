/* eslint-disable camelcase */

/**
 * Migration: Create lot_movements table for tracking lot location and stage changes
 * Issue #14: [Inventory] Create lot movement history table
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create lot_movements table
  pgm.createTable('lot_movements', {
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
    from_location: {
      type: 'location_enum',
    },
    to_location: {
      type: 'location_enum',
    },
    from_stage: {
      type: 'growth_stage_enum',
    },
    to_stage: {
      type: 'growth_stage_enum',
    },
    stage_changed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    moved_by: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    moved_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    reason: {
      type: 'varchar(255)',
    },
    gps_latitude: {
      type: 'decimal(10,8)',
    },
    gps_longitude: {
      type: 'decimal(11,8)',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes
  pgm.createIndex('lot_movements', 'lot_id', { name: 'idx_lot_movements_lot_id' });
  pgm.createIndex('lot_movements', 'moved_at', { name: 'idx_lot_movements_moved_at' });
  pgm.createIndex('lot_movements', 'moved_by', { name: 'idx_lot_movements_moved_by' });
  pgm.createIndex('lot_movements', ['lot_id', 'moved_at'], {
    name: 'idx_lot_movements_lot_moved',
    method: 'btree',
  });

  // Add check constraint to ensure at least location or stage changes
  pgm.addConstraint('lot_movements', 'lot_movements_change_check', {
    check: `
      (from_location IS DISTINCT FROM to_location) OR
      (from_stage IS DISTINCT FROM to_stage)
    `,
  });
};

exports.down = (pgm) => {
  // Drop table (indexes and constraints will be dropped automatically)
  pgm.dropTable('lot_movements', { ifExists: true });
};
