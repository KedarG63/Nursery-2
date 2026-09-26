-- Phase 3 review sheet — READ ONLY. One CSV row per payment on every sale that
-- has more money recorded against it than it was billed.
--
-- Works on the CURRENT production schema (it does not need the Phase 1
-- migration), so the review can start before anything is deployed.
--
-- Run on the VM from ~/Nursery-2, saving to a file you can open in Excel:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -q \
--     < scripts/one-bill-review-sheet.sql > ~/one-bill-review.csv
--
-- For each row, check the bank statement (UPI / bank: match the date, amount and
-- UTR) or the cash records, and write in the "decision" column one of:
--   genuine      — this money really was received for this sale
--   duplicate    — the same money recorded a second time
--   other order  — real money, but it belongs to a different order (say which)
--   advance      — real money received beyond the bill, to keep as an advance
-- The Phase 3 script applies these decisions and checks every balance to the paisa.
--
-- Definitions (identical to the Phase 1 sale_bills view):
--   bill    = the order's issued invoice if it has one, else the order;
--             0 if the order is cancelled
--   paid    = every successful payment on the order, net of refunds
--   credit  = return offsets + store credit spent on the order

COPY (
  WITH inv AS (
    SELECT DISTINCT ON (order_id) order_id, id, invoice_number, total_amount
    FROM invoices
    WHERE order_id IS NOT NULL AND deleted_at IS NULL
      AND status IN ('issued', 'partially_paid', 'paid')
    ORDER BY order_id, created_at DESC
  ),
  sale AS (
    SELECT o.id AS order_id, o.order_number, o.order_date, o.status AS order_status,
           c.name AS customer, c.phone,
           inv.invoice_number,
           CASE WHEN o.status = 'cancelled' THEN 0
                ELSE COALESCE(inv.total_amount, o.total_amount) END AS bill_total,
           o.total_amount AS order_total,
           COALESCE((SELECT SUM(p.amount - COALESCE(p.refund_amount, 0)) FROM payments p
                      WHERE p.order_id = o.id AND p.deleted_at IS NULL
                        AND p.status IN ('success', 'refunded')), 0) AS recorded,
           COALESCE((SELECT SUM(s.amount) FROM customer_return_settlements s
                      WHERE s.target_order_id = o.id AND s.settlement_type = 'order_offset'), 0)
         + COALESCE((SELECT SUM(l.amount) FROM customer_store_credit_ledger l
                      WHERE l.order_id = o.id AND l.entry_type = 'applied' AND l.deleted_at IS NULL), 0)
             AS returns_credit
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN inv ON inv.order_id = o.id
    WHERE o.deleted_at IS NULL
  ),
  flagged AS (
    SELECT *, recorded + returns_credit - bill_total AS over_by
    FROM sale
    WHERE recorded + returns_credit > bill_total + 0.005
  )
  SELECT
    f.customer,
    f.phone,
    f.order_number,
    f.order_date::date                                   AS order_date,
    f.order_status,
    COALESCE(f.invoice_number, '(billed on the order)')  AS billed_on,
    f.bill_total,
    f.order_total,
    f.recorded                                           AS total_recorded_on_sale,
    f.returns_credit,
    f.over_by                                            AS recorded_more_than_billed_by,
    p.payment_date::date                                 AS payment_date,
    p.amount - COALESCE(p.refund_amount, 0)              AS payment_amount,
    p.payment_method,
    COALESCE(p.receipt_number, p.gateway_transaction_id, '') AS receipt_or_utr,
    COALESCE(ba.account_name, ca.account_name, '')       AS account,
    p.payment_gateway,
    CASE WHEN EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.payment_id = p.id)
         THEN 'yes' ELSE 'NO' END                        AS shown_on_invoice,
    CASE WHEN EXISTS (SELECT 1 FROM cash_ledger_entries e
                       WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
           OR EXISTS (SELECT 1 FROM bank_ledger_entries e
                       WHERE e.source_type = 'customer_payment' AND e.source_id = p.id AND e.deleted_at IS NULL)
         THEN 'yes' ELSE 'NO' END                        AS in_cash_book_or_bank,
    COALESCE(u.full_name, '')                            AS recorded_by,
    to_char(p.created_at, 'YYYY-MM-DD HH24:MI')          AS recorded_at,
    p.id                                                 AS payment_id,
    ''                                                   AS decision,
    ''                                                   AS decision_notes
  FROM flagged f
  JOIN payments p ON p.order_id = f.order_id
                 AND p.deleted_at IS NULL
                 AND p.status IN ('success', 'refunded')
  LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
  LEFT JOIN cash_accounts ca ON ca.id = p.cash_account_id
  LEFT JOIN users u ON u.id = COALESCE(p.created_by, p.received_by)
  ORDER BY f.over_by DESC, f.order_number, p.payment_date, p.created_at
) TO STDOUT WITH CSV HEADER;
