-- Worklist 2: payments missing from the Cash Book / Bank Ledger — READ ONLY.
-- One CSV row per payment counted as received but posted to no ledger.
-- (Worklist 1, one-bill-review-sheet.sql, covers duplicates on over-collected sales.)
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -q \
--     < scripts/one-bill-unposted-sheet.sql > ~/one-bill-unposted.csv
--
-- For each row, look for the payment on the bank statements (match date, amount
-- and customer — most have no real UTR, "MANUAL-…" is a system placeholder):
--   found on a statement  → actually_received_as = upi / bank_transfer / card,
--                           bank_account = the account it landed in
--   not on any statement  → actually_received_as = cash
--   the same money recorded twice (see worklist 1) → actually_received_as = duplicate
--   never received at all → actually_received_as = not_received
-- Rows marked affects_todays_balance = no are dated before that account's
-- opening balance: they are posted for history only and change no balance.

COPY (
  WITH inv AS (
    SELECT DISTINCT ON (order_id) order_id, invoice_number, total_amount
    FROM invoices
    WHERE order_id IS NOT NULL AND deleted_at IS NULL AND status IN ('issued', 'partially_paid', 'paid')
    ORDER BY order_id, created_at DESC
  ),
  sale AS (
    SELECT o.id, inv.invoice_number,
           CASE WHEN o.status = 'cancelled' THEN 0 ELSE COALESCE(inv.total_amount, o.total_amount) END AS bill_total,
           COALESCE((SELECT SUM(p.amount - COALESCE(p.refund_amount, 0)) FROM payments p
                      WHERE p.order_id = o.id AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')), 0)
         + COALESCE((SELECT SUM(s.amount) FROM customer_return_settlements s
                      WHERE s.target_order_id = o.id AND s.settlement_type = 'order_offset'), 0)
         + COALESCE((SELECT SUM(l.amount) FROM customer_store_credit_ledger l
                      WHERE l.order_id = o.id AND l.entry_type = 'applied' AND l.deleted_at IS NULL), 0) AS settled
    FROM orders o LEFT JOIN inv ON inv.order_id = o.id
    WHERE o.deleted_at IS NULL
  ),
  primary_cash AS (
    SELECT id FROM cash_accounts WHERE is_active ORDER BY sort_order, created_at LIMIT 1
  ),
  cash_open AS (
    SELECT MAX(entry_date) AS d FROM cash_ledger_entries
    WHERE entry_type = 'opening_balance' AND deleted_at IS NULL
      AND cash_account_id = (SELECT id FROM primary_cash)
  )
  SELECT
    p.payment_date::date                                        AS payment_date,
    c.name                                                      AS customer,
    c.phone,
    o.order_number,
    COALESCE(s.invoice_number, '')                              AS invoice_number,
    p.amount,
    p.payment_method                                            AS recorded_as,
    COALESCE(ba.account_name, '')                               AS recorded_bank_account,
    COALESCE(p.receipt_number, p.gateway_transaction_id, '')    AS receipt_or_utr,
    CASE WHEN EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = p.id)
         THEN 'yes' ELSE 'NO' END                               AS shown_on_invoice,
    CASE WHEN s.settled > s.bill_total + 0.005
         THEN 'YES - see worklist 1' ELSE 'no' END              AS sale_over_collected,
    CASE WHEN p.payment_method = 'cash'
              AND p.payment_date < (SELECT d FROM cash_open)            THEN 'no'
         WHEN p.payment_method <> 'cash' AND p.bank_account_id IS NOT NULL
              AND p.payment_date < (SELECT MAX(e.entry_date) FROM bank_ledger_entries e
                                     WHERE e.bank_account_id = p.bank_account_id
                                       AND e.entry_type = 'opening_balance' AND e.deleted_at IS NULL)
                                                                         THEN 'no'
         ELSE 'yes' END                                         AS affects_todays_balance,
    COALESCE(u.full_name, '')                                   AS recorded_by,
    to_char(p.created_at, 'YYYY-MM-DD HH24:MI')                 AS recorded_at,
    p.id                                                        AS payment_id,
    ''                                                          AS actually_received_as,
    ''                                                          AS bank_account,
    ''                                                          AS decision_notes
  FROM payments p
  JOIN orders o     ON o.id = p.order_id
  JOIN customers c  ON c.id = p.customer_id
  JOIN sale s       ON s.id = p.order_id
  LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
  LEFT JOIN users u ON u.id = COALESCE(p.created_by, p.received_by)
  WHERE p.deleted_at IS NULL
    AND p.status IN ('success', 'refunded')
    AND p.payment_method IN ('cash', 'upi', 'card', 'bank_transfer')
    AND NOT EXISTS (SELECT 1 FROM cash_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM bank_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
  ORDER BY p.payment_date, c.name
) TO STDOUT WITH CSV HEADER;
