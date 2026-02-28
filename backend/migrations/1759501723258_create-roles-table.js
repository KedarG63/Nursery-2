/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create roles table
  pgm.createTable('roles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
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

  // Add unique constraint on name (case-insensitive)
  pgm.createIndex('roles', 'LOWER(name)', { unique: true });

  // Seed default roles
  pgm.sql(`
    INSERT INTO roles (name, description) VALUES
    ('Admin', 'Full system access with all permissions'),
    ('Manager', 'Manage inventory, orders, and reports'),
    ('Sales', 'Handle customer orders and inquiries'),
    ('Warehouse', 'Manage inventory and lot tracking'),
    ('Delivery', 'Handle deliveries and logistics');
  `);

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE roles IS 'User roles for role-based access control';
  `);
};

exports.down = pgm => {
  pgm.dropTable('roles', { ifExists: true, cascade: true });
};
