# Accounting Suite — Implementation Reference

This document records the accounting features added to the Plant Nursery Management
System: **Expenses, Cash-in-Hand, Cash Deposits, Payroll, and 360° dashboards**.

**Design principle — error-free = self-reconciling:** every money-out event (expense,
payroll/wage payout, advance) selects exactly one payment source (Cash-in-Hand or a
specific Bank account) and, in the *same DB transaction*, writes a matching ledger
entry that decreases that source's running balance. Cash↔Bank deposits are paired
double entries. Cash and bank therefore can never silently drift.

**Roles:** `Admin`, `Manager`, and a new `Accountant` role can use all finance modules.

**Production-safety:** all changes are additive (new tables / routes / pages). The only
change to an existing DB object is `ALTER TYPE bank_ledger_source_type_enum ADD VALUE …`
(backward-compatible). Every migration is reversible (`down` drops what `up` created)
and idempotent.

---

## Phase 0 — Accountant role

| Item | Path |
|---|---|
| Migration (seeds `Accountant` into `roles`, `ON CONFLICT DO NOTHING`) | `backend/migrations/1769000000001_add-accountant-role.js` |
| Frontend role constants + `canManageFinance` / `canViewFinance` / `FINANCE_ROLES` | `frontend/src/utils/roleCheck.js` |

All new routes use `authorize(['Admin','Manager','Accountant'])` (Admin already has
implicit access to everything via `backend/middleware/authorize.js`).

---

## Phase 1 — Expenses + Cash-in-Hand + Deposits  ✅ implemented & verified

### Database (migrations)

`backend/migrations/1769000000002_extend-bank-ledger-source-type.js`
- Extends `bank_ledger_source_type_enum` with `expense`, `payroll`, `advance`, `cash_deposit`
  via `pgm.addTypeValue(..., { ifNotExists: true })`. `down` is a deliberate no-op
  (dropping enum values is unsafe on a live table; unused values are harmless).

`backend/migrations/1769000000003_create-cash-and-expenses.js` creates:

| Table | Purpose | Key columns |
|---|---|---|
| `cash_accounts` | Cash drawer(s); mirrors `bank_accounts`. Seeds "Main Cash Drawer". | `account_name`, `is_active`, `sort_order` |
| `cash_ledger_entries` | Tally-style cash book; mirrors `bank_ledger_entries`. FY auto-computed by trigger. | `cash_account_id`, `entry_date`, `financial_year`, `entry_type` (opening_balance/credit/debit), `amount`, `party_name`, `narration`, `source_type`, `source_id`, audit + `deleted_at/by` |
| `expense_categories` | Category master. Seeds Transport, Cocopeat, Tray, Pesticide, Fertilizer, Stationery, Labour, Utilities, Miscellaneous. | `name` (unique), `code`, `is_active`, `sort_order` |
| `expenses` | Daily expenses; each posts a DEBIT to cash/bank ledger. | `expense_number` (EXP-YYYYMMDD-XXXX), `expense_date`, `financial_year`, `category_id`, `vendor_id` (nullable), `amount`, `tax_amount`, `payment_source` (cash/bank), `bank_account_id`/`cash_account_id`, `description`, `attachment_url`, audit |
| `fund_transfers` | Cash → Bank deposits. Owns a paired cash DEBIT + bank CREDIT. | `transfer_number` (DEP-YYYYMMDD-XXXX), `transfer_date`, `from_cash_account_id`, `to_bank_account_id`, `amount`, `reference_number`, `notes`, audit |

Enums created: `cash_ledger_entry_type_enum`, `cash_ledger_source_type_enum`, `expense_payment_source_enum`.

**Key constraints (the "error-free" guarantees):**
- `expenses.chk_expenses_source_consistency` — exactly one of bank/cash account set, matching `payment_source`.
- `amount > 0` checks on expenses, cash ledger, fund transfers.
- Partial unique index `uq_cle_source_id` on `(source_type, source_id) WHERE source_id IS NOT NULL AND deleted_at IS NULL` — prevents duplicate auto-posts.
- `compute_cash_ledger_financial_year` trigger fills `financial_year` (Apr–Mar) on insert/update.

> Note: `bank_ledger_entries` has `updated_by` + `deleted_at` but **no `deleted_by`** column.
> Reversal SQL writes `deleted_by` only on `cash_ledger_entries`.

### Backend

Shared util: `backend/utils/financialYear.js` — `financialYear(date)` and
`generateDocNumber(client, table, column, prefix, date)` (daily-sequenced doc numbers).

| Controller | Routes | Mounted at |
|---|---|---|
| `controllers/cashLedgerController.js` (clone of bank ledger: list, opening balance, ledger w/ running balance, manual entry CRUD, monthly summary; exports `computeBalance`) | `routes/cashLedger.js` | `/api/cash-accounts` |
| `controllers/expenseController.js` (create/update/delete w/ atomic ledger post + reversal; list w/ filters; category-grouped summary; category CRUD; exports `postSourceDebit`, `reverseSourceEntries`) | `routes/expenses.js` (+ `validators/expenseValidator.js`) | `/api/expenses` |
| `controllers/fundTransferController.js` (create w/ cash-balance guard + paired legs; list; delete reverses both legs) | `routes/fundTransfers.js` | `/api/fund-transfers` |

All registered in `backend/server.js`. Every mutation runs in `BEGIN/COMMIT/ROLLBACK`
(pattern from `paymentController.js`).

**Endpoints**
- `GET/POST/PUT /api/cash-accounts`, `POST /api/cash-accounts/:id/opening-balance`,
  `GET /api/cash-accounts/:id/ledger`, `POST|PUT|DELETE /api/cash-accounts/:id/entries[/:entryId]`,
  `GET /api/cash-accounts/:id/summary`
- `GET/POST/PUT/DELETE /api/expenses[/:id]`, `GET /api/expenses/summary`,
  `GET/POST/PUT /api/expenses/categories[/:id]`
- `GET/POST/DELETE /api/fund-transfers[/:id]`

### Frontend

| File | Purpose |
|---|---|
| `services/expenseService.js`, `cashLedgerService.js`, `fundTransferService.js` | API clients (axios pattern) |
| `pages/Accounting/ExpensesPage.jsx` | Summary cards + filterable table + add/edit dialog + delete |
| `pages/Accounting/CashBookPage.jsx` | Cash balance card, opening balance, manual entry, ledger w/ running balance |
| `pages/Accounting/DepositsPage.jsx` | Record Cash→Bank deposit + history, shows available cash |
| `routes/index.jsx` | Routes `/accounting/expenses`, `/accounting/cash-book`, `/accounting/deposits` |
| `config/menuItems.js` | Nav entries (Expenses, Cash Book, Cash Deposits); Bank Ledger now visible to Accountant too |
| `i18n/locales/en.json`, `hi.json` | `nav.*` + `accounting.*` keys |

### Verification (Phase 1)

- Migrations `up`, then `down ×3` (tables drop, role removed) → `up` again: clean & reversible.
- API smoke test (admin token), 16 assertions all pass: opening 10000 → cash expense 8500
  → edit 8000 → switch source to bank (cash back to 10000, bank −2000) → delete (bank restored)
  → deposit 3000 (cash 7000, bank +3000) → over-deposit rejected (400) → delete deposit (both reversed).
- Frontend `npm run build`: success (no errors from new code).
- Backend tests: 53/53 pass (1 pre-existing `lotAllocation` mock-suite failure, unrelated).
- Tested only against local dev DB (`NODE_ENV=development`); test rows purged afterward. **Production not migrated.**

### How to run migrations locally
```bash
cd backend
# Windows PowerShell, set PG* from .env to avoid node-pg-migrate host-resolution bug:
$env:PGHOST="localhost"; $env:PGPORT="5432"; $env:PGUSER="postgres"; $env:PGDATABASE="Nursery_management_software"; $env:PGPASSWORD="<from .env>"
npm run migrate:up
```
For production, follow the deploy notes (build image first, run migrations in-container,
check for schema drift before applying).

---

## Phase 2 — Payroll, Daily Wages & Advances  ✅ implemented & verified

### Database — `backend/migrations/1769000000004_create-payroll.js`

| Table | Purpose | Key columns |
|---|---|---|
| `employees` | Salaried staff + daily-wage workers | `employee_code` (EMP-XXXX), `full_name`, `employee_type` (salaried/daily_wage), `monthly_salary`, `daily_rate`, `status`, bank/UPI fields, audit |
| `employee_attendance` | Per-day attendance; drives wage calc | `employee_id`, `work_date`, `status` (present/absent/half_day/paid_leave), `units`; unique `(employee_id, work_date)` |
| `payroll_runs` | A salary/wages run for a month | `run_number` (PR-YYYYMM-XXXX), `period_month`, `period_year`, `run_type` (salary/wages), `status` (draft/finalized/paid), totals, audit |
| `payroll_items` | Per-employee line in a run | `payroll_run_id`, `employee_id`, `gross_amount`, `days_worked`, `advance_deducted`, `net_amount`, `status` (pending/paid), `payment_source`, `bank_account_id`/`cash_account_id`, `paid_at` |
| `employee_advances` | Advances paid to staff | `advance_number` (ADV-YYYYMMDD-XXXX), `employee_id`, `amount`, `amount_recovered`, `status` (outstanding/recovered), `payment_source`, account, audit |

Enums: `employee_type_enum`, `employee_status_enum`, `attendance_status_enum`,
`payroll_run_type_enum`, `payroll_run_status_enum`, `payroll_item_status_enum`,
`payout_source_enum`, `advance_status_enum`.

Constraints enforce: salaried⇒`monthly_salary`, daily_wage⇒`daily_rate`;
a paid payroll item / an advance must have exactly one consistent payment source;
`amount_recovered <= amount`.

### Backend

| Controller | Routes | Mounted |
|---|---|---|
| `employeeController.js` (CRUD, lists outstanding advance per employee) | `routes/employees.js` (+ `validators/employeeValidator.js`) | `/api/employees` |
| `attendanceController.js` (single upsert, bulk-by-date, roster view) | `routes/attendance.js` | `/api/attendance` |
| `payrollController.js` (preview ⇒ create draft ⇒ pay ⇒ delete) | `routes/payroll.js` | `/api/payroll` |
| `advanceController.js` (create posts cash/bank DEBIT; list; delete reverses) | `routes/advances.js` | `/api/advances` |

Advance & payroll payouts reuse Phase 1's `postSourceDebit` / `reverseSourceEntries`
(`source_type='advance'` / `'payroll'`). Paying a run, per item, in one transaction:
(1) posts the net as a cash/bank DEBIT, (2) recovers outstanding advances FIFO by
`advance_deducted`, (3) marks the item paid.

**Endpoints**
- `GET/POST/GET:id/PUT/DELETE /api/employees`
- `GET/POST /api/attendance`, `POST /api/attendance/bulk`
- `POST /api/payroll/runs/preview`, `GET/POST /api/payroll/runs`, `GET /api/payroll/runs/:id`,
  `POST /api/payroll/runs/:id/pay`, `DELETE /api/payroll/runs/:id`
- `GET/POST/DELETE /api/advances[/:id]`

### Frontend

| File | Purpose |
|---|---|
| `services/{employee,attendance,payroll,advance}Service.js` | API clients |
| `pages/Payroll/EmployeesPage.jsx` | Employee master + add/edit dialog (type toggle) |
| `pages/Payroll/AttendancePage.jsx` | Date roster of active daily-wage workers; bulk save |
| `pages/Payroll/PayrollRunPage.jsx` | New run: preview → editable advance deduction → create draft; runs list; Pay dialog (cash/bank); View details |
| `pages/Payroll/AdvancesPage.jsx` | Advances list + give-advance dialog |
| `routes/index.jsx` | `/payroll/employees`, `/payroll/attendance`, `/payroll/runs`, `/payroll/advances` |
| `config/menuItems.js` | Nav: Employees, Attendance, Payroll, Advances |
| `i18n/locales/en.json`, `hi.json` | `nav.*` + `payroll.*` keys |

### Verification (Phase 2)
- Migration `up`, then `down`→`up`: 5 tables drop & restore cleanly.
- API smoke test, **12/12 assertions pass**: create salaried + daily-wage employees;
  mark 10 days attendance; advance ₹5000 from cash (cash 50000→45000); wages preview
  (gross = 10×500 = 5000, days=10); salary preview (gross 30000, suggested advance
  deduction 5000, net 25000); create draft run; pay from bank (bank 100000→75000 = net);
  advance auto-recovered to ₹0 (status `recovered`); run + item marked paid.
- Frontend `npm run build`: success.
- Tested against local dev DB only; test rows purged afterward. **Production not migrated.**

## Phase 3 — Customer / Vendor / Employee 360° dashboards  ✅ implemented & verified

Click a customer, vendor, or employee → see **all business with them**, windowed by
**This Week / This Month / This Year**. Read-only aggregation over existing tables — no
schema changes, no migration.

### Backend — `controllers/partySummaryController.js` (new, additive)

A single controller with `customerSummary`, `vendorSummary`, `employeeSummary`. Each
takes `?period=year|month|week` (+ optional `date`) and returns: headline KPIs for the
window, a zero-filled time-series (year→by month, month/week→by day), and recent
transactions. The window + sub-buckets are computed in `buildWindow()`; the SQL `date_trunc`
grain (`month`/`day`) comes only from our own code (never user input).

Wired with one route line each (no existing handler modified):
- `GET /api/customers/:id/summary` → `routes/customers.js` (Admin/Manager/Sales/Accountant)
- `GET /api/vendors/:id/summary` → `routes/vendors.js` (Admin/Manager/Accountant)
- `GET /api/employees/:id/summary` → `routes/employees.js` (Finance roles)

Aggregations:
- **Customer:** orders (count/ordered/paid/balance) + payments received; all-time outstanding; recent orders + payments.
- **Vendor:** seed_purchases (purchased/paid) + vendor payments + returns + linked **expenses** (`vendor_id`); all-time outstanding; recent purchases/payments/expenses.
- **Employee:** paid payroll items (net/gross) + advances given + attendance days; outstanding advance; recent payouts + advances.

### Frontend

| File | Purpose |
|---|---|
| `services/partySummaryService.js` | `getCustomerSummary` / `getVendorSummary` / `getEmployeeSummary` |
| `components/Accounting/PartySummary360.jsx` | Reusable panel: Week/Month/Year toggle, KPI cards, recharts bar trend, recent-transactions table |
| `pages/Customers/CustomerDetails.jsx` | **Extended** — adds the 360 panel (existing content untouched) |
| `pages/Purchases/VendorDetails.jsx` | **New** — vendor header + 360 panel; route `/purchases/vendors/:id` |
| `pages/Payroll/EmployeeDetails.jsx` | **New** — employee header + 360 panel; route `/payroll/employees/:id` |
| `pages/Purchases/VendorsList.jsx`, `pages/Payroll/EmployeesPage.jsx` | Name made clickable → opens the 360 view |
| `routes/index.jsx`, `i18n/locales/*` | Routes + `summary.*` keys |

### Verification (Phase 3)
- API smoke test, **9/9 assertions pass**: customer summary returns 200 with correct
  bucket counts (year=12, month=days-in-month, week=7) and headline; vendor summary 200 +
  headline + 12 buckets; employee summary on controlled data — advance ₹2,000 reflected in
  window, outstanding ₹2,000, attendance day counted, month buckets correct.
- Frontend `npm run build`: success.
- Read-only endpoints; the only test writes (an employee + advance + attendance) were purged.
  **Production not migrated** (Phase 3 needs no migration anyway).

---

## Phase 5 — Supplies & Materials purchases (vendor payables + tranche payments)  ⏳ built, prod not migrated

For non-seed supplies (cocopeat, fertilizer, trays, …) bought from their own vendors,
often **paid in installments**. Unlike Expenses (money leaves immediately), a material
purchase is a **payable**: creating it records what you owe; money moves only when
payment tranches are recorded, each posting a DEBIT to the chosen cash/bank ledger
(same self-reconciling contract via the shared `postSourceDebit`/`reverseSourceEntries`).

### Database (migrations)

`backend/migrations/1769000000007_extend-ledger-source-type-material.js`
- Adds `material_purchase` to **both** `bank_ledger_source_type_enum` and
  `cash_ledger_source_type_enum` (`addTypeValue … ifNotExists`; `down` no-op).

`backend/migrations/1769000000008_create-material-purchases.js` creates:

| Table | Purpose | Key columns |
|---|---|---|
| `material_purchases` | Supplies payable register. `grand_total` = amount+tax+other (trigger); `amount_paid`/`payment_status` kept in sync by the payments trigger. | `purchase_number` (SUP-YYYYMMDD-XXXX), `purchase_date`, `financial_year`, `vendor_id`, `category_id`→`expense_categories` (reused, nullable), `item_description`, `quantity`/`unit`/`rate` (optional), `amount`, `tax_amount`, `other_charges`, `grand_total`, `amount_paid`, `payment_status` (reuses `purchase_payment_status_enum`), invoice/due dates, audit + soft-delete |
| `material_purchase_payments` | Payment tranches. Controller posts the matching ledger DEBIT with `source_type='material_purchase'`. | `material_purchase_id`, `payment_date`, `amount`, `payment_source` (reuses `expense_payment_source_enum`), `bank_account_id`/`cash_account_id`, `reference_number`, `notes`, `created_by` |

Reuses existing enums (`purchase_payment_status_enum`, `expense_payment_source_enum`) —
no new enum types. Constraints mirror Expenses: `amount > 0`, source-consistency check,
and `update_material_purchase_payment_status()` recomputes pending/partial/paid.

### Backend
`materialPurchaseController.js` (imports `postSourceDebit`/`reverseSourceEntries` from
`expenseController`) + `routes/materialPurchases.js` mounted at `/api/material-purchases`
(FINANCE roles). CRUD + `POST /:id/payments`, `DELETE /:id/payments/:paymentId`
(reverses the tranche's ledger debit). Delete of a purchase is blocked while it has
payments.

### Frontend
`services/materialPurchaseService.js`; a **"Supplies & Materials"** tab on the Purchases
page (`pages/Purchases/PurchasesList.jsx`) with summary tiles (purchased/paid/outstanding);
`components/Purchases/MaterialPurchaseForm.jsx` (create/edit, auto-fills amount = qty×rate)
and `MaterialPurchaseDetails.jsx` (tranche history + "Record Payment" picking cash/bank).

**Verification:** backend `node --check` clean; frontend `npm run build` success.
**Production not migrated** — run `migrate:up` (007 + 008, plus the 006 Cocopeat rename).

---

## Status: all three phases implemented & verified against the local dev DB.
Deploy per the migration notes above; nothing has been run against production.
