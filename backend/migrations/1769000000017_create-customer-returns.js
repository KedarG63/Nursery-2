/* eslint-disable camelcase */

/**
 * Migration: customer returns, with drift-free settlement and store credit.
 *
 * Customers bring back seedlings/saplings. Returns are accepted only if the
 * plants are still sellable, so every accepted return goes back into stock.
 *
 * ── THE MONEY MODEL ─────────────────────────────────────────────────────────
 *
 * A return of value R against an order with outstanding balance B splits
 * deterministically — this is arithmetic, not a choice:
 *
 *     order_offset = min(R, B)        cancels part of what they still owe
 *     owed_back    = R - order_offset  they already paid for these goods
 *
 * and only `owed_back` is settled by an explicit choice: Refund (money out) or
 * Store credit (carried to a future order). Without this split, staff could
 * refund cash on an order the customer never paid — a real loss that would
 * reconcile perfectly, because the refund itself would be correctly posted.
 *
 * Per return note:
 *     R = SUM(order_offset) + SUM(refund) + SUM(store_credit) + open
 *
 * Per customer, store credit:
 *     SUM(issued) = SUM(applied) + SUM(reversed) + available
 *
 * Both are enforced by database triggers, not only by the controller.
 *
 * ── RETURN VALUE IS PRORATED, NOT unit_price × qty ──────────────────────────
 *
 * total_amount = (subtotal - discount) * (1 + tax). Refunding unit_price × qty
 * on a discounted order would hand back more than the customer paid. The value
 * is prorated by total_amount / subtotal_amount, and computed CUMULATIVELY per
 * order so partial returns never drift by a paisa: returning every item always
 * sums to exactly total_amount.
 *
 * ── ORDERS ───────────────────────────────────────────────────────────────────
 *
 * `orders.credit_applied` holds credit set against an order's receivable — both
 * a return's own offset and store credit carried in from an earlier return. It
 * is recomputed from the ledgers, never incremented. total_amount is NEVER
 * changed, so sale history and revenue records stay intact.
 *
 *   - calculate_balance_amount now subtracts credit_applied.
 *   - update_order_paid_amount now caps at (total - credit_applied).
 *   - CHECK paid_amount + credit_applied <= total_amount makes collecting more
 *     than an order is worth impossible at the database, rather than silently
 *     clamped by GREATEST(0, …) in the balance trigger.
 *
 * Safety: additive tables/columns/enum values. Existing orders get
 * credit_applied = 0, so every balance computes exactly as before. No new enum
 * value is used inside this migration (Postgres forbids using an enum value in
 * the transaction that adds it).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Money going back OUT to a customer. Used by the controller later.
  pgm.addTypeValue('bank_ledger_source_type_enum', 'customer_return_refund', { ifNotExists: true });
  pgm.addTypeValue('cash_ledger_source_type_enum', 'customer_return_refund', { ifNotExists: true });

  pgm.createType('customer_return_status_enum', ['draft', 'accepted', 'cancelled']);
  // How a returned line went back into stock. Recorded so the stock effect is
  // auditable and never has to be inferred later.
  pgm.createType('customer_return_restock_enum', ['released_allocation', 'added_quantity']);
  pgm.createType('customer_return_settlement_type_enum', ['order_offset', 'refund', 'store_credit']);
  pgm.createType('store_credit_entry_type_enum', ['issued', 'applied', 'reversed']);

  // ── orders.credit_applied ──────────────────────────────────────────────────
  pgm.addColumns('orders', {
    credit_applied: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Credit set against this order\'s receivable (return offset + store credit). Recomputed, never incremented.',
    },
  }, { ifNotExists: true });

  pgm.addConstraint('orders', 'chk_orders_credit_applied_nonneg', {
    check: 'credit_applied >= 0',
  });
  // Nothing — cash or credit — can take an order beyond its value.
  pgm.addConstraint('orders', 'chk_orders_paid_plus_credit_within_total', {
    check: 'paid_amount + credit_applied <= total_amount',
  });

  // Balance now nets credit. GREATEST(0, ROUND(…)) is kept from migration
  // 1763100000003, which added it for float rounding; the CHECK above is what
  // actually prevents over-collection, so GREATEST can no longer hide one.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_balance_amount()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.balance_amount := GREATEST(0, ROUND(
        NEW.total_amount - NEW.paid_amount - COALESCE(NEW.credit_applied, 0), 2));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Paid can never exceed what is still collectable after credit.
  pgm.createFunction(
    'update_order_paid_amount',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    BEGIN
      IF NEW.order_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = LEAST(total_amount - COALESCE(credit_applied, 0), paid_amount + NEW.amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        UPDATE orders
        SET paid_amount = GREATEST(0, paid_amount - NEW.refund_amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;

      RETURN NEW;
    END;
    `
  );

  // ── customer_return_notes ──────────────────────────────────────────────────
  pgm.createTable('customer_return_notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    return_number: { type: 'varchar(30)', notNull: true, unique: true, comment: 'CRN-YYYYMMDD-XXXX' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers', onDelete: 'RESTRICT' },
    order_id: { type: 'uuid', notNull: true, references: 'orders', onDelete: 'RESTRICT' },
    return_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    status: { type: 'customer_return_status_enum', notNull: true, default: 'draft' },
    // Snapshot at acceptance; the split is fixed from then on.
    gross_amount: { type: 'numeric(12,2)', notNull: true, default: 0, comment: 'SUM(unit_price × qty), before proration' },
    return_amount: { type: 'numeric(12,2)', notNull: true, default: 0, comment: 'Prorated value — what the return is actually worth' },
    reason: { type: 'text' },
    notes: { type: 'text' },
    accepted_at: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('customer_return_notes', 'customer_id', { name: 'idx_crn_customer' });
  pgm.createIndex('customer_return_notes', 'order_id', { name: 'idx_crn_order' });
  pgm.createIndex('customer_return_notes', 'status', { name: 'idx_crn_status' });
  pgm.addConstraint('customer_return_notes', 'chk_crn_amounts_nonneg', {
    check: 'gross_amount >= 0 AND return_amount >= 0',
  });

  // ── customer_return_items ──────────────────────────────────────────────────
  pgm.createTable('customer_return_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    return_note_id: { type: 'uuid', notNull: true, references: 'customer_return_notes', onDelete: 'CASCADE' },
    order_item_id: { type: 'uuid', notNull: true, references: 'order_items', onDelete: 'RESTRICT' },
    sku_id: { type: 'uuid', notNull: true, references: 'skus', onDelete: 'RESTRICT' },
    lot_id: { type: 'uuid', notNull: true, references: 'lots', onDelete: 'RESTRICT',
      comment: 'Lot the plants go back into' },
    quantity: { type: 'integer', notNull: true },
    unit_price: { type: 'numeric(12,2)', notNull: true },
    restock_method: { type: 'customer_return_restock_enum',
      comment: 'Set on acceptance: released the sale\'s allocation, or added to lot quantity' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('customer_return_items', 'return_note_id', { name: 'idx_cri_note' });
  pgm.createIndex('customer_return_items', 'order_item_id', { name: 'idx_cri_order_item' });
  pgm.addConstraint('customer_return_items', 'chk_cri_quantity_positive', { check: 'quantity > 0' });
  pgm.addConstraint('customer_return_items', 'chk_cri_unit_price_nonneg', { check: 'unit_price >= 0' });

  // ── Freeze an order item once it has an accepted return ────────────────────
  // Every path that un-allocates an order item (DELETE, lot_id → NULL on
  // cancellation, lot change, quantity change) releases the FULL OLD.quantity
  // via trigger_update_lot_allocation / trigger_deallocate_lot_on_delete. An
  // accepted return has already released part of that allocation, so any of
  // those paths would release the returned units a second time — phantom stock.
  //
  // It is also the correct business rule: an item with an accepted return was
  // genuinely sold and partly given back. Cancelling or deleting the line would
  // erase a real sale. The return module is the only way to un-sell units.
  //
  // BEFORE, so it aborts the statement before the AFTER allocation triggers run.
  // status and other non-stock columns remain editable.
  pgm.createFunction(
    'guard_order_item_with_returns',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM customer_return_items cri
        JOIN customer_return_notes crn ON crn.id = cri.return_note_id
        WHERE cri.order_item_id = OLD.id
          AND crn.status = 'accepted'
          AND crn.deleted_at IS NULL
      ) THEN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION
            'Order item % has an accepted customer return and cannot be deleted. Record a return for the remaining units instead.',
            OLD.id;
        END IF;
        IF NEW.lot_id IS DISTINCT FROM OLD.lot_id OR NEW.quantity <> OLD.quantity THEN
          RAISE EXCEPTION
            'Order item % has an accepted customer return; its lot and quantity are frozen. Record a return for the remaining units instead of cancelling or editing.',
            OLD.id;
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    `
  );
  pgm.createTrigger('order_items', 'trg_guard_order_item_with_returns', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'guard_order_item_with_returns',
  });

  // ── customer_return_settlements ────────────────────────────────────────────
  pgm.createTable('customer_return_settlements', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    return_note_id: { type: 'uuid', notNull: true, references: 'customer_return_notes', onDelete: 'CASCADE' },
    settlement_type: { type: 'customer_return_settlement_type_enum', notNull: true },
    amount: { type: 'numeric(12,2)', notNull: true },
    settlement_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    // order_offset only
    target_order_id: { type: 'uuid', references: 'orders', onDelete: 'RESTRICT' },
    // refund only
    payment_source: { type: 'expense_payment_source_enum' },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('customer_return_settlements', 'return_note_id', { name: 'idx_crs_note' });
  pgm.createIndex('customer_return_settlements', 'target_order_id', {
    name: 'idx_crs_target_order', where: 'target_order_id IS NOT NULL',
  });
  pgm.addConstraint('customer_return_settlements', 'chk_crs_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('customer_return_settlements', 'chk_crs_shape', {
    check: `
      (settlement_type = 'order_offset'
        AND target_order_id IS NOT NULL
        AND payment_source IS NULL AND bank_account_id IS NULL AND cash_account_id IS NULL)
      OR
      (settlement_type = 'refund'
        AND target_order_id IS NULL
        AND (
          (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
          OR
          (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
        ))
      OR
      (settlement_type = 'store_credit'
        AND target_order_id IS NULL
        AND payment_source IS NULL AND bank_account_id IS NULL AND cash_account_id IS NULL)
    `,
  });

  // Settlements can never exceed a return's value.
  pgm.createFunction(
    'assert_customer_return_not_oversettled',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    DECLARE
      v_note_id uuid;
      v_settled numeric(12,2);
      v_value   numeric(12,2);
    BEGIN
      v_note_id := COALESCE(NEW.return_note_id, OLD.return_note_id);
      SELECT COALESCE(SUM(amount), 0) INTO v_settled
        FROM customer_return_settlements WHERE return_note_id = v_note_id;
      SELECT return_amount INTO v_value
        FROM customer_return_notes WHERE id = v_note_id;
      IF v_settled > v_value THEN
        RAISE EXCEPTION
          'Customer return % over-settled: settlements % exceed return value %',
          v_note_id, v_settled, v_value;
      END IF;
      RETURN NULL;
    END;
    `
  );
  pgm.createTrigger('customer_return_settlements', 'trg_crs_not_oversettled', {
    when: 'AFTER', operation: ['INSERT', 'UPDATE', 'DELETE'], level: 'ROW',
    function: 'assert_customer_return_not_oversettled',
  });

  // ── customer_store_credit_ledger ───────────────────────────────────────────
  // Deliberately NOT customer_credit: that table is trade credit (how much the
  // customer may owe US). This is store credit (how much WE owe THEM).
  pgm.createTable('customer_store_credit_ledger', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    customer_id: { type: 'uuid', notNull: true, references: 'customers', onDelete: 'RESTRICT' },
    entry_type: { type: 'store_credit_entry_type_enum', notNull: true },
    amount: { type: 'numeric(12,2)', notNull: true, comment: 'Always positive; entry_type gives the direction' },
    entry_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    // issued / reversed: the settlement that created or unwound the credit
    return_settlement_id: { type: 'uuid', references: 'customer_return_settlements', onDelete: 'RESTRICT' },
    // applied: the order the credit was spent on
    order_id: { type: 'uuid', references: 'orders', onDelete: 'RESTRICT' },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('customer_store_credit_ledger', 'customer_id', { name: 'idx_scl_customer' });
  pgm.createIndex('customer_store_credit_ledger', 'order_id', {
    name: 'idx_scl_order', where: 'order_id IS NOT NULL',
  });
  pgm.addConstraint('customer_store_credit_ledger', 'chk_scl_amount_positive', { check: 'amount > 0' });
  pgm.addConstraint('customer_store_credit_ledger', 'chk_scl_shape', {
    check: `
      (entry_type IN ('issued', 'reversed') AND return_settlement_id IS NOT NULL AND order_id IS NULL)
      OR
      (entry_type = 'applied' AND order_id IS NOT NULL AND return_settlement_id IS NULL)
    `,
  });

  // A customer's store credit balance can never go negative — they cannot
  // spend credit they do not have.
  pgm.createFunction(
    'assert_store_credit_not_negative',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `
    DECLARE
      v_customer uuid;
      v_balance  numeric(12,2);
    BEGIN
      v_customer := COALESCE(NEW.customer_id, OLD.customer_id);
      SELECT COALESCE(SUM(CASE WHEN entry_type = 'issued' THEN amount ELSE -amount END), 0)
        INTO v_balance
        FROM customer_store_credit_ledger
       WHERE customer_id = v_customer AND deleted_at IS NULL;
      IF v_balance < 0 THEN
        RAISE EXCEPTION
          'Store credit for customer % would go negative (balance %)', v_customer, v_balance;
      END IF;
      RETURN NULL;
    END;
    `
  );
  pgm.createTrigger('customer_store_credit_ledger', 'trg_scl_not_negative', {
    when: 'AFTER', operation: ['INSERT', 'UPDATE', 'DELETE'], level: 'ROW',
    function: 'assert_store_credit_not_negative',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('customer_store_credit_ledger', 'trg_scl_not_negative', { ifExists: true });
  pgm.dropFunction('assert_store_credit_not_negative', [], { ifExists: true });
  pgm.dropTable('customer_store_credit_ledger', { ifExists: true, cascade: true });

  pgm.dropTrigger('customer_return_settlements', 'trg_crs_not_oversettled', { ifExists: true });
  pgm.dropFunction('assert_customer_return_not_oversettled', [], { ifExists: true });
  pgm.dropTable('customer_return_settlements', { ifExists: true, cascade: true });

  pgm.dropTrigger('order_items', 'trg_guard_order_item_with_returns', { ifExists: true });
  pgm.dropFunction('guard_order_item_with_returns', [], { ifExists: true });
  pgm.dropTable('customer_return_items', { ifExists: true, cascade: true });
  pgm.dropTable('customer_return_notes', { ifExists: true, cascade: true });

  // Restore the order triggers exactly as they were before this migration.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_balance_amount()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.balance_amount := GREATEST(0, ROUND(NEW.total_amount - NEW.paid_amount, 2));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION update_order_paid_amount()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.order_id IS NULL THEN
        RETURN NEW;
      END IF;
      IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status != 'success') THEN
        UPDATE orders
        SET paid_amount = LEAST(total_amount, paid_amount + NEW.amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
        UPDATE orders
        SET paid_amount = GREATEST(0, paid_amount - NEW.refund_amount),
            updated_at  = NOW()
        WHERE id = NEW.order_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.dropConstraint('orders', 'chk_orders_paid_plus_credit_within_total', { ifExists: true });
  pgm.dropConstraint('orders', 'chk_orders_credit_applied_nonneg', { ifExists: true });
  pgm.dropColumns('orders', ['credit_applied'], { ifExists: true });

  pgm.dropType('store_credit_entry_type_enum', { ifExists: true });
  pgm.dropType('customer_return_settlement_type_enum', { ifExists: true });
  pgm.dropType('customer_return_restock_enum', { ifExists: true });
  pgm.dropType('customer_return_status_enum', { ifExists: true });
  // Ledger enum values intentionally left — dropping a value on a live table is unsafe.
};
