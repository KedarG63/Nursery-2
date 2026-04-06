/* eslint-disable camelcase */

/**
 * Migration: Add deleted_by column to soft-delete tables
 * Trash Can feature — track who deleted each record
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  const tables = ['lots', 'orders', 'customers', 'seed_purchases'];

  for (const table of tables) {
    pgm.addColumns(table, {
      deleted_by: {
        type: 'uuid',
        references: 'users',
        onDelete: 'SET NULL',
      },
    });
  }
};

exports.down = (pgm) => {
  const tables = ['lots', 'orders', 'customers', 'seed_purchases'];
  for (const table of tables) {
    pgm.dropColumns(table, ['deleted_by']);
  }
};
