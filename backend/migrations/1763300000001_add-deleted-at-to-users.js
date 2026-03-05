/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addColumn('users', {
    deleted_at: {
      type: 'timestamp',
      default: null,
    },
  });

  pgm.createIndex('users', 'deleted_at');
};

exports.down = pgm => {
  pgm.dropIndex('users', 'deleted_at', { ifExists: true });
  pgm.dropColumn('users', 'deleted_at');
};
