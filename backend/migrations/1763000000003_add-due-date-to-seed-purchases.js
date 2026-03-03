/* eslint-disable camelcase */

/**
 * Migration: Add due_date to seed_purchases for AP aging tracking
 * Phase 23: Billing & Accounting
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('seed_purchases', {
    due_date: {
      type: 'date',
    },
  });

  pgm.createIndex('seed_purchases', 'due_date', {
    name: 'idx_seed_purchases_due_date',
    where: 'deleted_at IS NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('seed_purchases', 'due_date', {
    name: 'idx_seed_purchases_due_date',
    ifExists: true,
  });
  pgm.dropColumn('seed_purchases', 'due_date');
};
