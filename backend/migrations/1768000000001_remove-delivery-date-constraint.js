/**
 * Remove chk_delivery_date_after_order constraint to allow backdated orders
 */
exports.up = (pgm) => {
  pgm.dropConstraint('orders', 'chk_delivery_date_after_order', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.addConstraint('orders', 'chk_delivery_date_after_order', {
    check: 'delivery_date >= order_date::date'
  });
};
