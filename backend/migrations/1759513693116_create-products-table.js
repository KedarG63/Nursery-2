/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create product category enum type
  pgm.createType('product_category', ['leafy_greens', 'fruiting', 'root', 'herbs']);

  // Create product status enum type
  pgm.createType('product_status', ['active', 'inactive', 'discontinued']);

  // Create products table
  pgm.createTable('products', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    description: {
      type: 'text',
    },
    category: {
      type: 'product_category',
      notNull: true,
    },
    status: {
      type: 'product_status',
      notNull: true,
      default: 'active',
    },
    growth_period_days: {
      type: 'integer',
      notNull: true,
    },
    image_url: {
      type: 'varchar(500)',
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
    deleted_at: {
      type: 'timestamp',
    },
    created_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
  });

  // Create indexes
  pgm.createIndex('products', 'name');
  pgm.createIndex('products', 'category');
  pgm.createIndex('products', 'status');
  pgm.createIndex('products', 'deleted_at');

  // Add check constraint for growth_period_days
  pgm.addConstraint('products', 'products_growth_period_positive', {
    check: 'growth_period_days > 0',
  });

  // Add trigger to update updated_at timestamp
  pgm.sql(`
    CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE products IS 'Core product catalog for plant species/varieties';
  `);
};

exports.down = pgm => {
  // Drop trigger
  pgm.sql('DROP TRIGGER IF EXISTS update_products_updated_at ON products;');

  // Drop table and types
  pgm.dropTable('products', { ifExists: true, cascade: true });
  pgm.dropType('product_category', { ifExists: true });
  pgm.dropType('product_status', { ifExists: true });
};
