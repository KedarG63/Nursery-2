-- ============================================================================
-- STEP 2 of 2: post assigned service-order payments into the ledgers
-- ============================================================================
--
-- Posts a CREDIT for every service_order_payment that HAS been assigned an
-- account (payment_source IS NOT NULL) and does not already have a ledger
-- entry. Run scripts/list-service-order-payments.sql first and apply the
-- assignments it generates.
--
-- Requires migration 1769000000015 (adds the account columns and the
-- 'service_payment' source type to both ledger enums).
--
-- SAFE TO RE-RUN: guarded by NOT EXISTS on source_type='service_payment' +
-- source_id, so a second run posts nothing. Payments still unassigned are
-- skipped, not guessed at.
--
-- Soft-deleted service orders are excluded — crediting money for a deleted
-- order would inflate the balance.
--
-- This RAISES the Cash-in-Hand / bank balances, which is the intended fix:
-- the money was received but never recorded.
--
-- Usage on the production VM:
--   docker compose exec -T -u postgres postgres pg_dump -U nursery_user nursery_db > ~/backup-before-service-post.sql
--   docker compose cp scripts/post-service-payments-to-ledger.sql postgres:/tmp/psp.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -f /tmp/psp.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '=== What will post ==='
SELECT sop.payment_source,
       COUNT(*)        AS payments,
       SUM(sop.amount) AS total
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.deleted_at IS NULL
  AND sop.payment_source IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bank_ledger_entries b
    WHERE b.source_type = 'service_payment' AND b.source_id = sop.id AND b.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger_entries cl
    WHERE cl.source_type = 'service_payment' AND cl.source_id = sop.id AND cl.deleted_at IS NULL
  )
GROUP BY 1;

\echo ''
\echo '=== Still UNASSIGNED (skipped — assign them first if they should post) ==='
SELECT COUNT(*) AS unassigned, COALESCE(SUM(sop.amount), 0) AS total
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
WHERE so.deleted_at IS NULL AND sop.payment_source IS NULL;

\echo ''
\echo '=== Balances BEFORE ==='
SELECT ba.account_name,
       SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount
                WHEN e.entry_type = 'debit'  THEN -e.amount ELSE 0 END) AS net_movement
FROM bank_ledger_entries e JOIN bank_accounts ba ON ba.id = e.bank_account_id
WHERE e.deleted_at IS NULL AND e.entry_type IN ('credit','debit')
GROUP BY 1
UNION ALL
SELECT ca.account_name || ' (cash)',
       SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount
                WHEN e.entry_type = 'debit'  THEN -e.amount ELSE 0 END)
FROM cash_ledger_entries e JOIN cash_accounts ca ON ca.id = e.cash_account_id
WHERE e.deleted_at IS NULL AND e.entry_type IN ('credit','debit')
GROUP BY 1
ORDER BY 1;


BEGIN;

-- Bank-side receipts
INSERT INTO bank_ledger_entries
  (bank_account_id, entry_date, entry_type, amount, party_name, narration,
   reference_number, source_type, source_id, created_by)
SELECT
  sop.bank_account_id,
  sop.payment_date::date,
  'credit',
  sop.amount,
  COALESCE(c.name, 'Customer'),
  'Service order payment (backfill) ' || so.service_order_number,
  so.service_order_number,
  'service_payment',
  sop.id,
  sop.received_by
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
LEFT JOIN customers c ON c.id = so.customer_id
WHERE so.deleted_at IS NULL
  AND sop.payment_source = 'bank'
  AND sop.bank_account_id IS NOT NULL
  AND sop.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM bank_ledger_entries b
    WHERE b.source_type = 'service_payment' AND b.source_id = sop.id AND b.deleted_at IS NULL
  );

-- Cash-side receipts
INSERT INTO cash_ledger_entries
  (cash_account_id, entry_date, entry_type, amount, party_name, narration,
   reference_number, source_type, source_id, created_by)
SELECT
  sop.cash_account_id,
  sop.payment_date::date,
  'credit',
  sop.amount,
  COALESCE(c.name, 'Customer'),
  'Service order payment (backfill) ' || so.service_order_number,
  so.service_order_number,
  'service_payment',
  sop.id,
  sop.received_by
FROM service_order_payments sop
JOIN service_orders so ON so.id = sop.service_order_id
LEFT JOIN customers c ON c.id = so.customer_id
WHERE so.deleted_at IS NULL
  AND sop.payment_source = 'cash'
  AND sop.cash_account_id IS NOT NULL
  AND sop.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger_entries cl
    WHERE cl.source_type = 'service_payment' AND cl.source_id = sop.id AND cl.deleted_at IS NULL
  );

\echo ''
\echo '=== Balances AFTER (still inside the transaction) ==='
SELECT ba.account_name,
       SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount
                WHEN e.entry_type = 'debit'  THEN -e.amount ELSE 0 END) AS net_movement
FROM bank_ledger_entries e JOIN bank_accounts ba ON ba.id = e.bank_account_id
WHERE e.deleted_at IS NULL AND e.entry_type IN ('credit','debit')
GROUP BY 1
UNION ALL
SELECT ca.account_name || ' (cash)',
       SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount
                WHEN e.entry_type = 'debit'  THEN -e.amount ELSE 0 END)
FROM cash_ledger_entries e JOIN cash_accounts ca ON ca.id = e.cash_account_id
WHERE e.deleted_at IS NULL AND e.entry_type IN ('credit','debit')
GROUP BY 1
ORDER BY 1;

COMMIT;
-- If the numbers above look wrong, run  ROLLBACK;  instead of COMMIT;
