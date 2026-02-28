/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create sample table to demonstrate migrations
  pgm.createTable('sample_table', {
    id: 'id',
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create index on name
  pgm.createIndex('sample_table', 'name');

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE sample_table IS 'Sample table to demonstrate database migrations';
  `);
};

exports.down = pgm => {
  // Drop the table (cascading drops indexes automatically)
  pgm.dropTable('sample_table', { ifExists: true });
};
