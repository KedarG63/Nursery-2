-- ============================================================================
-- 2026-09-24 — Remove test data from production, to the paisa.
--
-- Approved by the owner after two read-only inventories. Removes EXACTLY:
--   customers  Test Customer (CUST-000116), Test Customer - 28May (CUST-000193),
--              Test for same Address (CUST-000064)
--   orders     their 4 orders + 5 already-deleted, unpaid-or-test orders of real
--              customers that were for test varieties (incl. the Rs 25 walk-in
--              test on 22 Aug, ORD-20260822-0731)
--   payments   6 (Rs 40,025 in total, of which Rs 35,025 live)
--   invoices   INV-2026-0012, INV-2026-0034
--   books      bank -Rs 25,025 (20,000 + 5,000 + 25), cash -Rs 10,000
--   seed bills PUR-20260427-0001, PUR-20260514-0002, PUR-20260522-0001 (Rs 90,000, unpaid)
--   lots       the 3 lots of the test varieties
--   varieties  TESTPRODUC-TESTVA-001, TESTPRODUC-TEST14-001, TESTPRODUC-TESTVA-002
--   products   Test Product, Test Product (14-May)
--
-- KEPT on purpose: PUR-20260708-0001 (Merigold, Rs 1,05,000) is a REAL purchase,
-- so its vendor ("Test Vendor") and lots 07-001..07-005 stay untouched.
--
-- Default is a DRY RUN that always rolls back. Commit only with -v apply=true.
-- Rehearsed on a production-shaped copy: guards abort before any delete on a
-- mismatch; a stray change to any other row blocks the commit.
-- ============================================================================
\set cust_codes '{CUST-000116,CUST-000193,CUST-000064}'
\set sku_codes '{TESTPRODUC-TESTVA-001,TESTPRODUC-TEST14-001,TESTPRODUC-TESTVA-002}'
\set product_names '{"Test Product","Test Product (14-May)"}'
\set bill_numbers '{PUR-20260427-0001,PUR-20260514-0002,PUR-20260522-0001}'
\set paid_real_orders '{ORD-20260822-0731}'
\set exp_customers 3
\set exp_orders 9
\set exp_payments 6
\set exp_invoices 2
\set exp_lots 3
\set exp_bills 3
\set exp_skus 3
\set exp_products 2
\set exp_bank_removed 25025.00
\set exp_cash_removed 10000.00
\set exp_bills_total 90000.00
\set exp_sales_removed 5000.00
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif
\pset footer off
BEGIN;
SET LOCAL lock_timeout = '10s';

-- psql does not substitute :variables inside $$ blocks, so the checks read them from here.
CREATE TEMP TABLE params ON COMMIT DROP AS SELECT
  :exp_customers::int AS exp_customers, :exp_orders::int AS exp_orders, :exp_payments::int AS exp_payments,
  :exp_invoices::int AS exp_invoices, :exp_lots::int AS exp_lots, :exp_bills::int AS exp_bills,
  :exp_skus::int AS exp_skus, :exp_products::int AS exp_products,
  :exp_bank_removed::numeric AS exp_bank_removed, :exp_cash_removed::numeric AS exp_cash_removed,
  :exp_bills_total::numeric AS exp_bills_total, :exp_sales_removed::numeric AS exp_sales_removed,
  :'paid_real_orders'::text[] AS paid_real_orders;

-- ── 1. The exact target set (by approved identifiers, never by name pattern) ──
CREATE TEMP TABLE t_customers ON COMMIT DROP AS
  SELECT id, customer_code, name FROM customers WHERE customer_code = ANY(:'cust_codes'::text[]);
CREATE TEMP TABLE t_skus ON COMMIT DROP AS
  SELECT id, sku_code, product_id FROM skus WHERE sku_code = ANY(:'sku_codes'::text[]);
CREATE TEMP TABLE t_products ON COMMIT DROP AS
  SELECT id, name FROM products WHERE name = ANY(:'product_names'::text[]);
CREATE TEMP TABLE t_bills ON COMMIT DROP AS
  SELECT id, purchase_number, grand_total, amount_paid, COALESCE(vendor_credit_applied,0) AS credit,
         purchase_date, deleted_at
  FROM seed_purchases WHERE purchase_number = ANY(:'bill_numbers'::text[]);
CREATE TEMP TABLE t_lots ON COMMIT DROP AS
  SELECT id, lot_number FROM lots WHERE sku_id IN (SELECT id FROM t_skus);
CREATE TEMP TABLE t_orders ON COMMIT DROP AS
  SELECT o.id, o.order_number, o.customer_id, o.status, o.order_date, o.total_amount, o.balance_amount, o.deleted_at,
         (o.customer_id IN (SELECT id FROM t_customers)) AS test_customer
  FROM orders o
  WHERE o.customer_id IN (SELECT id FROM t_customers)
     OR o.id IN (SELECT order_id FROM order_items WHERE sku_id IN (SELECT id FROM t_skus));
CREATE TEMP TABLE t_payments ON COMMIT DROP AS
  SELECT id, order_id, amount, deleted_at, status FROM payments
  WHERE customer_id IN (SELECT id FROM t_customers) OR order_id IN (SELECT id FROM t_orders);
CREATE TEMP TABLE t_invoices ON COMMIT DROP AS
  SELECT id, invoice_number FROM invoices
  WHERE customer_id IN (SELECT id FROM t_customers) OR order_id IN (SELECT id FROM t_orders);
CREATE TEMP TABLE t_ble ON COMMIT DROP AS
  SELECT id, bank_account_id, entry_type::text AS entry_type, amount, deleted_at FROM bank_ledger_entries
  WHERE source_type = 'customer_payment' AND source_id IN (SELECT id FROM t_payments);
CREATE TEMP TABLE t_cle ON COMMIT DROP AS
  SELECT id, cash_account_id, entry_type::text AS entry_type, amount, deleted_at FROM cash_ledger_entries
  WHERE source_type = 'customer_payment' AND source_id IN (SELECT id FROM t_payments);

\echo '=== TARGET SET ==='
SELECT 'customers' AS what, COUNT(*) AS n, string_agg(name, ', ') AS items FROM t_customers
UNION ALL SELECT 'orders', COUNT(*), string_agg(order_number, ', ' ORDER BY order_number) FROM t_orders
UNION ALL SELECT 'payments', COUNT(*), 'total ' || SUM(amount) FROM t_payments
UNION ALL SELECT 'invoices', COUNT(*), string_agg(invoice_number, ', ') FROM t_invoices
UNION ALL SELECT 'lots', COUNT(*), string_agg(lot_number, ', ') FROM t_lots
UNION ALL SELECT 'seed bills', COUNT(*), string_agg(purchase_number || ' ' || grand_total, ', ') FROM t_bills
UNION ALL SELECT 'varieties', COUNT(*), string_agg(sku_code, ', ') FROM t_skus
UNION ALL SELECT 'products', COUNT(*), string_agg(name, ', ') FROM t_products
UNION ALL SELECT 'bank ledger rows', COUNT(*), 'live ' || COALESCE(SUM(amount) FILTER (WHERE deleted_at IS NULL), 0) FROM t_ble
UNION ALL SELECT 'cash ledger rows', COUNT(*), 'live ' || COALESCE(SUM(amount) FILTER (WHERE deleted_at IS NULL), 0) FROM t_cle;

-- ── 2. Guards: stop BEFORE deleting if the set is not exactly what was approved ─
DO $$
DECLARE n int; x numeric; p params%ROWTYPE;
BEGIN
  SELECT * INTO p FROM params;
  SELECT COUNT(*) INTO n FROM t_customers;  IF n <> p.exp_customers THEN RAISE EXCEPTION 'customers: expected %, found %', p.exp_customers, n; END IF;
  SELECT COUNT(*) INTO n FROM t_orders;     IF n <> p.exp_orders    THEN RAISE EXCEPTION 'orders: expected %, found %', p.exp_orders, n; END IF;
  SELECT COUNT(*) INTO n FROM t_payments;   IF n <> p.exp_payments  THEN RAISE EXCEPTION 'payments: expected %, found %', p.exp_payments, n; END IF;
  SELECT COUNT(*) INTO n FROM t_invoices;   IF n <> p.exp_invoices  THEN RAISE EXCEPTION 'invoices: expected %, found %', p.exp_invoices, n; END IF;
  SELECT COUNT(*) INTO n FROM t_lots;       IF n <> p.exp_lots      THEN RAISE EXCEPTION 'lots: expected %, found %', p.exp_lots, n; END IF;
  SELECT COUNT(*) INTO n FROM t_bills;      IF n <> p.exp_bills     THEN RAISE EXCEPTION 'seed bills: expected %, found %', p.exp_bills, n; END IF;
  SELECT COUNT(*) INTO n FROM t_skus;       IF n <> p.exp_skus      THEN RAISE EXCEPTION 'varieties: expected %, found %', p.exp_skus, n; END IF;
  SELECT COUNT(*) INTO n FROM t_products;   IF n <> p.exp_products  THEN RAISE EXCEPTION 'products: expected %, found %', p.exp_products, n; END IF;

  -- A test product must not own any variety outside the test set.
  SELECT COUNT(*) INTO n FROM skus WHERE product_id IN (SELECT id FROM t_products) AND id NOT IN (SELECT id FROM t_skus);
  IF n > 0 THEN RAISE EXCEPTION 'a test product has % variety(ies) outside the approved list', n; END IF;
  -- Every test variety belongs to a test product.
  SELECT COUNT(*) INTO n FROM t_skus WHERE product_id NOT IN (SELECT id FROM t_products);
  IF n > 0 THEN RAISE EXCEPTION '% test variety(ies) belong to a product not being removed', n; END IF;

  -- No bill outside the approved list may reference a test product or variety (e.g. Merigold).
  SELECT COUNT(*) INTO n FROM seed_purchases
   WHERE id NOT IN (SELECT id FROM t_bills)
     AND (product_id IN (SELECT id FROM t_products) OR sku_id IN (SELECT id FROM t_skus));
  IF n > 0 THEN RAISE EXCEPTION '% other seed bill(s) reference a test product/variety', n; END IF;
  -- Approved bills must be for test products, unpaid, and have no payments or returns.
  SELECT COUNT(*) INTO n FROM seed_purchases WHERE id IN (SELECT id FROM t_bills) AND product_id NOT IN (SELECT id FROM t_products);
  IF n > 0 THEN RAISE EXCEPTION '% approved bill(s) are not for a test product', n; END IF;
  SELECT COUNT(*) INTO n FROM seed_purchase_payments WHERE seed_purchase_id IN (SELECT id FROM t_bills);
  IF n > 0 THEN RAISE EXCEPTION 'approved bills have % payment row(s)', n; END IF;
  SELECT COUNT(*) INTO n FROM vendor_return_notes WHERE seed_purchase_id IN (SELECT id FROM t_bills) OR credited_to_purchase_id IN (SELECT id FROM t_bills);
  IF n > 0 THEN RAISE EXCEPTION 'approved bills have % vendor return note(s)', n; END IF;

  -- Seed usage links: test lots only draw from test bills, test bills only feed test lots.
  SELECT COUNT(*) INTO n FROM seed_usage_history
   WHERE (lot_id IN (SELECT id FROM t_lots)) <> (seed_purchase_id IN (SELECT id FROM t_bills));
  IF n > 0 THEN RAISE EXCEPTION '% seed usage row(s) link a test lot with a real bill or vice versa', n; END IF;
  SELECT COUNT(*) INTO n FROM lots WHERE seed_purchase_id IN (SELECT id FROM t_bills) AND id NOT IN (SELECT id FROM t_lots);
  IF n > 0 THEN RAISE EXCEPTION '% real lot(s) point at a test bill', n; END IF;

  -- Every line on a target order must be a test variety (never delete a real sale line).
  SELECT COUNT(*) INTO n FROM order_items WHERE order_id IN (SELECT id FROM t_orders) AND sku_id NOT IN (SELECT id FROM t_skus);
  IF n > 0 THEN RAISE EXCEPTION '% line(s) on target orders are real varieties', n; END IF;
  -- Order lines on test lots belong only to target orders.
  SELECT COUNT(*) INTO n FROM order_items WHERE lot_id IN (SELECT id FROM t_lots) AND order_id NOT IN (SELECT id FROM t_orders);
  IF n > 0 THEN RAISE EXCEPTION '% order line(s) outside the target draw from a test lot', n; END IF;
  -- Real customers' target orders must already be deleted, and only the approved one may carry money.
  SELECT COUNT(*) INTO n FROM t_orders WHERE NOT test_customer AND deleted_at IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% live order(s) of real customers would be removed', n; END IF;
  SELECT COUNT(*) INTO n FROM t_payments tp JOIN t_orders o ON o.id = tp.order_id
   WHERE NOT o.test_customer AND o.order_number <> ALL(p.paid_real_orders);
  IF n > 0 THEN RAISE EXCEPTION '% payment(s) on real customers'' orders not in the approved list', n; END IF;

  -- Nothing else may hang off the target set.
  SELECT COUNT(*) INTO n FROM invoice_payments ip
   WHERE (ip.invoice_id IN (SELECT id FROM t_invoices)) <> (ip.payment_id IN (SELECT id FROM t_payments));
  IF n > 0 THEN RAISE EXCEPTION '% invoice payment link(s) cross between test and real', n; END IF;
  SELECT COUNT(*) INTO n FROM customer_return_notes WHERE customer_id IN (SELECT id FROM t_customers) OR order_id IN (SELECT id FROM t_orders);
  IF n > 0 THEN RAISE EXCEPTION '% customer return(s) on target', n; END IF;
  SELECT COUNT(*) INTO n FROM customer_store_credit_ledger WHERE customer_id IN (SELECT id FROM t_customers) OR order_id IN (SELECT id FROM t_orders);
  IF n > 0 THEN RAISE EXCEPTION '% store credit row(s) on target', n; END IF;
  SELECT COUNT(*) INTO n FROM route_stops WHERE order_id IN (SELECT id FROM t_orders);
  IF n > 0 THEN RAISE EXCEPTION '% delivery stop(s) on target orders', n; END IF;
  SELECT COUNT(*) INTO n FROM service_orders WHERE customer_id IN (SELECT id FROM t_customers);
  IF n > 0 THEN RAISE EXCEPTION '% service order(s) on test customers', n; END IF;
  SELECT COUNT(*) INTO n FROM orders WHERE id NOT IN (SELECT id FROM t_orders)
     AND delivery_address_id IN (SELECT id FROM customer_addresses WHERE customer_id IN (SELECT id FROM t_customers));
  IF n > 0 THEN RAISE EXCEPTION '% real order(s) use a test customer''s address', n; END IF;
  -- Money of target payments reached the books ONLY as customer_payment entries.
  SELECT COUNT(*) INTO n FROM (
    SELECT source_id FROM bank_ledger_entries WHERE source_type <> 'customer_payment'
    UNION ALL SELECT source_id FROM cash_ledger_entries WHERE source_type <> 'customer_payment') s
   WHERE s.source_id IN (SELECT id FROM t_payments UNION SELECT id FROM t_orders UNION SELECT id FROM t_invoices);
  IF n > 0 THEN RAISE EXCEPTION '% ledger row(s) link to target records under another source type', n; END IF;

  -- The approved money, independently: live bank / cash rows to be removed.
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END), 0) INTO x FROM t_ble WHERE deleted_at IS NULL;
  IF x <> p.exp_bank_removed THEN RAISE EXCEPTION 'bank money to remove: expected %, found %', p.exp_bank_removed, x; END IF;
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END), 0) INTO x FROM t_cle WHERE deleted_at IS NULL;
  IF x <> p.exp_cash_removed THEN RAISE EXCEPTION 'cash money to remove: expected %, found %', p.exp_cash_removed, x; END IF;
  SELECT COALESCE(SUM(grand_total), 0) INTO x FROM t_bills WHERE deleted_at IS NULL;
  IF x <> p.exp_bills_total THEN RAISE EXCEPTION 'seed bills total: expected %, found %', p.exp_bills_total, x; END IF;
END $$;

-- ── 3. Snapshot: every accounting figure, and a fingerprint of every other row ─
CREATE FUNCTION pg_temp.metrics() RETURNS TABLE(metric text, value numeric) LANGUAGE sql AS $f$
  SELECT 'bank: ' || b.account_name, COALESCE(SUM(CASE WHEN l.entry_type = 'debit' THEN -l.amount ELSE l.amount END), 0)
    FROM bank_accounts b LEFT JOIN bank_ledger_entries l ON l.bank_account_id = b.id AND l.deleted_at IS NULL GROUP BY b.id, b.account_name
  UNION ALL
  SELECT 'cash: ' || c.account_name, COALESCE(SUM(CASE WHEN l.entry_type = 'debit' THEN -l.amount ELSE l.amount END), 0)
    FROM cash_accounts c LEFT JOIN cash_ledger_entries l ON l.cash_account_id = c.id AND l.deleted_at IS NULL GROUP BY c.id, c.account_name
  UNION ALL
  SELECT 'payables: seed', COALESCE(SUM(grand_total - amount_paid - COALESCE(vendor_credit_applied, 0)), 0) FROM seed_purchases WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'payables: supplies', COALESCE(SUM(grand_total - amount_paid), 0) FROM material_purchases WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'receivables: orders', COALESCE(SUM(balance_amount), 0) FROM orders WHERE deleted_at IS NULL AND status <> 'cancelled'
  UNION ALL
  SELECT 'receivables: service orders', COALESCE(SUM(balance_amount), 0) FROM service_orders WHERE deleted_at IS NULL AND status <> 'cancelled'
  UNION ALL
  SELECT 'payments received (live)', COALESCE(SUM(amount), 0) FROM payments WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'invoices outstanding', COALESCE(SUM(balance_amount), 0) FROM invoices WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'store credit balance', COALESCE(SUM(CASE WHEN entry_type = 'issued' THEN amount ELSE -amount END), 0) FROM customer_store_credit_ledger WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'staff advances outstanding', COALESCE(SUM(amount - amount_recovered), 0) FROM employee_advances WHERE deleted_at IS NULL AND status = 'outstanding'
  UNION ALL
  SELECT 'sales ' || to_char(order_date, 'YYYY-MM'), SUM(total_amount) FROM orders
   WHERE deleted_at IS NULL AND status <> 'cancelled' GROUP BY 1
  UNION ALL
  SELECT 'seed cost ' || to_char(purchase_date, 'YYYY-MM'), SUM(grand_total) FROM seed_purchases
   WHERE deleted_at IS NULL GROUP BY 1
  UNION ALL
  SELECT 'lot stock allocated (all lots)', COALESCE(SUM(allocated_quantity), 0) FROM lots
  UNION ALL
  SELECT 'seeds used (all bills)', COALESCE(SUM(seeds_used), 0) FROM seed_purchases
$f$;

-- Fingerprint of every row NOT in the target set. Must be identical afterwards.
CREATE FUNCTION pg_temp.fingerprints() RETURNS TABLE(tbl text, rows bigint, fp text) LANGUAGE sql AS $f$
  SELECT 'customers', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM customers t WHERE t.id NOT IN (SELECT id FROM t_customers)
  UNION ALL SELECT 'orders', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM orders t WHERE t.id NOT IN (SELECT id FROM t_orders)
  UNION ALL SELECT 'order_items', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM order_items t WHERE t.order_id NOT IN (SELECT id FROM t_orders)
  UNION ALL SELECT 'payments', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM payments t WHERE t.id NOT IN (SELECT id FROM t_payments)
  UNION ALL SELECT 'invoices', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM invoices t WHERE t.id NOT IN (SELECT id FROM t_invoices)
  UNION ALL SELECT 'lots', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM lots t WHERE t.id NOT IN (SELECT id FROM t_lots)
  UNION ALL SELECT 'seed_purchases', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM seed_purchases t WHERE t.id NOT IN (SELECT id FROM t_bills)
  UNION ALL SELECT 'seed_usage_history', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM seed_usage_history t WHERE t.lot_id NOT IN (SELECT id FROM t_lots)
  UNION ALL SELECT 'skus', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM skus t WHERE t.id NOT IN (SELECT id FROM t_skus)
  UNION ALL SELECT 'products', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM products t WHERE t.id NOT IN (SELECT id FROM t_products)
  UNION ALL SELECT 'bank_ledger_entries', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM bank_ledger_entries t WHERE t.id NOT IN (SELECT id FROM t_ble)
  UNION ALL SELECT 'cash_ledger_entries', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM cash_ledger_entries t WHERE t.id NOT IN (SELECT id FROM t_cle)
  UNION ALL SELECT 'vendors', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM vendors t
  UNION ALL SELECT 'service_orders', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM service_orders t
  UNION ALL SELECT 'service_order_payments', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM service_order_payments t
  UNION ALL SELECT 'material_purchases', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM material_purchases t
  UNION ALL SELECT 'expenses', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM expenses t
  UNION ALL SELECT 'vendor_payments', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM vendor_payments t
  UNION ALL SELECT 'payroll_items', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM payroll_items t
  UNION ALL SELECT 'employee_advances', COUNT(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM employee_advances t
$f$;

-- Expected change per figure, derived from the target rows themselves.
CREATE TEMP TABLE expected ON COMMIT DROP AS
  SELECT 'bank: ' || b.account_name AS metric,
         -SUM(CASE WHEN t.entry_type = 'debit' THEN -t.amount ELSE t.amount END) AS delta
    FROM t_ble t JOIN bank_accounts b ON b.id = t.bank_account_id WHERE t.deleted_at IS NULL GROUP BY b.account_name
  UNION ALL
  SELECT 'cash: ' || c.account_name, -SUM(CASE WHEN t.entry_type = 'debit' THEN -t.amount ELSE t.amount END)
    FROM t_cle t JOIN cash_accounts c ON c.id = t.cash_account_id WHERE t.deleted_at IS NULL GROUP BY c.account_name
  UNION ALL
  SELECT 'payables: seed', -SUM(grand_total - amount_paid - credit) FROM t_bills WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'receivables: orders', -SUM(balance_amount) FROM t_orders WHERE deleted_at IS NULL AND status <> 'cancelled'
  UNION ALL
  SELECT 'payments received (live)', -SUM(amount) FROM t_payments WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'invoices outstanding', -SUM(balance_amount) FROM invoices WHERE id IN (SELECT id FROM t_invoices) AND deleted_at IS NULL
  UNION ALL
  SELECT 'sales ' || to_char(order_date, 'YYYY-MM'), -SUM(total_amount) FROM t_orders
   WHERE deleted_at IS NULL AND status <> 'cancelled' GROUP BY 1
  UNION ALL
  SELECT 'seed cost ' || to_char(purchase_date, 'YYYY-MM'), -SUM(grand_total) FROM t_bills WHERE deleted_at IS NULL GROUP BY 1
  UNION ALL
  SELECT 'lot stock allocated (all lots)', -SUM(allocated_quantity) FROM lots WHERE id IN (SELECT id FROM t_lots)
  UNION ALL
  SELECT 'seeds used (all bills)', -SUM(seeds_used) FROM seed_purchases WHERE id IN (SELECT id FROM t_bills);

CREATE TEMP TABLE m_before ON COMMIT DROP AS SELECT * FROM pg_temp.metrics();
CREATE TEMP TABLE f_before ON COMMIT DROP AS SELECT * FROM pg_temp.fingerprints();

-- ── 4. Delete, children before parents ────────────────────────────────────────
\echo '=== DELETING ==='
DELETE FROM invoices            WHERE id IN (SELECT id FROM t_invoices);          -- items + payment links cascade
DELETE FROM bank_ledger_entries WHERE id IN (SELECT id FROM t_ble);
DELETE FROM cash_ledger_entries WHERE id IN (SELECT id FROM t_cle);
DELETE FROM payments            WHERE id IN (SELECT id FROM t_payments);
DELETE FROM seed_usage_history  WHERE lot_id IN (SELECT id FROM t_lots);          -- only test bill <-> test lot rows (guarded)
DELETE FROM lots                WHERE id IN (SELECT id FROM t_lots);              -- order lines' lot link goes NULL: no stock released twice
DELETE FROM order_items         WHERE order_id IN (SELECT id FROM t_orders);
DELETE FROM orders              WHERE id IN (SELECT id FROM t_orders);            -- status history, installments cascade
DELETE FROM seed_purchases      WHERE id IN (SELECT id FROM t_bills);
DELETE FROM skus                WHERE id IN (SELECT id FROM t_skus);
DELETE FROM products            WHERE id IN (SELECT id FROM t_products);
DELETE FROM customers           WHERE id IN (SELECT id FROM t_customers);         -- addresses, credit rows cascade

-- The cleaned seeds_used / allocation of deleted rows is not a real change;
-- the two "all" figures are compared net of the removed rows via `expected`.

-- ── 5. Prove it ───────────────────────────────────────────────────────────────
CREATE TEMP TABLE m_after ON COMMIT DROP AS SELECT * FROM pg_temp.metrics();
CREATE TEMP TABLE f_after ON COMMIT DROP AS SELECT * FROM pg_temp.fingerprints();

\echo '=== EVERY FIGURE: before -> after (expected change / actual change) ==='
SELECT m.metric,
       COALESCE(b.value, 0) AS before, COALESCE(a.value, 0) AS after,
       COALESCE(e.delta, 0) AS expected_change,
       COALESCE(a.value, 0) - COALESCE(b.value, 0) AS actual_change,
       CASE WHEN COALESCE(a.value, 0) - COALESCE(b.value, 0) = COALESCE(e.delta, 0) THEN 'OK' ELSE '*** MISMATCH ***' END AS check
FROM (SELECT metric FROM m_before UNION SELECT metric FROM m_after UNION SELECT metric FROM expected) m
LEFT JOIN m_before b ON b.metric = m.metric
LEFT JOIN m_after  a ON a.metric = m.metric
LEFT JOIN (SELECT metric, SUM(delta) AS delta FROM expected GROUP BY metric) e ON e.metric = m.metric
ORDER BY (COALESCE(a.value, 0) - COALESCE(b.value, 0) = 0), m.metric;

\echo '=== EVERY OTHER ROW: fingerprint before = after ==='
SELECT b.tbl, b.rows AS rows_before, a.rows AS rows_after,
       CASE WHEN b.fp IS NOT DISTINCT FROM a.fp AND b.rows = a.rows THEN 'unchanged' ELSE '*** CHANGED ***' END AS check
FROM f_before b JOIN f_after a ON a.tbl = b.tbl ORDER BY b.tbl;

DO $$
DECLARE n int; x numeric; p params%ROWTYPE;
BEGIN
  SELECT * INTO p FROM params;
  -- (a) every figure moved by exactly its expected amount, to the paisa
  SELECT COUNT(*) INTO n
  FROM (SELECT metric FROM m_before UNION SELECT metric FROM m_after UNION SELECT metric FROM expected) m
  LEFT JOIN m_before b ON b.metric = m.metric
  LEFT JOIN m_after  a ON a.metric = m.metric
  LEFT JOIN (SELECT metric, SUM(delta) AS delta FROM expected GROUP BY metric) e ON e.metric = m.metric
  WHERE COALESCE(a.value, 0) - COALESCE(b.value, 0) <> COALESCE(e.delta, 0);
  IF n > 0 THEN RAISE EXCEPTION '% figure(s) did not move by the expected amount', n; END IF;

  -- (b) the approved totals, independently of (a)
  SELECT SUM(a.value - b.value) INTO x FROM m_after a JOIN m_before b USING (metric) WHERE metric LIKE 'bank: %';
  IF x <> -(p.exp_bank_removed) THEN RAISE EXCEPTION 'bank total moved by %, expected %', x, -(p.exp_bank_removed); END IF;
  SELECT SUM(a.value - b.value) INTO x FROM m_after a JOIN m_before b USING (metric) WHERE metric LIKE 'cash: %';
  IF x <> -(p.exp_cash_removed) THEN RAISE EXCEPTION 'cash total moved by %, expected %', x, -(p.exp_cash_removed); END IF;
  SELECT a.value - b.value INTO x FROM m_after a JOIN m_before b USING (metric) WHERE metric = 'payables: seed';
  IF x <> -(p.exp_bills_total) THEN RAISE EXCEPTION 'seed payables moved by %, expected %', x, -(p.exp_bills_total); END IF;
  SELECT COALESCE(SUM(COALESCE(a.value,0) - COALESCE(b.value,0)), 0) INTO x
    FROM m_before b FULL JOIN m_after a USING (metric) WHERE metric LIKE 'sales %';
  IF x <> -(p.exp_sales_removed) THEN RAISE EXCEPTION 'sales moved by %, expected %', x, -(p.exp_sales_removed); END IF;

  -- (c) no other row anywhere in the money tables changed by a single field
  SELECT COUNT(*) INTO n FROM f_before b JOIN f_after a ON a.tbl = b.tbl
   WHERE b.fp IS DISTINCT FROM a.fp OR b.rows <> a.rows;
  IF n > 0 THEN RAISE EXCEPTION '% table(s) had rows outside the target set change', n; END IF;

  -- (d) nothing left behind
  SELECT COUNT(*) INTO n FROM (
    SELECT source_id FROM bank_ledger_entries WHERE source_type = 'customer_payment' AND source_id IS NOT NULL
    UNION ALL SELECT source_id FROM cash_ledger_entries WHERE source_type = 'customer_payment' AND source_id IS NOT NULL) s
   WHERE s.source_id IN (SELECT id FROM t_payments);
  IF n > 0 THEN RAISE EXCEPTION '% ledger row(s) still point at removed payments', n; END IF;
END $$;

\echo ''
\echo '=== ALL CHECKS PASSED ==='
\if :apply
  COMMIT;
  \echo '*** COMMITTED — test data removed ***'
\else
  ROLLBACK;
  \echo '--- DRY RUN: everything rolled back, nothing was changed ---'
\endif
