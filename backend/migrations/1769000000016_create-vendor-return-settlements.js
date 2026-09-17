/* eslint-disable camelcase */

/**
 * Migration: settlement ledger for vendor return notes.
 *
 * WHY THIS EXISTS — the previous model lost money.
 *
 * `vendor_return_notes` carried a single `credited_amount` scalar and a single
 * `credited_to_purchase_id` FK, and `applyCredit` set status='credited'
 * unconditionally — even for a PARTIAL application. Since both applyCredit and
 * getAvailableCredits require status='accepted', a ₹10,000 return part-applied
 * as ₹4,000 left ₹6,000 permanently invisible and unusable. Separately,
 * `credited_amount` was overwritten rather than accumulated, so had the status
 * bug been fixed alone the same credit could have been spent twice.
 *
 * A return also could not be part-offset and part-refunded, and there was
 * nowhere to record a vendor paying money back at all.
 *
 * One row per settlement event makes the invariant provable:
 *
 *     return_amount = SUM(credit_offset) + SUM(refund) + open_balance
 *
 * Safety:
 *   - Additive: one new table, one new enum, two enum VALUES, one trigger.
 *   - Existing `credited_amount` / `credited_to_purchase_id` are left in place
 *     and kept in sync by the controller, so nothing reading them breaks.
 *   - The backfill RECOVERS stranded credit: any note credited for less than
 *     its full value goes back to 'accepted' so the remainder is usable again.
 *   - No new enum value is used inside this migration. Postgres forbids using
 *     an enum value in the same transaction that adds it, so the backfill
 *     deliberately uses only the pre-existing 'accepted' / 'credited' values.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Money coming back FROM a vendor. Distinct from 'vendor_payment', which is
  // money going out. Added here, used by the controller in a later transaction.
  pgm.addTypeValue('bank_ledger_source_type_enum', 'vendor_return_refund', { ifNotExists: true });
  pgm.addTypeValue('cash_ledger_source_type_enum', 'vendor_return_refund', { ifNotExists: true });

  pgm.createType('vendor_return_settlement_type_enum', ['credit_offset', 'refund']);

  pgm.createTable('vendor_return_settlements', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    return_note_id: {
      type: 'uuid',
      notNull: true,
      references: 'vendor_return_notes',
      onDelete: 'CASCADE',
    },
    settlement_type: { type: 'vendor_return_settlement_type_enum', notNull: true },
    amount: { type: 'numeric(12,2)', notNull: true },
    settlement_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },

    // credit_offset only — the bill this credit was applied against
    target_purchase_id: { type: 'uuid', references: 'seed_purchases', onDelete: 'RESTRICT' },

    // refund only — where the money the vendor paid back landed
    payment_source: { type: 'expense_payment_source_enum' },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },

    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('vendor_return_settlements', 'return_note_id', { name: 'idx_vrs_note' });
  pgm.createIndex('vendor_return_settlements', 'target_purchase_id', {
    name: 'idx_vrs_target', where: 'target_purchase_id IS NOT NULL',
  });

  pgm.addConstraint('vendor_return_settlements', 'chk_vrs_amount_positive', {
    check: 'amount > 0',
  });

  // A credit offset names a bill and no account; a refund names an account and
  // no bill. Exactly one shape, enforced by the database.
  pgm.addConstraint('vendor_return_settlements', 'chk_vrs_shape', {
    check: `
      (settlement_type = 'credit_offset'
        AND target_purchase_id IS NOT NULL
        AND payment_source IS NULL AND bank_account_id IS NULL AND cash_account_id IS NULL)
      OR
      (settlement_type = 'refund'
        AND target_purchase_id IS NULL
        AND (
          (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
          OR
          (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
        ))
    `,
  });

  // ── The guarantee ──────────────────────────────────────────────────────────
  // Settlements can never exceed what was returned. Enforced in the database
  // rather than only in the controller, so a hand-written SQL fix cannot break
  // the invariant either.
  pgm.createFunction(
    'assert_vendor_return_not_oversettled',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    DECLARE
      v_note_id uuid;
      v_settled numeric(12,2);
      v_return  numeric(12,2);
    BEGIN
      v_note_id := COALESCE(NEW.return_note_id, OLD.return_note_id);

      SELECT COALESCE(SUM(amount), 0) INTO v_settled
      FROM vendor_return_settlements WHERE return_note_id = v_note_id;

      SELECT return_amount INTO v_return
      FROM vendor_return_notes WHERE id = v_note_id;

      -- half-paisa tolerance for numeric rounding
      IF v_settled > v_return + 0.005 THEN
        RAISE EXCEPTION
          'Vendor return % over-settled: settlements % exceed return amount %',
          v_note_id, v_settled, v_return;
      END IF;

      RETURN NULL;
    END;
    `
  );

  pgm.createTrigger('vendor_return_settlements', 'trg_vrs_not_oversettled', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'assert_vendor_return_not_oversettled',
  });

  // ── Backfill: turn existing credits into settlement rows ───────────────────
  // Recovers stranded credit — a note credited for less than its full value
  // goes back to 'accepted' so the remainder becomes usable again.
  pgm.sql(`
    INSERT INTO vendor_return_settlements
      (return_note_id, settlement_type, amount, settlement_date, target_purchase_id, notes, created_by)
    SELECT
      vrn.id,
      'credit_offset',
      vrn.credited_amount,
      COALESCE(vrn.credited_at::date, vrn.return_date, CURRENT_DATE),
      vrn.credited_to_purchase_id,
      'Backfilled from credited_amount',
      vrn.updated_by
    FROM vendor_return_notes vrn
    WHERE vrn.deleted_at IS NULL
      AND vrn.credited_amount IS NOT NULL
      AND vrn.credited_amount > 0
      AND vrn.credited_to_purchase_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendor_return_settlements s WHERE s.return_note_id = vrn.id
      );

    -- Partially-settled notes return to 'accepted' so the remaining credit is
    -- visible and usable again. Fully-settled notes stay 'credited'.
    UPDATE vendor_return_notes vrn
       SET status = 'accepted', updated_at = NOW()
     WHERE vrn.deleted_at IS NULL
       AND vrn.status = 'credited'
       AND COALESCE(vrn.credited_amount, 0) < vrn.return_amount - 0.005;
  `);
};

exports.down = (pgm) => {
  pgm.dropTrigger('vendor_return_settlements', 'trg_vrs_not_oversettled', { ifExists: true });
  pgm.dropFunction('assert_vendor_return_not_oversettled', [], { ifExists: true });
  pgm.dropTable('vendor_return_settlements', { ifExists: true, cascade: true });
  pgm.dropType('vendor_return_settlement_type_enum', { ifExists: true });
  // Ledger enum values intentionally left in place — dropping an enum value on
  // a live table is unsafe, and an unused value is harmless.
};
