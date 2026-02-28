/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  console.log('Adding performance indexes...');

  // Users table indexes
  pgm.addIndex('users', 'phone', { name: 'idx_users_phone', ifNotExists: true });
  pgm.addIndex('users', 'created_at', { name: 'idx_users_created_at', ifNotExists: true });

  // Products table indexes
  pgm.addIndex('products', 'created_at', { name: 'idx_products_created_at', ifNotExists: true });

  // Full-text search on name and description
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_products_search ON products
    USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')))
  `);

  // Lots table indexes
  pgm.addIndex('lots', ['sku_id', 'growth_stage'], { name: 'idx_lots_sku_growth', ifNotExists: true });
  pgm.addIndex('lots', 'current_location', { name: 'idx_lots_location', ifNotExists: true });

  // Customers table indexes
  pgm.addIndex('customers', 'phone', { name: 'idx_customers_phone', ifNotExists: true });
  pgm.addIndex('customers', 'customer_type', { name: 'idx_customers_type', ifNotExists: true });
  pgm.addIndex('customers', 'created_at', { name: 'idx_customers_created_at', ifNotExists: true });

  // Orders table indexes
  pgm.addIndex('orders', 'customer_id', { name: 'idx_orders_customer_id', ifNotExists: true });
  pgm.addIndex('orders', 'status', { name: 'idx_orders_status', ifNotExists: true });
  pgm.addIndex('orders', 'order_date', { name: 'idx_orders_order_date', ifNotExists: true });
  pgm.addIndex('orders', ['customer_id', 'order_date'], { name: 'idx_orders_customer_date', ifNotExists: true });
  pgm.addIndex('orders', ['status', 'order_date'], { name: 'idx_orders_status_date', ifNotExists: true });

  // Order items table indexes
  pgm.addIndex('order_items', 'order_id', { name: 'idx_order_items_order_id', ifNotExists: true });
  pgm.addIndex('order_items', 'sku_id', { name: 'idx_order_items_sku_id', ifNotExists: true });
  pgm.addIndex('order_items', 'lot_id', { name: 'idx_order_items_lot_id', ifNotExists: true });

  // Payments table indexes
  pgm.addIndex('payments', 'order_id', { name: 'idx_payments_order_id', ifNotExists: true });
  pgm.addIndex('payments', 'customer_id', { name: 'idx_payments_customer_id', ifNotExists: true });
  pgm.addIndex('payments', 'status', { name: 'idx_payments_status', ifNotExists: true });
  pgm.addIndex('payments', 'payment_date', { name: 'idx_payments_payment_date', ifNotExists: true });
  pgm.addIndex('payments', 'payment_method', { name: 'idx_payments_method', ifNotExists: true });
  pgm.addIndex('payments', ['customer_id', 'payment_date'], { name: 'idx_payments_customer_date', ifNotExists: true });

  // Delivery routes table indexes
  pgm.addIndex('delivery_routes', 'driver_id', { name: 'idx_routes_driver_id', ifNotExists: true });
  pgm.addIndex('delivery_routes', 'status', { name: 'idx_routes_status', ifNotExists: true });
  pgm.addIndex('delivery_routes', 'route_date', { name: 'idx_routes_route_date', ifNotExists: true });

  // Route stops table indexes
  pgm.addIndex('route_stops', 'route_id', { name: 'idx_stops_route_id', ifNotExists: true });
  pgm.addIndex('route_stops', 'order_id', { name: 'idx_stops_order_id', ifNotExists: true });

  // WhatsApp messages indexes
  pgm.addIndex('whatsapp_messages', 'customer_id', { name: 'idx_whatsapp_customer_id', ifNotExists: true });
  pgm.addIndex('whatsapp_messages', 'status', { name: 'idx_whatsapp_status', ifNotExists: true });
  pgm.addIndex('whatsapp_messages', 'created_at', { name: 'idx_whatsapp_created_at', ifNotExists: true });
  pgm.addIndex('whatsapp_messages', ['customer_id', 'created_at'], { name: 'idx_whatsapp_customer_date', ifNotExists: true });

  console.log('Performance indexes added successfully');
};

exports.down = (pgm) => {
  console.log('Removing performance indexes...');

  const indexes = [
    'idx_users_phone', 'idx_users_created_at',
    'idx_products_created_at', 'idx_products_search',
    'idx_lots_sku_growth', 'idx_lots_location',
    'idx_customers_phone', 'idx_customers_type', 'idx_customers_created_at',
    'idx_orders_customer_id', 'idx_orders_status', 'idx_orders_order_date',
    'idx_orders_customer_date', 'idx_orders_status_date',
    'idx_order_items_order_id', 'idx_order_items_sku_id', 'idx_order_items_lot_id',
    'idx_payments_order_id', 'idx_payments_customer_id', 'idx_payments_status',
    'idx_payments_payment_date', 'idx_payments_method', 'idx_payments_customer_date',
    'idx_routes_driver_id', 'idx_routes_status', 'idx_routes_route_date',
    'idx_stops_route_id', 'idx_stops_order_id',
    'idx_whatsapp_customer_id', 'idx_whatsapp_status', 'idx_whatsapp_created_at', 'idx_whatsapp_customer_date',
  ];

  for (const index of indexes) {
    try {
      pgm.dropIndex(null, index, { ifExists: true });
    } catch (error) {
      console.log(`Could not drop index ${index}:`, error.message);
    }
  }

  console.log('Performance indexes removed');
};
