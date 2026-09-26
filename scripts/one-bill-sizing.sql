-- Phase 0 sizing — READ ONLY. Aggregates only, so the output fits on one screen.
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db < scripts/one-bill-sizing.sql
--
-- "Bill" = the order's ISSUED invoice (issued / partially_paid / paid) if it has
-- one, otherwise the order itself. A draft invoice is not a bill yet: payments
-- cannot be recorded against it. This is the same definition Phase 1 builds.
--
-- "Paid" = every successful payment on the order, net of anything refunded —
-- whether or not it was ever applied to the invoice.

\echo '=== 1. Overall: what is billed vs what the app reports ==='
WITH inv AS (
  SELECT DISTINCT ON (order_id) order_id, id, total_amount
  FROM invoices
  WHERE order_id IS NOT NULL AND deleted_at IS NULL
    AND status IN ('issued', 'partially_paid', 'paid')
  ORDER BY order_id, created_at DESC
),
pay AS (
  SELECT order_id, SUM(amount - COALESCE(refund_amount, 0)) AS paid
  FROM payments
  WHERE status IN ('success', 'refunded') AND deleted_at IS NULL
  GROUP BY order_id
),
s AS (
  SELECT o.id, o.total_amount AS order_total,
         COALESCE(inv.total_amount, o.total_amount) AS bill_total,
         inv.id IS NOT NULL AS invoiced,
         COALESCE(pay.paid, 0) AS paid, o.credit_applied, o.balance_amount
  FROM orders o
  LEFT JOIN inv ON inv.order_id = o.id
  LEFT JOIN pay ON pay.order_id = o.id
  WHERE o.deleted_at IS NULL AND o.status <> 'cancelled'
)
SELECT
  COUNT(*)                                                             AS sales,
  COUNT(*) FILTER (WHERE invoiced)                                     AS invoiced_sales,
  SUM(order_total)                                                     AS pnl_counts_sales_of,
  SUM(bill_total)                                                      AS actually_billed,
  SUM(bill_total) - SUM(order_total)                                   AS pnl_off_by,
  COUNT(*) FILTER (WHERE paid + credit_applied > bill_total + 0.005)   AS overcollected_sales,
  SUM(GREATEST(paid + credit_applied - bill_total, 0))                 AS overcollected_rupees,
  SUM(GREATEST(bill_total - paid - credit_applied, 0))                 AS true_still_owed,
  SUM(balance_amount)                                                  AS app_shows_owed
FROM s;

\echo '=== 2. Month by month: P&L sales today vs actually billed ==='
WITH inv AS (
  SELECT DISTINCT ON (order_id) order_id, total_amount
  FROM invoices
  WHERE order_id IS NOT NULL AND deleted_at IS NULL
    AND status IN ('issued', 'partially_paid', 'paid')
  ORDER BY order_id, created_at DESC
)
SELECT TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM')          AS month,
       SUM(o.total_amount)                                            AS pnl_shows,
       SUM(COALESCE(inv.total_amount, o.total_amount))                AS actually_billed,
       SUM(COALESCE(inv.total_amount, o.total_amount)) - SUM(o.total_amount) AS difference
FROM orders o
LEFT JOIN inv ON inv.order_id = o.id
WHERE o.deleted_at IS NULL AND o.status <> 'cancelled'
GROUP BY 1 ORDER BY 1;

\echo '=== 3. Edge cases the design has to handle ==='
SELECT
  (SELECT COUNT(*) FROM invoices
    WHERE order_id IS NULL AND deleted_at IS NULL AND status <> 'void')        AS invoices_without_order,
  (SELECT COALESCE(SUM(total_amount), 0) FROM invoices
    WHERE order_id IS NULL AND deleted_at IS NULL AND status <> 'void')        AS their_total,
  (SELECT COUNT(*) FROM invoice_payments ip
     JOIN invoices i ON i.id = ip.invoice_id
     JOIN payments p ON p.id = ip.payment_id
    WHERE p.order_id IS DISTINCT FROM i.order_id AND p.deleted_at IS NULL)     AS payments_applied_to_another_orders_invoice,
  (SELECT COUNT(*) FROM payments p
     JOIN invoices i ON i.order_id = p.order_id AND i.deleted_at IS NULL AND i.status IN ('issued', 'partially_paid', 'paid')
    WHERE p.status = 'success' AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = p.id)) AS payments_on_invoiced_orders_not_on_invoice;

\echo '=== 3b. Invoices by status (a draft is not a bill yet) ==='
SELECT status, COUNT(*) AS invoices, COALESCE(SUM(total_amount), 0) AS total
FROM invoices WHERE deleted_at IS NULL
GROUP BY status ORDER BY status;

\echo '=== 3c. Refunds recorded on customer payments (these never reached the Cash Book / Bank) ==='
SELECT COUNT(*) AS payments_with_refunds, COALESCE(SUM(refund_amount), 0) AS refunded
FROM payments WHERE deleted_at IS NULL AND COALESCE(refund_amount, 0) > 0;

\echo '=== 4. Likely duplicates: same order, same amount, recorded more than once ==='
SELECT COUNT(*) AS candidate_pairs, COALESCE(SUM(p2.amount), 0) AS rupees
FROM payments p1
JOIN payments p2 ON p2.order_id = p1.order_id AND p2.amount = p1.amount AND p2.id > p1.id
WHERE p1.status = 'success' AND p2.status = 'success'
  AND p1.deleted_at IS NULL AND p2.deleted_at IS NULL;

\echo '=== 5. Payments vs the Cash Book / Bank Ledger (every rupee received must be in the books exactly once) ==='
WITH led AS (
  SELECT source_id, SUM(amount) AS amt, COUNT(*) AS n
  FROM (
    SELECT source_id, amount FROM cash_ledger_entries
     WHERE source_type = 'customer_payment' AND deleted_at IS NULL
    UNION ALL
    SELECT source_id, amount FROM bank_ledger_entries
     WHERE source_type = 'customer_payment' AND deleted_at IS NULL
  ) x
  GROUP BY source_id
)
SELECT
  COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded') AND led.source_id IS NULL)  AS payments_not_in_books,
  COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded') AND led.source_id IS NULL), 0) AS not_in_books_amount,
  MAX(p.payment_date) FILTER (WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded') AND led.source_id IS NULL)  AS latest_not_in_books,
  COUNT(*) FILTER (WHERE led.n > 1)                                          AS payments_in_books_twice,
  COUNT(*) FILTER (WHERE led.source_id IS NOT NULL AND ABS(led.amt - p.amount) > 0.005) AS books_amount_differs,
  COUNT(*) FILTER (WHERE p.deleted_at IS NOT NULL AND led.source_id IS NOT NULL) AS deleted_payments_still_in_books,
  (SELECT COUNT(*) FROM led WHERE NOT EXISTS (SELECT 1 FROM payments q WHERE q.id = led.source_id)) AS book_entries_with_no_payment
FROM payments p
LEFT JOIN led ON led.source_id = p.id;

\echo '=== 6. Orders marked paid with NO payment record behind the amount ==='
\echo '    (Phase 1 keeps these as paid, records each as a flagged adjustment, and lists them for review)'
SELECT COUNT(*) AS orders, COALESCE(SUM(o.paid_amount - rows_paid.paid), 0) AS unexplained_paid
FROM orders o
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(p.amount - COALESCE(p.refund_amount, 0)), 0) AS paid
  FROM payments p
  WHERE p.order_id = o.id AND p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
) rows_paid
WHERE o.deleted_at IS NULL
  AND o.paid_amount > rows_paid.paid + 0.005;

\echo '=== 7. How payments were recorded (a mock gateway in production records payments that never arrived) ==='
SELECT payment_gateway, status, COUNT(*) AS payments, SUM(amount) AS amount
FROM payments WHERE deleted_at IS NULL
GROUP BY 1, 2 ORDER BY 1, 2;
