-- ============================================================================
-- Move vendor-payment debits from one bank account to another
-- ============================================================================
--
-- Why every one of these is suspect, unlike the customer-side script:
-- `seed_purchase_payments` never had a bank_account_id column, so no vendor
-- payment ever recorded which account it left. The ONLY thing that put these
-- entries in the Bank Ledger was the debit half of syncFromPayments, which had
-- no account filter at all and debited every bank/cheque vendor payment to
-- whichever account happened to be synced. So there is no "explicitly set"
-- category here — the account on these rows was always a guess.
--
-- Requires migration 1769000000014 (adds seed_purchase_payments.bank_account_id).
-- Step 4 backfills that column so the corrected sync can see these rows and
-- will not re-file them somewhere else.
--
-- Bank balances are computed dynamically from the ledger and never stored, so
-- re-pointing an entry corrects BOTH accounts immediately.
--
-- SAFE TO RE-RUN: rows already on the destination are a no-op.
--
-- Usage on the production VM:
--   docker compose exec -T -u postgres postgres pg_dump -U nursery_user nursery_db > ~/backup-before-vendor-move.sql
--   docker compose cp scripts/move-vendor-payments-between-banks.sql postgres:/tmp/vmove.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -f /tmp/vmove.sql
-- ============================================================================


\set ON_ERROR_STOP on

-- ── STEP 1: identify the accounts ───────────────────────────────────────────
\echo ''
\echo '=== Bank accounts (in the order the UI lists them) ==='
SELECT id, account_name, bank_name, account_number, sort_order, is_active
FROM bank_accounts
ORDER BY sort_order, created_at;

-- Pass the accounts on the command line:
--   psql ... -v FROM_ACCOUNT=<id> -v TO_ACCOUNT=<id> -f this-file.sql
-- (or edit the defaults below).
\if :{?FROM_ACCOUNT}
\else
  \set FROM_ACCOUNT '00000000-0000-0000-0000-000000000000'
\endif
\if :{?TO_ACCOUNT}
\else
  \set TO_ACCOUNT '00000000-0000-0000-0000-000000000000'
\endif

-- Stop loudly if the accounts were never supplied. Without this the script
-- reports a cheerful "UPDATE 0" and looks like it worked.
-- (Evaluated into a psql variable rather than as a failing cast in a WHERE:
--  Postgres constant-folds a literal cast at planning time, so it would error
--  even when the condition is false.)
SELECT CASE
         WHEN :'FROM_ACCOUNT' = '00000000-0000-0000-0000-000000000000'
           OR :'TO_ACCOUNT'   = '00000000-0000-0000-0000-000000000000'
         THEN 'true' ELSE 'false'
       END AS accounts_unset \gset

\if :accounts_unset
\echo ''
\echo '****************************************************************'
\echo '  ABORTED: account ids not supplied. Nothing has been changed.'
\echo '  Re-run with the ids listed above, e.g.:'
\echo '    psql ... -v FROM_ACCOUNT=<from-id> -v TO_ACCOUNT=<to-id> -f ...'
\echo '****************************************************************'
\quit
\endif


-- ── STEP 2: review what would move ──────────────────────────────────────────
\echo ''
\echo '=== Vendor payment debits currently on the FROM account ==='
SELECT COUNT(*) AS entries,
       SUM(ble.amount) AS total,
       MIN(ble.entry_date) AS earliest,
       MAX(ble.entry_date) AS latest
FROM bank_ledger_entries ble
WHERE ble.source_type = 'vendor_payment'
  AND ble.deleted_at IS NULL
  AND ble.bank_account_id = :'FROM_ACCOUNT';

\echo ''
\echo '=== Line-by-line (review before moving) ==='
SELECT ble.entry_date, ble.amount, ble.party_name,
       spp.payment_method, spp.transaction_reference, sp.purchase_number
FROM bank_ledger_entries ble
LEFT JOIN seed_purchase_payments spp ON spp.id = ble.source_id
LEFT JOIN seed_purchases sp ON sp.id = spp.seed_purchase_id
WHERE ble.source_type = 'vendor_payment'
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


-- ── STEP 3 + 4: move the entries, and stamp the payment rows to match ───────
BEGIN;

UPDATE bank_ledger_entries
   SET bank_account_id = :'TO_ACCOUNT',
       updated_at      = NOW()
 WHERE source_type = 'vendor_payment'
   AND deleted_at IS NULL
   AND bank_account_id = :'FROM_ACCOUNT';

-- Backfill the new column so the corrected sync can see these rows. Only rows
-- that still have no account are touched, so anything recorded through the new
-- UI (which always names its account) is left exactly as entered.
UPDATE seed_purchase_payments spp
   SET payment_source  = 'bank',
       bank_account_id = :'TO_ACCOUNT'
 WHERE spp.bank_account_id IS NULL
   AND spp.payment_method IN ('bank_transfer', 'cheque')
   AND EXISTS (
     SELECT 1 FROM bank_ledger_entries ble
     WHERE ble.source_id = spp.id
       AND ble.source_type = 'vendor_payment'
       AND ble.deleted_at IS NULL
       AND ble.bank_account_id = :'TO_ACCOUNT'
   );

-- ── STEP 5: verify, then COMMIT or ROLLBACK ─────────────────────────────────
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
\echo '=== Vendor debits LEFT on the FROM account ==='
SELECT COUNT(*) AS remaining, COALESCE(SUM(amount), 0) AS total
FROM bank_ledger_entries
WHERE source_type = 'vendor_payment'
  AND deleted_at IS NULL
  AND bank_account_id = :'FROM_ACCOUNT';

COMMIT;
-- If the numbers above look wrong, run  ROLLBACK;  instead of COMMIT;
