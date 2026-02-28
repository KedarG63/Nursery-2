/* eslint-disable camelcase */

/**
 * Migration: Add Inventory Calculation Indexes
 * Phase: Inventory Revamp - Performance Optimization
 * Adds indexes to optimize stock calculation queries for SKUs
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Index for seed_purchases queries used in SKU stock calculation
  // Filters: sku_id, deleted_at, inventory_status, expiry_date
  pgm.createIndex('seed_purchases', ['sku_id', 'inventory_status', 'expiry_date'], {
    name: 'idx_seed_purchases_sku_inventory',
    where: 'deleted_at IS NULL',
  });

  // Index for lots queries used in SKU stock calculation
  // Filters: sku_id, deleted_at, growth_stage
  pgm.createIndex('lots', ['sku_id', 'growth_stage', 'available_quantity'], {
    name: 'idx_lots_sku_growth_available',
    where: 'deleted_at IS NULL',
  });

  // Index for seed_purchases queries in inventory service
  // For product/vendor level filtering
  pgm.createIndex('seed_purchases', ['product_id', 'vendor_id', 'inventory_status'], {
    name: 'idx_seed_purchases_product_vendor',
    where: 'deleted_at IS NULL',
  });

  // Index for lots queries in inventory service
  // For product/location level filtering
  pgm.createIndex('lots', ['sku_id', 'current_location', 'growth_stage'], {
    name: 'idx_lots_sku_location_stage',
    where: 'deleted_at IS NULL',
  });

  // Add index on seeds_remaining for quick availability checks
  pgm.createIndex('seed_purchases', ['seeds_remaining'], {
    name: 'idx_seed_purchases_remaining',
    where: 'deleted_at IS NULL AND seeds_remaining > 0',
  });

  // Add comment to track optimization
  pgm.sql(`
    COMMENT ON INDEX idx_seed_purchases_sku_inventory IS
    'Optimizes SKU stock calculation queries - filters by sku_id, status, and expiry';

    COMMENT ON INDEX idx_lots_sku_growth_available IS
    'Optimizes SKU stock calculation queries - filters by sku_id, growth_stage, and availability';
  `);
};

exports.down = (pgm) => {
  // Drop indexes in reverse order
  pgm.dropIndex('seed_purchases', ['seeds_remaining'], {
    name: 'idx_seed_purchases_remaining',
    ifExists: true,
  });

  pgm.dropIndex('lots', ['sku_id', 'current_location', 'growth_stage'], {
    name: 'idx_lots_sku_location_stage',
    ifExists: true,
  });

  pgm.dropIndex('seed_purchases', ['product_id', 'vendor_id', 'inventory_status'], {
    name: 'idx_seed_purchases_product_vendor',
    ifExists: true,
  });

  pgm.dropIndex('lots', ['sku_id', 'growth_stage', 'available_quantity'], {
    name: 'idx_lots_sku_growth_available',
    ifExists: true,
  });

  pgm.dropIndex('seed_purchases', ['sku_id', 'inventory_status', 'expiry_date'], {
    name: 'idx_seed_purchases_sku_inventory',
    ifExists: true,
  });
};
