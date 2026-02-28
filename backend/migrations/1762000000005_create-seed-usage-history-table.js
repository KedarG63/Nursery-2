/* eslint-disable camelcase */

/**
 * Migration: Create seed_usage_history table
 * Phase 22: Purchase & Seeds Management
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('seed_usage_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    seed_purchase_id: {
      type: 'uuid',
      notNull: true,
      references: 'seed_purchases',
      onDelete: 'RESTRICT',
    },
    lot_id: {
      type: 'uuid',
      notNull: true,
      references: 'lots',
      onDelete: 'RESTRICT',
    },
    seeds_allocated: {
      type: 'integer',
      notNull: true,
    },
    cost_per_seed: {
      type: 'decimal(10,4)',
      notNull: true,
    },
    total_cost: {
      type: 'decimal(12,2)',
    },
    allocated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    allocated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    notes: {
      type: 'text',
    },
  });

  pgm.createIndex('seed_usage_history', 'seed_purchase_id');
  pgm.createIndex('seed_usage_history', 'lot_id');
  pgm.createIndex('seed_usage_history', 'allocated_at');

  // Calculate total_cost
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_seed_usage_cost()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.total_cost = NEW.seeds_allocated * NEW.cost_per_seed;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_usage_history', 'trigger_calculate_seed_usage_cost', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_seed_usage_cost',
    level: 'ROW',
  });

  // Trigger to update seed_purchases.seeds_used
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seeds_used_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used + NEW.seeds_allocated
        WHERE id = NEW.seed_purchase_id;
      ELSIF TG_OP = 'UPDATE' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used - OLD.seeds_allocated + NEW.seeds_allocated
        WHERE id = NEW.seed_purchase_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used - OLD.seeds_allocated
        WHERE id = OLD.seed_purchase_id;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_usage_history', 'trigger_update_seeds_used_after_allocation', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    function: 'update_seeds_used_count',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('seed_usage_history', 'trigger_update_seeds_used_after_allocation', { ifExists: true });
  pgm.dropTrigger('seed_usage_history', 'trigger_calculate_seed_usage_cost', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_seeds_used_count()');
  pgm.sql('DROP FUNCTION IF EXISTS calculate_seed_usage_cost()');
  pgm.dropTable('seed_usage_history', { ifExists: true, cascade: true });
};
