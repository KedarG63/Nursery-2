/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create SKU size enum type
  pgm.createType('sku_size', ['small', 'medium', 'large']);

  // Create container type enum
  pgm.createType('container_type', ['tray', 'pot', 'seedling_tray', 'grow_bag']);

  // Create SKUs table
  pgm.createTable('skus', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    sku_code: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    product_id: {
      type: 'uuid',
      notNull: true,
      references: 'products(id)',
      onDelete: 'CASCADE',
    },
    variety: {
      type: 'varchar(100)',
    },
    size: {
      type: 'sku_size',
      notNull: true,
    },
    container_type: {
      type: 'container_type',
      notNull: true,
    },
    price: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    cost: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    min_stock_level: {
      type: 'integer',
      default: 0,
    },
    max_stock_level: {
      type: 'integer',
      default: 1000,
    },
    active: {
      type: 'boolean',
      notNull: true,
      default: true,
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

  // Create composite index on product_id and sku_code
  pgm.createIndex('skus', ['product_id', 'sku_code']);

  // Create individual indexes
  pgm.createIndex('skus', 'sku_code');
  pgm.createIndex('skus', 'product_id');
  pgm.createIndex('skus', 'size');
  pgm.createIndex('skus', 'container_type');
  pgm.createIndex('skus', 'active');
  pgm.createIndex('skus', 'deleted_at');

  // Add check constraint for price > cost
  pgm.addConstraint('skus', 'skus_price_greater_than_cost', {
    check: 'price > cost',
  });

  // Add check constraint for min_stock_level
  pgm.addConstraint('skus', 'skus_min_stock_non_negative', {
    check: 'min_stock_level >= 0',
  });

  // Add check constraint for max_stock_level
  pgm.addConstraint('skus', 'skus_max_stock_positive', {
    check: 'max_stock_level > 0',
  });

  // Add trigger to update updated_at timestamp
  pgm.sql(`
    CREATE TRIGGER update_skus_updated_at
    BEFORE UPDATE ON skus
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add comment to table
  pgm.sql(`
    COMMENT ON TABLE skus IS 'Product variants with size, variety, and container information';
  `);
};

exports.down = pgm => {
  // Drop trigger
  pgm.sql('DROP TRIGGER IF EXISTS update_skus_updated_at ON skus;');

  // Drop table and types
  pgm.dropTable('skus', { ifExists: true, cascade: true });
  pgm.dropType('sku_size', { ifExists: true });
  pgm.dropType('container_type', { ifExists: true });
};
