/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create user_roles junction table
  pgm.createTable('user_roles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    role_id: {
      type: 'uuid',
      notNull: true,
      references: 'roles(id)',
      onDelete: 'CASCADE',
    },
    assigned_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create unique constraint on (user_id, role_id) to prevent duplicate assignments
  pgm.addConstraint('user_roles', 'user_roles_unique_user_role', {
    unique: ['user_id', 'role_id'],
  });

  // Create indexes for efficient lookups
  pgm.createIndex('user_roles', 'user_id');
  pgm.createIndex('user_roles', 'role_id');

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE user_roles IS 'Junction table for many-to-many relationship between users and roles';
  `);
};

exports.down = pgm => {
  pgm.dropTable('user_roles', { ifExists: true, cascade: true });
};
