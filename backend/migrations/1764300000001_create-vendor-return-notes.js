/* eslint-disable camelcase */

/**
 * Migration: Vendor return notes for unused/expiring seed packets
 *
 * Tracks partial or full returns of seed packets to a vendor before expiry.
 * The return amount is held as a credit that can be applied to a future
 * purchase payment from the same vendor.
 *
 * Also adds tracking columns to seed_purchases:
 *   - packets_returned  — updated when a return note is accepted
 *   - vendor_credit_applied — total credit deducted from this purchase
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── Status enum ─────────────────────────────────────────────────────────────
  pgm.createType('vendor_return_status_enum', [
    'draft',      // created, not yet submitted to vendor
    'submitted',  // formally sent to vendor, awaiting acceptance
    'accepted',   // vendor confirmed receipt and credit
    'rejected',   // vendor refused the return
    'credited',   // credit has been applied to a purchase payment
  ]);

  // ── Main returns table ───────────────────────────────────────────────────────
  pgm.createTable('vendor_return_notes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    return_number: {
      type: 'varchar(30)',
      notNull: true,
      unique: true,
      comment: 'Auto-generated: VRN-YYYYMMDD-XXXX',
    },
    seed_purchase_id: {
      type: 'uuid',
      notNull: true,
      references: 'seed_purchases',
      onDelete: 'RESTRICT',
    },
    vendor_id: {
      type: 'uuid',
      notNull: true,
      references: 'vendors',
      onDelete: 'RESTRICT',
    },
    return_date: {
      type: 'date',
      notNull: true,
      default: pgm.func('CURRENT_DATE'),
    },
    packets_returned: {
      type: 'integer',
      notNull: true,
      comment: 'Number of packets being returned',
    },
    cost_per_packet: {
      type: 'decimal(10,4)',
      notNull: true,
      comment: 'Copied from the original seed_purchase at time of creating return',
    },
    return_amount: {
      type: 'decimal(12,2)',
      notNull: true,
      comment: 'packets_returned × cost_per_packet',
    },
    reason: {
      type: 'text',
    },
    status: {
      type: 'vendor_return_status_enum',
      notNull: true,
      default: 'draft',
    },
    // Filled when this credit has been applied to another purchase payment
    credited_to_purchase_id: {
      type: 'uuid',
      references: 'seed_purchases',
      onDelete: 'SET NULL',
    },
    credited_amount: {
      type: 'decimal(12,2)',
    },
    credited_at: {
      type: 'timestamp',
    },
    notes: {
      type: 'text',
    },
    // Audit
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: {
      type: 'timestamp',
    },
  });

  pgm.createIndex('vendor_return_notes', 'seed_purchase_id', { name: 'idx_vrn_seed_purchase_id' });
  pgm.createIndex('vendor_return_notes', 'vendor_id',        { name: 'idx_vrn_vendor_id' });
  pgm.createIndex('vendor_return_notes', 'status',           { name: 'idx_vrn_status' });
  pgm.createIndex('vendor_return_notes', 'credited_to_purchase_id', {
    name: 'idx_vrn_credited_to_purchase',
    where: 'credited_to_purchase_id IS NOT NULL',
  });

  // ── Constraints ──────────────────────────────────────────────────────────────
  pgm.addConstraint('vendor_return_notes', 'chk_vrn_packets_positive', {
    check: 'packets_returned > 0',
  });
  pgm.addConstraint('vendor_return_notes', 'chk_vrn_return_amount_positive', {
    check: 'return_amount > 0',
  });

  // ── Return number auto-generator ─────────────────────────────────────────────
  pgm.createFunction(
    'generate_return_number',
    [],
    { returns: 'TRIGGER', language: 'plpgsql', replace: true },
    `
    DECLARE
      date_str TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
      seq      INT;
    BEGIN
      SELECT COUNT(*) + 1
        INTO seq
        FROM vendor_return_notes
       WHERE return_number LIKE 'VRN-' || date_str || '-%';
      NEW.return_number := 'VRN-' || date_str || '-' || LPAD(seq::TEXT, 4, '0');
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('vendor_return_notes', 'trg_generate_return_number', {
    when: 'BEFORE',
    operation: 'INSERT',
    function: 'generate_return_number',
    level: 'ROW',
  });

  // ── updated_at trigger ───────────────────────────────────────────────────────
  pgm.createTrigger('vendor_return_notes', 'update_vendor_return_notes_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // ── Add tracking columns to seed_purchases ───────────────────────────────────
  pgm.addColumns('seed_purchases', {
    packets_returned: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total packets returned to vendor (sum of accepted return notes)',
    },
    vendor_credit_applied: {
      type: 'decimal(12,2)',
      notNull: true,
      default: 0,
      comment: 'Total vendor return credit applied against this purchase payment',
    },
  });
};

exports.down = (pgm) => {
  // Remove columns added to seed_purchases
  pgm.dropColumns('seed_purchases', ['packets_returned', 'vendor_credit_applied'], { ifExists: true });

  // Drop triggers and functions
  pgm.dropTrigger('vendor_return_notes', 'update_vendor_return_notes_updated_at', { ifExists: true });
  pgm.dropTrigger('vendor_return_notes', 'trg_generate_return_number',            { ifExists: true });
  pgm.dropFunction('generate_return_number', [],                                   { ifExists: true });

  // Drop table and type
  pgm.dropTable('vendor_return_notes', { ifExists: true, cascade: true });
  pgm.dropType('vendor_return_status_enum', { ifExists: true });
};
