# Returns & Accounting — Reference

Written for: whoever picks this up next (including future me). Enough to understand *why*, not a line-by-line spec.

Covers the work done Sep 2026: vendor returns settlement, customer returns + store credit,
service-order payments reaching the ledger, and the bugs found along the way.

---

## 1. The rule everything follows

**Every rupee that moves must land in exactly one ledger, exactly once, and every
document's parts must add up to its total.**

Two invariants, enforced by database triggers — not by application code, because
application code can be bypassed by a script, a migration, or a future bug:

| Document | Invariant |
|---|---|
| Vendor return note | `SUM(settlements) <= return_amount` |
| Customer return note | `SUM(settlements) <= return_amount` |
| Order | `paid_amount + credit_applied <= total_amount` |

Balances are **never stored**. They are computed from the ledgers every time.
A stored balance is a second source of truth, and second sources of truth drift.

---

## 2. Settlement-ledger pattern

Both return types use the same shape. This is the core design decision.

```
<x>_return_notes          the document — what was returned, and what it's worth
<x>_return_settlements    one row per money event against that document
```

A settlement row is one of:

- **`order_offset`** (customer only) — cancels what the customer still owes. Automatic.
- **`credit_applied`** (vendor only) — set against a future purchase bill.
- **`refund`** — real money moved. Posts to the Cash Book or Bank Ledger.
- **`store_credit`** (customer only) — kept on account for a future order.

**Why a ledger instead of columns on the note:** the previous vendor-return code kept
`credited_amount` as a column and *overwrote* it on each partial application, and flipped
`status` to `credited` on the first partial. The two bugs masked each other — a ₹5,000
return with ₹2,000 applied showed as fully credited, and the remaining ₹3,000 became
permanently invisible. A ledger cannot do this: the open balance is
`return_amount - SUM(settlements)`, derived, always correct.

Migration `1769000000016` backfills this and **recovers stranded credit** by flipping
partially-credited notes back to `accepted`.

---

## 3. Customer returns — the split

Accepting a return computes value **V**, then splits against the order's outstanding **B**:

```
order_offset = min(V, B)       cancels what they still owe   → automatic
owed_back    = V − order_offset  they already paid for these  → explicit choice
```

**Only `owed_back` is a choice** (Refund vs Store credit). This is the most important
protection in the module: without it, staff could refund cash on an order the customer
never paid. That loss would still *reconcile perfectly*, because the refund itself would
be posted correctly. The arithmetic makes it impossible rather than merely discouraged.

Store credit is applied to a future order **explicitly, with a prompt** — never
automatically. Silent application is unexplainable to a customer standing at the counter.

### Business rules settled with the user

- Returns are accepted **only if the plants are resellable**. Dead/damaged are not taken
  back, so there is no scrap path — a return always restocks.
- Vendors usually give credit against the next bill, but sometimes pay back — hence the
  refund path on the vendor side too.

---

## 4. Precision — four traps, all closed

### 4a. Discount proration
`total = (subtotal − discount) × (1 + tax)`. Refunding `unit_price × qty` refunds more
than the customer actually paid on a discounted order. Value is prorated:

```
value = gross × total_amount / subtotal_amount
```
Verified: gross ₹500 on a 10%-discounted order → **₹450**.

### 4b. Paisa drift (the subtle one)
Rounding each return *separately* drifts. Values are computed **cumulatively** in exact
NUMERIC — the new return's value is the difference of two rounded cumulative totals:

```sql
  ROUND((prior.gross + this.gross) * o.total_amount / o.subtotal_amount, 2)
- ROUND( prior.gross               * o.total_amount / o.subtotal_amount, 2)
```

Verified with ratio 700/999: three partial returns sum to **exactly ₹700.00**.
Naive per-return rounding gives ₹699.99.

### 4c. Overpayment after a return
`recordOfflinePayment` computes its own balance and ignored `credit_applied`. Fixing only
the trigger would have left the hole open. Now blocked — ₹701 refused on a ₹700 order.

### 4d. Double-released stock
Every un-allocation path releases an item's *full* quantity, which would release returned
units twice. An order item with an accepted return is **frozen by a DB trigger** —
quantity and lot cannot change, and it cannot be deleted. That is also the correct
business rule: cancelling such an item would erase a real sale.

---

## 5. Bugs found and fixed along the way

Several were pre-existing and unrelated to the requested work.

| Commit | Bug |
|---|---|
| `1a6bdd0` | **Bank sync swept NULL-account payments.** Credit half matched `bank_account_id = $1 OR IS NULL`; the debit half had *no filter at all*. ₹200k+ misfiled into Account 2. |
| `c2b980c` | **Payroll ignored `date_of_joining`** — an employee who joined 4 Aug appeared in the July run. Added proration + `payable_days`. |
| `c2b980c` | **Half-day rate was structurally impossible.** Added nullable `half_day_rate` (NULL falls back to old behaviour). |
| `37a5b53` | **Service-order payments reached no ledger at all** — not the cash drawer, not the bank. `recordPayment` had *no transaction*. ₹200,432 backfilled. |
| `0267e97` | **`vendor_credit_applied` was written but read by nothing** — accounts payable overstated. |
| `9108381` | **Vendor return stranded credit** (see §2). |
| `ec85e7f` | **Order cancellation released stock twice** — manual `UPDATE lots` *and* the trigger. Proved: 30 allocated, cancel 10 → left 10 allocated instead of 20. 10 units of phantom stock. |
| `7b97c66` | **Order cancellation deadlocked forever.** The handler held the order row lock, then awaited `releaseAllocatedLots` on a *second* pool connection, which blocked on that same row. Postgres can't detect it — one side is waiting on JavaScript, not on a lock. **Dates to the initial commit; cancellation has never worked.** Each attempt leaked 2 pool connections permanently, so ~10 attempts would exhaust the pool (max 20) and take the API down. Frequent redeploys masked it. Fixed by passing the caller's client: 8000 ms timeout → 27 ms. |

Also corrected: the P&L returns query had **no status filter**, so rejected and draft
returns reduced cost of goods.

---

## 6. Schema added

```
vendor_return_settlements          + assert_vendor_return_not_oversettled trigger
customer_return_notes
customer_return_items              (incl. restock_method: released_allocation | added_quantity)
customer_return_settlements        + over-settlement trigger
customer_store_credit_ledger       (issued | applied)
orders.credit_applied              + CHECK (paid_amount + credit_applied <= total_amount)
employees.half_day_rate            (nullable)
seed_purchase_payments.payment_source / bank_account_id / cash_account_id
service_order_payments.payment_source / bank_account_id / cash_account_id
```

**Restock method is recorded, not inferred.** If the sale reserved the lot, the return
*releases the reservation* (`allocated_quantity -`). If it never allocated, the plants are
genuinely extra stock (`quantity +`). Getting this backwards silently invents or destroys
inventory, and after the fact the two are indistinguishable — so the branch taken is
written down at the time.

### Ledger enum additions
`vendor_payment`, `service_payment`, `customer_return_refund`, `vendor_return_refund`.

`service_payment` is deliberately **distinct** from `customer_payment`: the partial unique
indexes `uq_ble_source_id` / `uq_cle_source_id` are on `(source_type, source_id)`, so
sharing a source_type would put two different tables' UUIDs in one namespace.

---

## 6a. The UI

| Where | What |
|---|---|
| Order details | **Returns** panel — record, accept, settle. **Store Credit** panel appears only when there is credit to spend or already spent. |
| Sidebar → Customer Returns | Every return across all orders, with an **"Owed back only"** filter — the working list for clearing open liabilities. |
| Purchase details → Return Notes | **Apply Credit to a Bill** and **Vendor Paid Us Back**, both available while anything is open. |
| Accounting → Reconciliation | The report in §7a. |

Three deliberate choices, each preventing a specific error:

1. **The return form shows an *approximate* value**, labelled as such. The real
   prorated value is computed server-side on acceptance. Showing a precise-looking
   number that later differs is worse than an honestly approximate one.
2. **Accepting immediately opens the settlement dialog** when anything is owed
   back, rather than leaving it to be noticed later. An unsettled return is an
   open liability, and the moment of acceptance is when someone is looking.
3. **`PaymentSourcePicker`** (`components/Common/`) is shared by every refund
   path. Money that moves without naming its account cannot be explained later,
   so there is no "unspecified" option anywhere.

### Two bugs found while building the UI

- **`OrderSummary` computed Balance Due as `total − paid`**, ignoring
  `credit_applied` — so any order settled by a return or store credit would have
  displayed a balance higher than the truth, and disagreed with the database's own
  `balance_amount`. Now subtracts credit and shows it as its own line.
- **`PurchaseDetails` computed remaining vendor credit from `credited_amount`**,
  which holds credit applied to *bills only* and excludes refunds. Adding the
  refund button without fixing this would have overstated what was still open the
  moment a vendor paid cash back. The list query now exposes `open_balance`
  derived from the settlement ledger, and the UI uses that everywhere.

---

## 7a. The reconciliation report

`GET /api/reconciliation/returns` → **Accounting → Reconciliation**

Twelve independent checks. Each recomputes a derived number from the underlying
rows and compares it against what is stored — **nothing trusts a cached column,
which is the entire point.** Every check returns the offending *rows*, never just
a count: "3 mismatches" cannot be fixed, "these 3 rows" can.

**Why it exists even though triggers enforce the invariants:** triggers stop bad
writes as they happen. They cannot speak for rows written *before* the trigger
existed, rows written by a maintenance script (`session_replication_role = replica`
disables triggers), or a future code path that posts a settlement and forgets its
ledger entry.

| Severity | Checks |
|---|---|
| critical | over-settlement (both sides) · `credit_applied` drift (orders and bills) · refunds with no matching ledger entry (both sides) · orphan ledger entries · negative store credit · orders settled beyond total |
| warning | accepted returns whose restock method was never recorded |
| info | open balances — owed to customers, owed by vendors (not errors; listed so nothing sits forgotten) |

### Verification

Running clean is not proof — a check that *cannot* fail is worse than no check.
Each was tested by injecting its fault inside a rolled-back transaction:

```
A. over-collection        BLOCKED by check constraint (stronger than detection)
B. order credit drift     detected
C. purchase credit drift  detected
D. negative store credit  detected
E. orphan ledger entry    detected
```

Then end-to-end through the live API: injected a bogus `vendor_credit_applied`,
the report flipped to `balanced: false` and named the exact row
(`PUR-20251030-0001, stored 999.99, should_be 0`); restored, back to 12/12.

**Worth knowing:** `session_replication_role = replica` disables triggers and
foreign keys but **not CHECK constraints** — which is why over-collection could
not be injected at all.

### A bug this testing caught

Running the SQL in psql with the tolerance substituted as a literal passed all 12.
Through the API — where it is a bound parameter — **3 checks failed**: Postgres
cannot infer a bare `$1`'s type from `IS NOT NULL` or unary `-$1`. Fixed with
explicit `$1::numeric` casts. Testing the queries only in psql would have shipped
three permanently broken checks that looked fine.

---

## 7. Testing

`scratchpad/run-return-tests.sh` — **49 assertions, all passing**, including six raw-SQL
attacks that bypass the application entirely to prove the guarantees hold at the database
level, not merely in the controller.

Proven: ₹450 on a discounted order · exactly ₹700.00 across three returns · refund refused
on an unpaid order · over-collection blocked at ₹701 of ₹700 · both restock branches ·
freeze guards · over-settlement rejected on both sides.

---

## 8. Gotchas worth remembering

- **Deploy order is build → migrate → verify → up.** The Dockerfile bakes code with
  `COPY . .`, so migrating before building runs the *old* migrations. Use
  `docker compose run --rm` for the migration step.
- **`node-pg-migrate` ECONNREFUSED ::1:5432** — known bug. Export
  `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` instead of relying on `DATABASE_URL`.
- **Postgres constant-folds literal casts at planning time**, so
  `SELECT 'msg'::uuid WHERE <false>` still raises. Guard psql scripts with `\gset` + `\if`.
- **Soft delete never fires `ON DELETE CASCADE`** — ledger reversal must be explicit in
  every soft-delete path.
- `session_replication_role = replica` to disable triggers for test-data surgery.

---

## 9. Known, flagged, not fixed

- `/api/inventory/seeds/available-for-lot` — route-ordering 500
- `lotAllocation.test.js` — suite crash (`resetMocks: true` + `setImmediate`)
- `deliveryEvents.handleStopDelivered` — dead code
- Service collections missing from Dashboard "Total Revenue" and Customer 360
- `CustomerSelect.jsx` — duplicate `noOptionsText` JSX attribute (build warning)

---

## 10. Deployment status

Everything above is committed but **not deployed** — frontend and backend ship
together in one combined deploy, as agreed. Pending on production:

- migrations `1769000000013` … `1769000000017`
- the reconciliation endpoint and page
- all returns UI

Run the reconciliation report immediately after deploying. On a correct
production database it should read **balanced**, and any row it lists is
pre-existing drift worth looking at before it compounds.
