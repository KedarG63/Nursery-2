/* eslint-disable camelcase */

/**
 * Migration: Add lot_size (standard tray size) to products table
 * Description: Adds a field to track the standard lot quantity for each product
 */

exports.shorthands = undefined;

exports.up = pgm => {
  // Add lot_size column to products table
  pgm.addColumns('products', {
    lot_size: {
      type: 'integer',
      notNull: true,
      default: 1000,
      comment: 'Standard lot/tray quantity for this product (default 1000)'
    }
  });

  // Add check constraint to ensure lot_size is positive
  pgm.addConstraint('products', 'products_lot_size_positive', {
    check: 'lot_size > 0'
  });

  // Add comment
  pgm.sql(`
    COMMENT ON COLUMN products.lot_size IS 'Standard lot/tray quantity for this product (e.g., 1000 plants per tray)';
  `);
};

exports.down = pgm => {
  // Drop constraint first
  pgm.dropConstraint('products', 'products_lot_size_positive', { ifExists: true });

  // Drop column
  pgm.dropColumns('products', ['lot_size'], { ifExists: true });
};
