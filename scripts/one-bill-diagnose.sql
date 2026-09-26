-- Follow-up to one-bill-sizing.sql — READ ONLY, aggregates and short lists.
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db < scripts/one-bill-diagnose.sql

\echo '=== A. The payments missing from the Cash Book / Bank Ledger, sorted by why ==='
\echo '    A ledger balance = its LATEST opening balance + entries after it. A payment dated'
\echo '    before that opening balance is already inside it; one dated after it is genuinely missing.'
WITH primary_cash AS (
  SELECT id FROM cash_accounts WHERE is_active ORDER BY sort_order, created_at LIMIT 1
),
missing AS (
  SELECT p.id, p.amount, p.payment_date::date AS payment_date, p.payment_method, p.bank_account_id,
         CASE WHEN p.payment_method = 'cash'
              THEN COALESCE(p.cash_account_id, (SELECT id FROM primary_cash)) END AS cash_acct
  FROM payments p
  WHERE p.deleted_at IS NULL
    AND p.status IN ('success', 'refunded')
    AND NOT EXISTS (SELECT 1 FROM cash_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM bank_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
),
opening AS (
  SELECT m.*,
         CASE WHEN m.payment_method = 'cash' THEN
           (SELECT MAX(entry_date) FROM cash_ledger_entries e
             WHERE e.cash_account_id = m.cash_acct AND e.entry_type = 'opening_balance' AND e.deleted_at IS NULL)
         ELSE
           (SELECT MAX(entry_date) FROM bank_ledger_entries e
             WHERE e.bank_account_id = m.bank_account_id AND e.entry_type = 'opening_balance' AND e.deleted_at IS NULL)
         END AS latest_opening
  FROM missing m
)
SELECT
  CASE
    WHEN payment_method NOT IN ('cash', 'upi', 'card', 'bank_transfer')
      THEN '1. method "' || payment_method || '": no money moved, yet it counts as PAID'
    WHEN payment_method <> 'cash' AND bank_account_id IS NULL
      THEN '2. UPI/card/bank with NO bank account chosen: cannot be in any ledger'
    WHEN latest_opening IS NULL
      THEN '3. that account has NO opening balance set'
    WHEN payment_date < latest_opening
      THEN '4. before the latest opening balance: already inside it, today''s balance unaffected'
    ELSE '5. AFTER the latest opening balance: today''s balance is SHORT by this'
  END AS why,
  COUNT(*)         AS payments,
  SUM(amount)      AS amount,
  MIN(payment_date) AS earliest,
  MAX(payment_date) AS latest
FROM opening
GROUP BY 1
ORDER BY 1;

\echo '=== B. All payments by method (is "credit" or "cod" used as a payment at all?) ==='
SELECT payment_method, COUNT(*) AS payments, SUM(amount) AS amount
FROM payments
WHERE deleted_at IS NULL AND status IN ('success', 'refunded')
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== C. Invoices that are not on exactly one live order ==='
SELECT 'on a cancelled or deleted order' AS what, i.invoice_number, o.order_number,
       o.status::text AS order_status, i.total_amount, i.paid_amount
FROM invoices i JOIN orders o ON o.id = i.order_id
WHERE i.deleted_at IS NULL AND i.status IN ('issued', 'partially_paid', 'paid')
  AND (o.deleted_at IS NOT NULL OR o.status = 'cancelled')
UNION ALL
SELECT 'one of two live invoices on the same order', i.invoice_number, o.order_number,
       o.status::text, i.total_amount, i.paid_amount
FROM invoices i JOIN orders o ON o.id = i.order_id
WHERE i.deleted_at IS NULL AND i.status IN ('issued', 'partially_paid', 'paid')
  AND i.order_id IN (SELECT order_id FROM invoices
                      WHERE deleted_at IS NULL AND status IN ('issued', 'partially_paid', 'paid')
                        AND order_id IS NOT NULL
                      GROUP BY order_id HAVING COUNT(*) > 1)
UNION ALL
SELECT 'not linked to any order', i.invoice_number, NULL, NULL, i.total_amount, i.paid_amount
FROM invoices i
WHERE i.deleted_at IS NULL AND i.status IN ('issued', 'partially_paid', 'paid') AND i.order_id IS NULL
ORDER BY 1, 2;

\echo '=== D. Payments applied to ANOTHER order''s invoice ==='
SELECT i.invoice_number, io.order_number AS invoice_order, po.order_number AS payment_order,
       c.name AS customer, ip.amount_applied, p.payment_date::date
FROM invoice_payments ip
JOIN invoices i ON i.id = ip.invoice_id
JOIN payments p ON p.id = ip.payment_id
LEFT JOIN orders io ON io.id = i.order_id
LEFT JOIN orders po ON po.id = p.order_id
LEFT JOIN customers c ON c.id = p.customer_id
WHERE p.order_id IS DISTINCT FROM i.order_id AND p.deleted_at IS NULL
ORDER BY p.payment_date;

\echo '=== E. Received payments not shown on their invoice: safe to apply, or needs review? ==='
WITH inv AS (
  SELECT DISTINCT ON (order_id) order_id, id, total_amount
  FROM invoices
  WHERE order_id IS NOT NULL AND deleted_at IS NULL AND status IN ('issued', 'partially_paid', 'paid')
  ORDER BY order_id, created_at DESC
),
sale AS (
  SELECT o.id,
         CASE WHEN o.status = 'cancelled' THEN 0 ELSE inv.total_amount END AS bill_total,
         COALESCE((SELECT SUM(p.amount - COALESCE(p.refund_amount, 0)) FROM payments p
                    WHERE p.order_id = o.id AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')), 0)
       + COALESCE((SELECT SUM(s.amount) FROM customer_return_settlements s
                    WHERE s.target_order_id = o.id AND s.settlement_type = 'order_offset'), 0)
       + COALESCE((SELECT SUM(l.amount) FROM customer_store_credit_ledger l
                    WHERE l.order_id = o.id AND l.entry_type = 'applied' AND l.deleted_at IS NULL), 0) AS settled
  FROM orders o JOIN inv ON inv.order_id = o.id
  WHERE o.deleted_at IS NULL
)
SELECT CASE WHEN s.settled > s.bill_total + 0.005
            THEN 'on an OVER-COLLECTED sale: may be a duplicate, review first'
            ELSE 'on a sale within its bill: genuinely received, safe to apply' END AS situation,
       COUNT(*) AS payments, SUM(p.amount) AS amount
FROM payments p
JOIN sale s ON s.id = p.order_id
WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
  AND NOT EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = p.id)
GROUP BY 1 ORDER BY 1;
