/* eslint-disable camelcase */

/**
 * Migration: Create seed_purchase_payments table
 * Phase 22: Purchase & Seeds Management
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('seed_purchase_payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    seed_purchase_id: {
      type: 'uuid',
      notNull: true,
      references: 'seed_purchases',
      onDelete: 'CASCADE',
    },
    payment_date: {
      type: 'date',
      notNull: true,
    },
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    payment_method: {
      type: 'varchar(50)',
    },
    transaction_reference: {
      type: 'varchar(100)',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('seed_purchase_payments', 'seed_purchase_id');
  pgm.createIndex('seed_purchase_payments', 'payment_date');

  // Trigger to update seed_purchases payment status
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      total_paid DECIMAL(12,2);
      grand_total DECIMAL(12,2);
      purchase_id UUID;
    BEGIN
      purchase_id := COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO total_paid
      FROM seed_purchase_payments
      WHERE seed_purchase_id = purchase_id;

      SELECT sp.grand_total INTO grand_total
      FROM seed_purchases sp
      WHERE sp.id = purchase_id;

      UPDATE seed_purchases
      SET
        amount_paid = total_paid,
        payment_status = CASE
          WHEN total_paid = 0 THEN 'pending'
          WHEN total_paid >= grand_total THEN 'paid'
          ELSE 'partial'
        END
      WHERE id = purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_insert', {
    when: 'AFTER',
    operation: 'INSERT',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_update', {
    when: 'AFTER',
    operation: 'UPDATE',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_delete', {
    when: 'AFTER',
    operation: 'DELETE',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_delete', { ifExists: true });
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_update', { ifExists: true });
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_insert', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_seed_purchase_payment_status()');
  pgm.dropTable('seed_purchase_payments', { ifExists: true, cascade: true });
};
