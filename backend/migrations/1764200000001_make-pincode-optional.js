/* eslint-disable camelcase */

/**
 * Migration: Make customer_addresses.pincode optional
 * Reason: Pincode should not be required when creating a customer address
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Drop the NOT NULL constraint
  pgm.alterColumn('customer_addresses', 'pincode', { notNull: false });

  // Drop the old strict check constraint and replace with a nullable-friendly one
  pgm.dropConstraint('customer_addresses', 'chk_pincode_format', { ifExists: true });
  pgm.addConstraint('customer_addresses', 'chk_pincode_format', {
    check: "pincode IS NULL OR pincode ~ '^[0-9]{6}$'"
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('customer_addresses', 'chk_pincode_format', { ifExists: true });
  pgm.addConstraint('customer_addresses', 'chk_pincode_format', {
    check: "pincode ~ '^[0-9]{6}$'"
  });
  pgm.alterColumn('customer_addresses', 'pincode', { notNull: true });
};
