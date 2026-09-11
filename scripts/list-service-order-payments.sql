-- ============================================================================
-- STEP 1 of 2: list historical service-order payments for account assignment
-- ============================================================================
--
-- Service-order money was never posted to the Cash Book or any Bank Ledger, and
-- the rows do not record which account received it. This lists every payment and
-- generates a ready-to-edit UPDATE for each, so the account can be assigned by
-- hand rather than guessed.
--
-- Nothing is modified by this script. It only reads and prints.
--
-- Workflow:
--   1. Run this. Copy the generated UPDATE statements from section 3.
--   2. Edit each one: set the correct account id (the accounts are listed in
--      section 1 for reference). Delete the line for any payment you want to
--      leave unassigned.
--   3. Run the edited statements against the database.
--   4. Run scripts/post-service-payments-to-ledger.sql, which posts a ledger
--      entry for every payment that now has an account and does not already
--      have one.
--
-- Usage on the production VM:
--   docker compose cp scripts/list-service-order-payments.sql postgres:/tmp/lsp.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -f /tmp/lsp.sql
-- ============================================================================

\pset pager off

\echo ''
\echo '=== 1. Accounts available for assignment ==='
SELECT 'bank' AS kind, id, account_name, bank_name, sort_order
FROM bank_accounts WHERE is_active = true
UNION ALL
SELECT 'cash', id, account_name, NULL, sort_order
FROM cash_accounts WHERE is_active = true
ORDER BY kind, sort_order;

\echo ''
\echo '=== 2. Totals not yet in any ledger ==='
SELECT
  sop.payment_method,
  COUNT(*)          AS payments,
  SUM(sop.amount)   AS total,
  MIN(sop.payment_date)::date AS earliest,
  MAX(sop.payment_date)::date AS latest
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.deleted_at IS NULL
  AND sop.payment_source IS NULL          -- not yet assigned an account
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 3. Copy these, set the account id on each, then run them ==='
\echo '--- cash / card / upi / bank_transfer are shown so you can tell them apart ---'
SELECT format(
  'UPDATE service_order_payments SET payment_source = %L, %s = ''PASTE_ACCOUNT_ID'' WHERE id = %L;  -- %s | %s | %s | %s | %s',
  CASE WHEN sop.payment_method = 'cash' THEN 'cash' ELSE 'bank' END,
  CASE WHEN sop.payment_method = 'cash' THEN 'cash_account_id' ELSE 'bank_account_id' END,
  sop.id,
  to_char(sop.payment_date, 'YYYY-MM-DD'),
  rpad(so.service_order_number, 18),
  rpad(COALESCE(c.name, 'Customer'), 28),
  lpad(sop.amount::text, 10),
  sop.payment_method
) AS assignment_sql
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
LEFT JOIN customers c ON c.id = so.customer_id
WHERE so.deleted_at IS NULL
  AND sop.payment_source IS NULL
ORDER BY sop.payment_date, sop.amount;

\echo ''
\echo '=== 4. Payments on SOFT-DELETED service orders (review separately) ==='
\echo '--- these are excluded above; assigning them would credit money for a deleted order ---'
SELECT sop.id, sop.payment_date::date, sop.amount, sop.payment_method,
       so.service_order_number, so.deleted_at::date AS order_deleted_on
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.deleted_at IS NOT NULL
ORDER BY sop.payment_date;
