/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Drop indexes on removed columns first
  pgm.dropIndex('skus', 'size', { ifExists: true });
  pgm.dropIndex('skus', 'container_type', { ifExists: true });

  // Drop the columns
  pgm.dropColumns('skus', ['size', 'container_type']);

  // Drop enum types (now unused)
  pgm.dropType('sku_size', { ifExists: true, cascade: true });
  pgm.dropType('container_type', { ifExists: true, cascade: true });
};

exports.down = pgm => {
  pgm.createType('sku_size', ['small', 'medium', 'large']);
  pgm.createType('container_type', ['tray', 'pot', 'seedling_tray', 'grow_bag']);
  pgm.addColumns('skus', {
    size: { type: 'sku_size', notNull: true, default: 'medium' },
    container_type: { type: 'container_type', notNull: true, default: 'tray' },
  });
  pgm.createIndex('skus', 'size');
  pgm.createIndex('skus', 'container_type');
};
