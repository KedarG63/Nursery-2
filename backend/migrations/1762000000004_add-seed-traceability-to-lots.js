/* eslint-disable camelcase */

/**
 * Migration: Add seed traceability to lots table
 * Phase 22: Purchase & Seeds Management
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Add seed traceability columns to lots table
  pgm.addColumns('lots', {
    seed_purchase_id: {
      type: 'uuid',
      references: 'seed_purchases',
      onDelete: 'SET NULL',
    },
    seeds_used_count: {
      type: 'integer',
      default: 0,
    },
    seed_cost_per_unit: {
      type: 'decimal(10,4)',
    },
    total_seed_cost: {
      type: 'decimal(12,2)',
    },
  });

  // Create index
  pgm.createIndex('lots', 'seed_purchase_id');

  // Trigger to calculate total_seed_cost
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_lot_seed_cost()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.seeds_used_count IS NOT NULL AND NEW.seed_cost_per_unit IS NOT NULL THEN
        NEW.total_seed_cost = NEW.seeds_used_count * NEW.seed_cost_per_unit;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('lots', 'trigger_calculate_lot_seed_cost', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_lot_seed_cost',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('lots', 'trigger_calculate_lot_seed_cost', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS calculate_lot_seed_cost()');
  pgm.dropColumns('lots', ['seed_purchase_id', 'seeds_used_count', 'seed_cost_per_unit', 'total_seed_cost']);
};
