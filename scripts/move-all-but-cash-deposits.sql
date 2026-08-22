-- ============================================================================
-- Move EVERYTHING except cash deposits from one bank account to another
-- ============================================================================
--
-- Account 2 is used only to hold cash deposits; every other kind of entry
-- belongs on Account 1. This moves them all in one pass, rather than one
-- source type at a time.
--
-- WHAT STAYS BEHIND, and why:
--
--   1. entry_type = 'opening_balance'
--      NOT a transaction — it is the absolute statement balance for THAT
--      account on that date, and computeBalance() uses it as the base before
--      adding movements. Moving it would corrupt both accounts' balances.
--      Note it is stored with source_type = 'manual', so filtering on
--      source_type alone would sweep it up. This is the important one.
--
--   2. source_type = 'cash_deposit'
--      The bank CREDIT half of a cash-drawer deposit. Its fund_transfers row
--      records to_bank_account_id, so leaving these put keeps the deposit
--      records and the ledger agreeing.
--
-- WHAT MOVES: customer_payment, vendor_payment, expense, payroll, advance,
-- material_purchase, and any hand-entered 'manual' credits/debits. Where the
-- originating record also stores the account, that is updated to match, so
-- reports and future syncs agree with the ledger.
--
-- Bank balances are computed from the ledger and never stored, so re-pointing
-- an entry corrects both accounts immediately.
--
-- SAFE TO RE-RUN: rows already on the destination are a no-op.
--
-- Usage on the production VM:
--   docker compose exec -T -u postgres postgres pg_dump -U nursery_user nursery_db > ~/backup-before-move.sql
--   docker compose cp scripts/move-all-but-cash-deposits.sql postgres:/tmp/mv.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db \
--     -v FROM_ACCOUNT=<account-2-id> -v TO_ACCOUNT=<account-1-id> -f /tmp/mv.sql
-- ============================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '=== Bank accounts (in the order the UI lists them) ==='
SELECT id, account_name, bank_name, account_number, sort_order, is_active
FROM bank_accounts
ORDER BY sort_order, created_at;

\if :{?FROM_ACCOUNT}
\else
  \set FROM_ACCOUNT '00000000-0000-0000-0000-000000000000'
\endif
\if :{?TO_ACCOUNT}
\else
  \set TO_ACCOUNT '00000000-0000-0000-0000-000000000000'
\endif

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


-- ── STEP 1: full breakdown of the FROM account ──────────────────────────────
\echo ''
\echo '=== Everything on the FROM account, and whether it moves ==='
SELECT
  CASE WHEN entry_type = 'opening_balance' THEN 'STAYS (opening balance)'
       WHEN source_type = 'cash_deposit'   THEN 'STAYS (cash deposit)'
       ELSE 'MOVES' END                    AS disposition,
  source_type,
  entry_type,
  COUNT(*)                                 AS entries,
  SUM(amount)                              AS total
FROM bank_ledger_entries
WHERE bank_account_id = :'FROM_ACCOUNT' AND deleted_at IS NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

\echo ''
\echo '=== The entries that will MOVE, line by line ==='
SELECT entry_date, entry_type, amount, party_name, source_type,
       COALESCE(narration, '') AS narration
FROM bank_ledger_entries
WHERE bank_account_id = :'FROM_ACCOUNT'
  AND deleted_at IS NULL
  AND entry_type <> 'opening_balance'
  AND source_type <> 'cash_deposit'
ORDER BY entry_date, amount;

\echo ''
\echo '=== Balances BEFORE ==='
SELECT ba.account_name,
       SUM(CASE WHEN ble.entry_type = 'credit' THEN ble.amount
                WHEN ble.entry_type = 'debit'  THEN -ble.amount ELSE 0 END) AS net_movement
FROM bank_ledger_entries ble
JOIN bank_accounts ba ON ba.id = ble.bank_account_id
WHERE ble.deleted_at IS NULL AND ble.entry_type IN ('credit', 'debit')
GROUP BY ba.account_name ORDER BY ba.account_name;


-- ── STEP 2: move ────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE moved_entries ON COMMIT DROP AS
WITH m AS (
  UPDATE bank_ledger_entries
     SET bank_account_id = :'TO_ACCOUNT',
         updated_at      = NOW()
   WHERE bank_account_id = :'FROM_ACCOUNT'
     AND deleted_at IS NULL
     AND entry_type <> 'opening_balance'   -- account property, not a transaction
     AND source_type <> 'cash_deposit'     -- deliberately kept on this account
  RETURNING source_type, source_id
)
SELECT * FROM m;

\echo ''
\echo '=== Ledger entries moved ==='
SELECT COUNT(*) AS moved FROM moved_entries;

-- Keep each originating record in step with its ledger entry, so reports and
-- any future sync agree about which account paid. Constraints on these tables
-- require exactly one account consistent with payment_source; swapping one
-- bank id for another preserves that.
UPDATE payments p SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'customer_payment' AND p.id = m.source_id;

UPDATE seed_purchase_payments spp SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'vendor_payment' AND spp.id = m.source_id
  AND spp.bank_account_id IS NOT NULL;   -- leave legacy unattributed rows alone

UPDATE expenses e SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'expense' AND e.id = m.source_id AND e.payment_source = 'bank';

UPDATE payroll_items pi SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'payroll' AND pi.id = m.source_id AND pi.payment_source = 'bank';

UPDATE employee_advances ea SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'advance' AND ea.id = m.source_id AND ea.payment_source = 'bank';

UPDATE material_purchase_payments mpp SET bank_account_id = :'TO_ACCOUNT'
FROM moved_entries m
WHERE m.source_type = 'material_purchase' AND mpp.id = m.source_id AND mpp.payment_source = 'bank';


-- ── STEP 3: verify, then COMMIT or ROLLBACK ─────────────────────────────────
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
\echo '=== What remains on the FROM account (should be deposits + opening balance only) ==='
SELECT source_type, entry_type, COUNT(*) AS entries, SUM(amount) AS total
FROM bank_ledger_entries
WHERE bank_account_id = :'FROM_ACCOUNT' AND deleted_at IS NULL
GROUP BY source_type, entry_type
ORDER BY source_type, entry_type;

COMMIT;
-- If the numbers above look wrong, run  ROLLBACK;  instead of COMMIT;
