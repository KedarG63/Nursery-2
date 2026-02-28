/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create user status enum type
  pgm.createType('user_status', ['active', 'inactive', 'suspended']);

  // Create users table
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    full_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    phone: {
      type: 'varchar(20)',
    },
    status: {
      type: 'user_status',
      notNull: true,
      default: 'active',
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

  // Create index on email (case-insensitive for lookups)
  pgm.createIndex('users', 'LOWER(email)', { unique: true, name: 'users_email_lower_idx' });

  // Create index on status for filtering
  pgm.createIndex('users', 'status');

  // Add email format check constraint
  pgm.addConstraint('users', 'users_email_format_check', {
    check: "email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
  });

  // Add function to automatically update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Add trigger to users table
  pgm.sql(`
    CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE users IS 'Application users with authentication credentials';
  `);
};

exports.down = pgm => {
  // Drop trigger and function
  pgm.sql('DROP TRIGGER IF EXISTS update_users_updated_at ON users;');
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column();');

  // Drop table and type
  pgm.dropTable('users', { ifExists: true, cascade: true });
  pgm.dropType('user_status', { ifExists: true });
};
