/* eslint-disable camelcase */

/**
 * Migration: Create invoice_payments junction table
 * Phase 23: Billing & Accounting
 *
 * Links existing `payments` records to invoices and auto-updates
 * invoice.paid_amount and invoice.status via a trigger.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Function: recompute invoice paid_amount + auto-advance status
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
    RETURNS TRIGGER AS $$
    DECLARE
      v_invoice_id  UUID;
      v_paid        DECIMAL(12,2);
      v_total       DECIMAL(12,2);
      v_new_status  invoice_status_enum;
    BEGIN
      v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

      SELECT COALESCE(SUM(amount_applied), 0)
        INTO v_paid
        FROM invoice_payments
       WHERE invoice_id = v_invoice_id;

      SELECT total_amount
        INTO v_total
        FROM invoices
       WHERE id = v_invoice_id;

      IF v_paid >= v_total THEN
        v_new_status := 'paid';
      ELSIF v_paid > 0 THEN
        v_new_status := 'partially_paid';
      ELSE
        v_new_status := 'issued';
      END IF;

      UPDATE invoices
         SET paid_amount    = v_paid,
             balance_amount = v_total - v_paid,
             status         = CASE
                                WHEN status IN ('issued', 'partially_paid', 'paid')
                                  THEN v_new_status
                                ELSE status   -- preserve 'draft' and 'void'
                              END,
             updated_at     = NOW()
       WHERE id = v_invoice_id;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create invoice_payments table
  pgm.createTable('invoice_payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    invoice_id: {
      type: 'uuid',
      notNull: true,
      references: 'invoices',
      onDelete: 'CASCADE',
    },
    payment_id: {
      type: 'uuid',
      notNull: true,
      references: 'payments',
      onDelete: 'RESTRICT',
    },
    amount_applied: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    applied_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    applied_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Constraints
  pgm.addConstraint('invoice_payments', 'chk_amount_applied_positive', {
    check: 'amount_applied > 0',
  });
  pgm.addConstraint('invoice_payments', 'uq_invoice_payment', {
    unique: ['invoice_id', 'payment_id'],
  });

  // Trigger: auto-update invoice paid_amount + status after every change
  pgm.createTrigger('invoice_payments', 'sync_invoice_paid_amount', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    function: 'update_invoice_paid_amount',
    level: 'ROW',
  });

  // Indexes
  pgm.createIndex('invoice_payments', 'invoice_id');
  pgm.createIndex('invoice_payments', 'payment_id');
};

exports.down = (pgm) => {
  pgm.dropTrigger('invoice_payments', 'sync_invoice_paid_amount', { ifExists: true });
  pgm.dropTable('invoice_payments', { ifExists: true, cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_invoice_paid_amount()');
};
