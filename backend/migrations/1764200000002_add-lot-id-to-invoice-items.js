/* eslint-disable camelcase */

/**
 * Migration: Add lot_id to invoice_items for seed traceability on invoices
 *
 * Allows each invoice line item to be traced back to the lot (and therefore
 * the seed purchase and vendor) it was sourced from.
 *
 * For invoices created from orders the lot_id is auto-copied from
 * order_items.lot_id at creation time. For standalone invoices it can be
 * supplied directly.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('invoice_items', {
    lot_id: {
      type: 'uuid',
      references: 'lots',
      onDelete: 'SET NULL',
      notNull: false,
    },
  });

  pgm.createIndex('invoice_items', 'lot_id', {
    name: 'idx_invoice_items_lot_id',
    where: 'lot_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('invoice_items', 'lot_id', { name: 'idx_invoice_items_lot_id', ifExists: true });
  pgm.dropColumns('invoice_items', ['lot_id']);
};
