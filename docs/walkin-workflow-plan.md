# Walk-in / Counter-Sale Improvement Plan

_Analysis + phased implementation plan. Nothing here is built yet. Written 2026-07-22._

## Background: how revenue is counted today

Two different revenue figures, computed two different ways:

| Where | Source | Counts a walk-in sale? |
|---|---|---|
| Dashboard "Revenue This Month", Sales Dashboard "Total Revenue" | `payments` table (money recorded as received) | Only if the payment is recorded |
| P&L Income, Variety report, Top Products | `orders` table (order value on order_date) | Yes, as soon as the order is created |

Root cause of the "walk-in revenue missing" suspicion: **order creation never records a payment.** Even a cash-and-carry counter sale is created unpaid; recording the cash is a separate manual trip to the Payments screen. Skip it → the sale is invisible on the payment-based dashboard. Verified in data: the one walk-in order shows ₹50,000 ordered, ₹0 recorded.

Second gap: even when a cash payment **is** recorded, it never reaches the **Cash Book**. 26 cash payments (₹39,947) exist in `payments`; zero appear in Cash-in-Hand. The cash drawer only ever decreases (expenses/payroll/advances).

---

## Phase 0 — FIX: payments are double-counted on partial payments (LIVE BUG) — ✅ IMPLEMENTED 2026-07-22

**Severity: high — corrupts `orders.paid_amount` / `balance_amount` on any partial payment.**

**Status: fixed.** Removed the redundant manual `paid_amount` updates from both `recordOfflinePayment` and the gateway `verifyPayment` path (the trigger is now the single source of truth), and added repair migration `1769000000010` that recomputes `paid_amount` from the sum of each order's successful non-deleted payments. Regression-tested on dev: partial adds once, split UPI+cash reaches zero, full still correct, delete/edit still adjust correctly. **Repair migration is PENDING on production** (needs the standard build → up → migrate deploy).

`orders.paid_amount` is maintained by **two** mechanisms that both fire:
1. DB trigger `trigger_update_order_paid_amount` → `update_order_paid_amount()` (migration `1768100000001`): `paid_amount = LEAST(total_amount, paid_amount + NEW.amount)` on payment insert with status='success'.
2. Controller `recordOfflinePayment` ([paymentController.js](../backend/controllers/paymentController.js) ~line 467) **also** runs `UPDATE orders SET paid_amount = LEAST(total_amount, paid_amount + $1)`.

So every offline payment adds its amount **twice**. The `LEAST(total_amount, …)` cap in both places **masks it for full payments** (the form prefills amount = full balance, which caps correctly) — which is why it survived in production. It only shows on **partial** payments:

- Proven: ₹20,000 UPI partial on a ₹50,000 order → `paid_amount` became **₹40,000**, balance ₹10,000 (should be ₹30,000).

This is exactly the **split-payment** case (part UPI + part cash): the mechanism allows multiple payments per order (no unique constraint on `order_id`), but the first partial is doubled, so the second is wrongly rejected as "exceeds balance."

**Fix (authoritative = the trigger):** remove the redundant manual `UPDATE orders SET paid_amount…` from `recordOfflinePayment`, keeping the trigger as the single source of truth.
- Verify the same duplicate isn't in the gateway `verifyPayment` path before removing.
- **Data repair:** one-time recompute `orders.paid_amount = LEAST(total, SUM(success payments))` for affected orders, inside a transaction, after `pg_dump`. Identify affected rows first (paid_amount ≠ SUM of their success payments).
- No schema migration required for the code fix; the repair is a guarded script.
- Regression test: partial payment adds once; split UPI+cash reaches zero balance; full payment still correct.

---

## Phase 1 — Record payment at order creation (core revenue fix) — ✅ IMPLEMENTED 2026-07-22

Make the money show on the dashboard the moment a counter sale is made.

**Status: done.** `createOrder` accepts optional `amount_paid_now` + `payment_method` + `cash_account_id`/`bank_account_id`; when present it records the payment and posts it to the ledger in the same transaction. Absent → order unpaid, identical to before (regression-tested). Wizard step 4 has an optional "Payment received now" section.

**Backend** — `orderController.js` `createOrder`: accept optional `amount_paid_now` + `payment {method, cash_account_id|bank_account_id}`. If > 0, insert a `payments` row **in the same transaction** as the order (reuse the offline-payment column set) and let the Phase-0-fixed trigger set `paid_amount`. Absent field → identical to today (safety).

**Frontend** — `PaymentMethod.jsx` (wizard step 4): add "Amount received now" (prefill = order total) + "Paid into → Cash/Bank".

No migration. Risk: low (additive optional path). Depends on Phase 0.

---

## Phase 2 — Post customer payments to the Cash Book / Bank Ledger (accounting correctness) — ✅ IMPLEMENTED 2026-07-22

Make Cash-in-Hand reflect money coming in, not just going out.

**Status: done.** Added `postSourceCredit` + a `postCustomerPaymentToLedger` helper; every recorded payment now posts a credit to the Cash Book (cash → primary drawer or the chosen one) or Bank Ledger (upi/bank_transfer/card). Delete/edit reverse and re-post. Migration `1769000000011` adds `payments.cash_account_id`; migration `1769000000012` backfills historical payments (guarded/idempotent). **Decision taken:** recorder picks the cash drawer (defaults to primary); backfill uses the primary drawer. RecordPaymentForm gained a Cash Drawer picker.

**Backend** — offline-payment path: after inserting the payment, post a **credit** in the same transaction:
- `cash` → `cash_ledger_entries`, `source_type='customer_payment'`
- `bank_transfer`/`upi`/`card`/`cheque` → `bank_ledger_entries`, `source_type='customer_payment'`

Both enums **already contain `customer_payment`** (confirmed) → **no enum migration.** Add a `postSourceCredit` helper mirroring `postSourceDebit`; reverse the ledger entry when a payment is voided/deleted.

**One additive column:** `payments.cash_account_id` (nullable) so cash payments know which drawer. Single `ADD COLUMN`, no backfill needed for the column.

**Backfill (careful):** dry-run listing every `success` payment with no `customer_payment` ledger entry, grouped by method, reviewed first; then an idempotent `NOT EXISTS`-guarded backfill (same pattern as existing `syncFromPayments`). Historical cash with unknown account → default/primary cash account. `pg_dump` before running.

Risk: medium → separate rollout, dry-run, backfill guard.

**Open decision:** cash payments always into one default "Main Cash Drawer", or let the recorder pick the cash account each time (like expenses/payroll)? Decide before Phase 2.

---

## Phase 3 — "Quick Counter Sale" screen (the real ease-of-use win) — ✅ IMPLEMENTED 2026-07-22

New route `/orders/counter`, existing wizard untouched: one screen → pick items → "Cash received" → **Complete Sale**. Auto-uses the Walk-in Customer, skips delivery + availability gate, records order + payment + cash-book credit atomically (via Phases 1–2). Captures optional buyer name/phone into the order notes. Shows change-to-return. Reachable via a "Quick Counter Sale" button on the Orders list.

**Status: done.** `pages/Orders/QuickCounterSale.jsx` (reuses `OrderItems`).

---

## Notes on the walk-in customer model (context, no change needed)

- All walk-ins share one real `customers` row named "Walk-in Customer" (fixed phone `+919999999999`), auto-created/restored by `CustomerSelect.jsx`. Individual buyer name/phone currently goes into order `notes` only.
- Payments are per-**order** (`order_id`), so the shared customer record does **not** cross-contaminate balances — each walk-in order is independent.

## Cross-cutting safety

- Ship order: **Phase 0 → 1 → 2 → 3**, each verified in production before the next.
- `pg_dump` before Phase 0 repair and before Phase 2 migration/backfill.
- Only Phase 2 has a schema migration (one additive nullable column). Phase 0 is function-body/controller + a data repair. Phases 1 & 3 need none.
- Every change additive / non-destructive, consistent with this project's production-safety rules.
