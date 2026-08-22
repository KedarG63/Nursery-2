-- ============================================================================
-- Move customer-payment receipts from one bank account to another
-- ============================================================================
--
-- Why this exists: syncFromPayments used to match
--     (p.bank_account_id = $1 OR p.bank_account_id IS NULL)
-- so whichever bank account was synced first absorbed EVERY receipt in the
-- system that named no account. That is fixed in code (commit 52543b7), but the
-- ledger rows it already wrote are still filed against the wrong account.
--
-- Bank balances are computed dynamically from the ledger and never stored, so
-- re-pointing an entry's bank_account_id instantly corrects BOTH accounts.
-- Nothing else needs recalculating.
--
-- SAFE TO RE-RUN: moving rows that are already on the destination is a no-op.
--
-- Usage on the production VM:
--   docker compose exec -T -u postgres postgres pg_dump -U nursery_user nursery_db > ~/backup-before-move.sql
--   docker compose cp scripts/move-customer-payments-between-banks.sql postgres:/tmp/move.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -f /tmp/move.sql
-- ============================================================================


-- ── STEP 1: identify the accounts ───────────────────────────────────────────
\echo ''
\echo '=== Bank accounts (in the order the UI lists them) ==='
SELECT id, account_name, bank_name, account_number, sort_order, is_active
FROM bank_accounts
ORDER BY sort_order, created_at;

-- >>> EDIT THESE TWO LINES with the ids printed above, then re-run. <<<
\set FROM_ACCOUNT '00000000-0000-0000-0000-000000000000'
\set TO_ACCOUNT   '00000000-0000-0000-0000-000000000000'


-- ── STEP 2: what is sitting on the FROM account, and where it came from ─────
-- 'swept_by_sync'  = the payment names no bank account. These could ONLY have
--                    been placed here by the old sync bug — always safe to move.
-- 'explicitly_set' = the payment itself names this account. Someone chose it,
--                    so check these before moving them.
\echo ''
\echo '=== Customer receipts currently on the FROM account ==='
SELECT
  CASE WHEN p.bank_account_id IS NULL THEN 'swept_by_sync' ELSE 'explicitly_set' END AS origin,
  COUNT(*)    AS entries,
  SUM(ble.amount) AS total,
  MIN(ble.entry_date) AS earliest,
  MAX(ble.entry_date) AS latest
FROM bank_ledger_entries ble
JOIN payments p ON p.id = ble.source_id
WHERE ble.source_type = 'customer_payment'
  AND ble.deleted_at IS NULL
  AND ble.bank_account_id = :'FROM_ACCOUNT'
GROUP BY 1;

\echo ''
\echo '=== Line-by-line (review before moving) ==='
SELECT ble.entry_date, ble.amount, ble.party_name, p.payment_method,
       COALESCE(p.receipt_number, p.transaction_id) AS reference,
       CASE WHEN p.bank_account_id IS NULL THEN 'swept_by_sync' ELSE 'explicitly_set' END AS origin
FROM bank_ledger_entries ble
JOIN payments p ON p.id = ble.source_id
WHERE ble.source_type = 'customer_payment'
  AND ble.deleted_at IS NULL
  AND ble.bank_account_id = :'FROM_ACCOUNT'
ORDER BY ble.entry_date, ble.amount;

\echo ''
\echo '=== Balances BEFORE ==='
SELECT ba.account_name,
       SUM(CASE WHEN ble.entry_type = 'credit' THEN ble.amount
                WHEN ble.entry_type = 'debit'  THEN -ble.amount ELSE 0 END) AS net_movement
FROM bank_ledger_entries ble
JOIN bank_accounts ba ON ba.id = ble.bank_account_id
WHERE ble.deleted_at IS NULL AND ble.entry_type IN ('credit', 'debit')
GROUP BY ba.account_name ORDER BY ba.account_name;


-- ── STEP 3: move ────────────────────────────────────────────────────────────
BEGIN;

-- Re-point the ledger entries, and stamp the payment rows to match so a future
-- sync cannot reclaim them. Both happen together or not at all.
--
-- NOTE: this moves ONLY entries whose payment names no bank account, i.e. the
-- ones the old sync bug misfiled. To move the 'explicitly_set' rows as well,
-- delete the marked line below — do that only if you have reviewed the
-- line-by-line list above and confirmed none of them truly belong here.
WITH moved AS (
  UPDATE bank_ledger_entries ble
     SET bank_account_id = :'TO_ACCOUNT',
         updated_at      = NOW()
   WHERE ble.source_type = 'customer_payment'
     AND ble.deleted_at IS NULL
     AND ble.bank_account_id = :'FROM_ACCOUNT'
     AND EXISTS (
       SELECT 1 FROM payments p
       WHERE p.id = ble.source_id
         AND p.bank_account_id IS NULL          -- <<< DELETE THIS LINE to move everything
     )
  RETURNING ble.source_id
)
UPDATE payments p
   SET bank_account_id = :'TO_ACCOUNT'
  FROM moved m
 WHERE p.id = m.source_id;

-- ── STEP 4: verify, then COMMIT or ROLLBACK ─────────────────────────────────
\echo ''
\echo '=== Balances AFTER (still inside the transaction) ==='
SELECT ba.account_name,
       SUM(CASE WHEN ble.entry_type = 'credit' THEN ble.amount
                WHEN ble.entry_type = 'debit'  THEN -ble.amount ELSE 0 END) AS net_movement
FROM bank_ledger_entries ble
JOIN bank_accounts ba ON ba.id = ble.bank_account_id
WHERE ble.deleted_at IS NULL AND ble.entry_type IN ('credit', 'debit')
GROUP BY ba.account_name ORDER BY ba.account_name;

\echo ''
\echo '=== Anything LEFT on the FROM account ==='
SELECT COUNT(*) AS remaining, COALESCE(SUM(ble.amount), 0) AS total
FROM bank_ledger_entries ble
WHERE ble.source_type = 'customer_payment'
  AND ble.deleted_at IS NULL
  AND ble.bank_account_id = :'FROM_ACCOUNT';

COMMIT;
-- If the numbers above look wrong, run  ROLLBACK;  instead of COMMIT;
