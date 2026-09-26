-- Books check — READ ONLY. Follows one-bill-diagnose.sql.
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db < scripts/one-bill-books-check.sql
--
-- F explains HOW payments escaped the Cash Book / Bank Ledger — never posted,
--   or posted and later removed. The two need opposite fixes.
-- G gives, per account, the balance the app shows today and what it would be
--   if the missing payments are real. Compare G with the real bank statement
--   and a physical cash count BEFORE anything is posted: if the app balance
--   already matches reality, the money reached the books some other way (for
--   example a hand-entered deposit) and posting it again would double it.

\echo '=== F. How the payments missing from the books got there ==='
WITH primary_cash AS (
  SELECT id FROM cash_accounts WHERE is_active ORDER BY sort_order, created_at LIMIT 1
),
missing AS (
  SELECT p.*
  FROM payments p
  WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
    AND p.payment_method IN ('cash', 'upi', 'card', 'bank_transfer')
    AND NOT EXISTS (SELECT 1 FROM cash_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM bank_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
),
removed AS (
  SELECT source_id, MIN(deleted_at) AS removed_at FROM (
    SELECT source_id, deleted_at FROM cash_ledger_entries
     WHERE source_type = 'customer_payment' AND deleted_at IS NOT NULL
    UNION ALL
    SELECT source_id, deleted_at FROM bank_ledger_entries
     WHERE source_type = 'customer_payment' AND deleted_at IS NOT NULL
  ) x GROUP BY source_id
)
SELECT
  CASE WHEN r.source_id IS NOT NULL
       THEN 'POSTED, then REMOVED (' || to_char(r.removed_at, 'YYYY-MM-DD') || ')'
       ELSE 'never posted' END                                        AS what_happened,
  CASE WHEN EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = m.id)
       THEN 'on an invoice' ELSE 'Payments page / order' END          AS recorded_through,
  CASE WHEN m.created_at < '2026-08-01' THEN 'a. before 1 Aug (backfill should have caught it)'
       WHEN m.created_at < '2026-08-23' THEN 'b. 1-22 Aug (invoice receipts did not post yet)'
       ELSE 'c. after 22 Aug' END                                     AS when_recorded,
  CASE WHEN m.payment_method <> 'cash' AND m.bank_account_id IS NULL THEN 'no bank account'
       ELSE 'account known' END                                       AS account,
  COUNT(*)            AS payments,
  SUM(m.amount)       AS amount
FROM missing m
LEFT JOIN removed r ON r.source_id = m.id
GROUP BY 1, 2, 3, 4
ORDER BY 1, 3, 2, 4;

\echo '=== G. Each account: what the app shows today, and what it would show if the missing payments are real ==='
\echo '    Compare "app_balance_today" with the REAL bank statement / cash count for the same day.'
WITH primary_cash AS (
  SELECT id FROM cash_accounts WHERE is_active ORDER BY sort_order, created_at LIMIT 1
),
accts AS (
  SELECT 'cash' AS kind, id, account_name FROM cash_accounts WHERE is_active
  UNION ALL
  SELECT 'bank', id, account_name FROM bank_accounts WHERE is_active
),
opening AS (
  SELECT a.*,
         (SELECT e.entry_date FROM (
            SELECT entry_date, amount FROM cash_ledger_entries
             WHERE a.kind = 'cash' AND cash_account_id = a.id AND entry_type = 'opening_balance' AND deleted_at IS NULL
            UNION ALL
            SELECT entry_date, amount FROM bank_ledger_entries
             WHERE a.kind = 'bank' AND bank_account_id = a.id AND entry_type = 'opening_balance' AND deleted_at IS NULL
          ) e ORDER BY e.entry_date DESC LIMIT 1) AS open_date,
         (SELECT e.amount FROM (
            SELECT entry_date, amount FROM cash_ledger_entries
             WHERE a.kind = 'cash' AND cash_account_id = a.id AND entry_type = 'opening_balance' AND deleted_at IS NULL
            UNION ALL
            SELECT entry_date, amount FROM bank_ledger_entries
             WHERE a.kind = 'bank' AND bank_account_id = a.id AND entry_type = 'opening_balance' AND deleted_at IS NULL
          ) e ORDER BY e.entry_date DESC LIMIT 1) AS open_amount
  FROM accts a
),
figures AS (
  SELECT o.*,
         -- Movements since the opening balance, exactly as the app sums them.
         COALESCE((SELECT SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END)
                     FROM cash_ledger_entries
                    WHERE o.kind = 'cash' AND cash_account_id = o.id
                      AND entry_type IN ('credit', 'debit') AND entry_date >= o.open_date AND deleted_at IS NULL), 0)
       + COALESCE((SELECT SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END)
                     FROM bank_ledger_entries
                    WHERE o.kind = 'bank' AND bank_account_id = o.id
                      AND entry_type IN ('credit', 'debit') AND entry_date >= o.open_date AND deleted_at IS NULL), 0)
           AS net_since_open,
         -- Hand-entered money in since the opening balance: may already stand in for missing payments.
         COALESCE((SELECT SUM(amount) FROM cash_ledger_entries
                    WHERE o.kind = 'cash' AND cash_account_id = o.id AND entry_type = 'credit'
                      AND source_type::text = 'manual' AND entry_date >= o.open_date AND deleted_at IS NULL), 0)
       + COALESCE((SELECT SUM(amount) FROM bank_ledger_entries
                    WHERE o.kind = 'bank' AND bank_account_id = o.id AND entry_type = 'credit'
                      AND source_type::text = 'manual' AND entry_date >= o.open_date AND deleted_at IS NULL), 0)
           AS manual_credits_since_open,
         -- Customer payments into this account, dated after its opening balance, not in its books.
         COALESCE((SELECT SUM(p.amount) FROM payments p
                    WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
                      AND p.payment_date >= o.open_date
                      AND ( (o.kind = 'cash' AND p.payment_method = 'cash'
                               AND COALESCE(p.cash_account_id, (SELECT id FROM primary_cash)) = o.id)
                         OR (o.kind = 'bank' AND p.payment_method IN ('upi', 'card', 'bank_transfer')
                               AND p.bank_account_id = o.id) )
                      AND NOT EXISTS (SELECT 1 FROM cash_ledger_entries e
                                       WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
                      AND NOT EXISTS (SELECT 1 FROM bank_ledger_entries e
                                       WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)), 0)
           AS missing_payments_since_open
  FROM opening o
)
SELECT kind, account_name, open_date, open_amount,
       open_amount + net_since_open                                AS app_balance_today,
       missing_payments_since_open,
       open_amount + net_since_open + missing_payments_since_open  AS balance_if_missing_are_real,
       manual_credits_since_open
FROM figures
ORDER BY kind, account_name;

\echo '=== H. UPI / bank payments with NO bank account: which account did they land in? (check each UTR) ==='
SELECT p.payment_date::date, c.name AS customer, o.order_number, p.payment_method, p.amount,
       COALESCE(p.receipt_number, p.gateway_transaction_id, '') AS receipt_or_utr,
       CASE WHEN EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = p.id) THEN 'yes' ELSE 'no' END AS on_invoice
FROM payments p
JOIN orders o ON o.id = p.order_id
JOIN customers c ON c.id = p.customer_id
WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
  AND p.payment_method IN ('upi', 'card', 'bank_transfer') AND p.bank_account_id IS NULL
ORDER BY p.payment_date;
