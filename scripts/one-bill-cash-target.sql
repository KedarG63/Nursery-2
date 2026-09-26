-- Cash target — READ ONLY. How much of the cash missing from the Cash Book sits
-- on sales that are OVER-COLLECTED — where a duplicate twin of the payment may
-- already be in the books, so posting it too would count the money twice.
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db < scripts/one-bill-cash-target.sql

WITH inv AS (
  SELECT DISTINCT ON (order_id) order_id, total_amount
  FROM invoices
  WHERE order_id IS NOT NULL AND deleted_at IS NULL AND status IN ('issued', 'partially_paid', 'paid')
  ORDER BY order_id, created_at DESC
),
sale AS (
  SELECT o.id,
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
cash_open AS (
  SELECT MAX(entry_date) AS d FROM cash_ledger_entries
  WHERE entry_type = 'opening_balance' AND deleted_at IS NULL
    AND cash_account_id = (SELECT id FROM cash_accounts WHERE is_active ORDER BY sort_order, created_at LIMIT 1)
),
missing AS (
  SELECT p.*,
         CASE WHEN p.payment_method = 'cash' THEN 'cash' ELSE 'UPI / bank, no account' END AS kind,
         s.settled > s.bill_total + 0.005 AS over_collected
  FROM payments p
  JOIN sale s ON s.id = p.order_id
  WHERE p.deleted_at IS NULL AND p.status IN ('success', 'refunded')
    AND p.payment_method IN ('cash', 'upi', 'card', 'bank_transfer')
    AND p.payment_date >= (SELECT d FROM cash_open)
    AND NOT EXISTS (SELECT 1 FROM cash_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM bank_ledger_entries e
                     WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
)
SELECT kind,
       CASE WHEN over_collected
            THEN 'on an OVER-COLLECTED sale — a twin may already be in the books'
            ELSE 'on a sale within its bill — genuinely missing' END AS situation,
       COUNT(*) AS payments, SUM(amount) AS amount
FROM missing
GROUP BY 1, 2
ORDER BY 1, 2;
