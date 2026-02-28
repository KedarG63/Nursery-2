/* eslint-disable camelcase */

/**
 * Migration: Create lots table for tray tracking
 * Issue #13: [Inventory] Create lots table for tray tracking
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Ensure UUID extension exists
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create growth_stage enum
  pgm.createType('growth_stage_enum', [
    'seed',
    'germination',
    'seedling',
    'transplant',
    'ready',
    'sold',
  ]);

  // Create location enum
  pgm.createType('location_enum', [
    'greenhouse',
    'field',
    'warehouse',
    'transit',
  ]);

  // Create lots table
  pgm.createTable('lots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    lot_number: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    sku_id: {
      type: 'uuid',
      notNull: true,
      references: 'skus',
      onDelete: 'RESTRICT',
    },
    quantity: {
      type: 'integer',
      notNull: true,
      default: 1000,
    },
    growth_stage: {
      type: 'growth_stage_enum',
      notNull: true,
      default: 'seed',
    },
    qr_code: {
      type: 'text',
      unique: true,
    },
    qr_code_url: {
      type: 'text',
    },
    current_location: {
      type: 'location_enum',
      notNull: true,
      default: 'greenhouse',
    },
    planted_date: {
      type: 'timestamp',
      notNull: true,
    },
    expected_ready_date: {
      type: 'timestamp',
    },
    allocated_quantity: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    available_quantity: {
      type: 'integer',
      notNull: true,
      default: 0,
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
  pgm.createIndex('lots', 'sku_id', { name: 'idx_lots_sku_id' });
  pgm.createIndex('lots', 'growth_stage', { name: 'idx_lots_growth_stage' });
  pgm.createIndex('lots', 'current_location', { name: 'idx_lots_current_location' });
  pgm.createIndex('lots', 'expected_ready_date', { name: 'idx_lots_expected_ready_date' });
  pgm.createIndex('lots', 'lot_number', { name: 'idx_lots_lot_number' });
  pgm.createIndex('lots', 'deleted_at', { name: 'idx_lots_deleted_at' });
  pgm.createIndex('lots', ['sku_id', 'growth_stage'], { name: 'idx_lots_sku_stage' });

  // Add check constraints
  pgm.addConstraint('lots', 'lots_quantity_check', {
    check: 'quantity > 0',
  });

  pgm.addConstraint('lots', 'lots_allocated_quantity_check', {
    check: 'allocated_quantity >= 0',
  });

  pgm.addConstraint('lots', 'lots_allocated_quantity_max_check', {
    check: 'allocated_quantity <= quantity',
  });

  // Create trigger function for updated_at
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_lots_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger
  pgm.createTrigger('lots', 'trigger_update_lots_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_lots_updated_at',
    level: 'ROW',
  });

  // Create trigger function for available_quantity calculation
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_available_quantity()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.available_quantity = NEW.quantity - NEW.allocated_quantity;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger for available_quantity
  pgm.createTrigger('lots', 'trigger_calculate_available_quantity', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_available_quantity',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('lots', 'trigger_calculate_available_quantity', { ifExists: true });
  pgm.dropTrigger('lots', 'trigger_update_lots_updated_at', { ifExists: true });

  // Drop trigger functions
  pgm.sql('DROP FUNCTION IF EXISTS calculate_available_quantity()');
  pgm.sql('DROP FUNCTION IF EXISTS update_lots_updated_at()');

  // Drop table
  pgm.dropTable('lots', { ifExists: true });

  // Drop enums
  pgm.dropType('location_enum', { ifExists: true });
  pgm.dropType('growth_stage_enum', { ifExists: true });
};
