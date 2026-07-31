/* eslint-disable camelcase */

/**
 * Migration: backfill the Cash Book / Bank Ledger with historical customer
 * payments that were never posted there.
 *
 * Going forward, recording a customer payment posts a matching CREDIT to the
 * cash/bank ledger (Phase 2). This heals the PAST: every successful,
 * non-deleted payment that has no `customer_payment` ledger entry yet gets one.
 *
 *   - cash payments        -> credit the primary (first active) Cash Book drawer
 *   - bank/upi/card/cheque -> credit their bank_account_id (skipped when NULL,
 *                             since we can't know which bank — those remain
 *                             available to the manual bank "sync from payments")
 *
 * Safety:
 *   - Idempotent: guarded by NOT EXISTS on source_type='customer_payment' +
 *     source_id, so re-running inserts nothing and it will not double-post
 *     entries the bank "sync from payments" action already created.
 *   - Only reads existing rows; adds ledger credit entries. Changes no payment
 *     or order data. It DOES change Cash-in-Hand / bank balances upward to
 *     reflect money that was actually received — that is the intended fix.
 *   - Columns mirror postSourceCredit exactly.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      v_cash_id  UUID;
      v_cash_n   INT := 0;
      v_bank_n   INT := 0;
    BEGIN
      SELECT id INTO v_cash_id
      FROM cash_accounts
      WHERE is_active = true
      ORDER BY sort_order, created_at
      LIMIT 1;

      -- Cash payments -> primary cash drawer
      IF v_cash_id IS NOT NULL THEN
        INSERT INTO cash_ledger_entries
          (cash_account_id, entry_date, entry_type, amount, party_name, narration,
           reference_number, source_type, source_id, created_by)
        SELECT
          v_cash_id,
          COALESCE(p.payment_date, p.created_at::date),
          'credit',
          p.amount,
          COALESCE(c.name, 'Customer'),
          'Customer payment (backfill)',
          COALESCE(p.receipt_number, p.transaction_id),
          'customer_payment',
          p.id,
          p.created_by
        FROM payments p
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.status = 'success'
          AND p.deleted_at IS NULL
          AND p.payment_method = 'cash'
          AND p.amount > 0
          AND NOT EXISTS (
            SELECT 1 FROM cash_ledger_entries cle
            WHERE cle.source_type = 'customer_payment' AND cle.source_id = p.id AND cle.deleted_at IS NULL
          );
        GET DIAGNOSTICS v_cash_n = ROW_COUNT;
      END IF;

      -- Bank/UPI/card/cheque payments that name a bank account -> that bank ledger
      INSERT INTO bank_ledger_entries
        (bank_account_id, entry_date, entry_type, amount, party_name, narration,
         reference_number, source_type, source_id, created_by)
      SELECT
        p.bank_account_id,
        COALESCE(p.payment_date, p.created_at::date),
        'credit',
        p.amount,
        COALESCE(c.name, 'Customer'),
        'Customer payment (backfill)',
        COALESCE(p.receipt_number, p.transaction_id),
        'customer_payment',
        p.id,
        p.created_by
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.status = 'success'
        AND p.deleted_at IS NULL
        AND p.payment_method IN ('bank_transfer', 'upi', 'card')
        AND p.bank_account_id IS NOT NULL
        AND p.amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM bank_ledger_entries ble
          WHERE ble.source_type = 'customer_payment' AND ble.source_id = p.id AND ble.deleted_at IS NULL
        );
      GET DIAGNOSTICS v_bank_n = ROW_COUNT;

      RAISE NOTICE 'customer payment ledger backfill: % cash + % bank entries posted', v_cash_n, v_bank_n;
    END $$;
  `);
};

exports.down = () => {
  // Reversible in principle, but removing the credits would silently understate
  // real cash/bank balances again. Intentionally a no-op — reverse specific
  // entries manually if ever needed.
};
