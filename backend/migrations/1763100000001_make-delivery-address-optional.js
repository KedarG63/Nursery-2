/**
 * Make delivery_address_id nullable on orders table
 * Walk-in / counter pickup orders don't have a delivery address
 */
exports.up = (pgm) => {
  pgm.alterColumn('orders', 'delivery_address_id', {
    notNull: false,
  });

  // Also make delivery_date nullable for immediate counter sales
  pgm.alterColumn('orders', 'delivery_date', {
    notNull: false,
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('orders', 'delivery_address_id', {
    notNull: true,
  });

  pgm.alterColumn('orders', 'delivery_date', {
    notNull: true,
  });
};
