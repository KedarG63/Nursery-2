# Plan: One Bill Per Sale

Status: **proposed — nothing built yet.** Written 2026-09-26 after production data showed
orders, invoices, payments and the Cash Book / Bank Ledger disagreeing.

---

## 1. What is wrong, with evidence

Order `ORD-20260910-0936` (Hari Yadav Ramapur):

| Record | Total | Paid | Balance |
|---|---|---|---|
| Order | ₹7,200 | ₹6,660 *(capped)* | ₹0 |
| Invoice | ₹7,900 *(+₹700 transport)* | ₹7,300 | ₹600 |
| Payments table | — | **₹18,200** | — |
| Cash Book + Bank Ledger | — | **₹18,200** | — |

Four records of one sale, four different answers. Across production this pattern repeats on a
large share of orders.

### The four causes

1. **Two balances, two checks.** The Payments page validates against the *order* balance and
   never applies the payment to the invoice. The invoice keeps showing the full amount due, so
   staff record the same money again on the invoice, whose own check passes. Both post to the
   Cash Book / Bank Ledger. **This is the duplicate machine.** Signature in the data: several
   orders paid at exactly 2× the invoice (₹4,700 → ₹9,400, ₹4,500 → ₹9,000, ₹7,000 → ₹14,000).

2. **The paid figure is a capped running counter.** `update_order_paid_amount` adds each
   payment but caps at the order total (migration `1768100000001`, tightened by returns in
   `…017`). Anything beyond is silently discarded, so the order never shows an overpayment and the
   duplicates stay invisible.

3. **The invoice is the real bill, but every report reads the order.** Invoices carry the prices
   customers actually pay (e.g. order at ₹0.18/plant vs invoice at ₹1.00), transport charges,
   round-offs and negotiated discounts. The P&L, dashboard, Customer 360 and sales reports all
   count `orders.total_amount`, so revenue is wrong in both directions.

4. **Invoices don't know about returns**, and returns are valued at order prices.

### A trap to avoid right now

`Delete Payment` does `paid_amount = GREATEST(0, paid_amount - amount)` on the *capped* figure.
On ORD-0936, deleting the duplicate ₹7,900 gives `max(0, 6,660 − 7,900) = 0`, so a customer who
has paid would appear to owe ₹6,660. **Do not use Delete Payment to clean up duplicates until
Phase 1 ships.**

---

## 2. Rules for staff until Phase 1 is live

- For an order that **has an invoice**, record payments **on the invoice only**.
- **Do not collect** against any invoice balance without checking the Payments list for that order.
- **Do not delete** payments to fix duplicates yet.

---

## 3. Target model

Every money figure is **derived from the underlying rows, never kept as a running counter.**
This is the same principle already used for returns and store credit.

```
bill       = the active invoice, if the order has one; otherwise the order
paid       = SUM of the sale's successful payments (net of refunds)
returns    = accepted returns, valued at the bill's prices
balance    = bill total − paid − returns credit
             negative ⇒ OVERPAID, shown as such, never hidden
```

It lives in **one database view, `sale_bills`**, and every check and report reads that view.
One definition means there is only one answer.

The order's own `paid_amount` / `balance_amount` columns stay for stock and delivery screens
but are **no longer trusted for money**. Nothing is dropped.

---

## 4. Phases

### Phase 0 — Measure *(read-only, now)*
Run `scripts/one-bill-sizing.sql` (aggregates only) to find: how far off the P&L is by month, how many sales are
over-collected and by how much, and the true receivable against the one the app shows. Also
covers the edge cases the design must handle: invoices without an order, and payments applied to
another order's invoice. **The numbers decide the Phase 3 effort.**

### Phase 1 — Stop new damage *(one small additive migration)*
- **Migration:** `CREATE VIEW sale_bills`, and change `update_order_paid_amount` from
  "add and cap" to "recompute from the payment rows, then cap". This recalculates only the order
  being paid; no bulk rewrite.
- **One balance check at every entry point:** order-time payment, Payments page, online
  initiation and invoice payment all validate against `sale_bills`. On an invoiced order, the
  Payments page **records and applies to the invoice in the same transaction**, so an invoice can
  never show money as unpaid when it has been received.
- **Over-payment is refused** with a clear message instead of being silently absorbed.
- **Delete / edit payment recompute** the order's paid figure from rows instead of subtracting.
  This makes the Phase 3 clean-up safe.
- Small items already agreed: block store credit for *Walk-in Customer*; the Store Credit panel
  counts real store credit only.

*Effect:* no new duplicates. Existing ones are untouched and still visible to Phase 3.

### Phase 2 — The bill becomes the source of truth *(no migration)*
- Switch every money report to `sale_bills`: P&L, finance overview and monthly trend,
  dashboard revenue, Customer 360, sales / customer / financial reports, and the Payments
  outstanding summary.
- **Invoice page and PDF** show *Less: Returns*, with the balance taken from the view.
- **Returns** are picked from the bill's lines and valued at the bill's prices, and the offset
  is taken against the bill balance.
- **P&L** gets a *Less: Customer Returns* row; the overview shows store credit owed to customers.
- Available store credit is shown **when creating an order**, next to the customer's name.
- **Reconciliation** gains: over-collected sales; every payment has exactly one ledger entry
  and vice versa; bill balance vs the legacy order figure.

*Effect:* **past months' revenue figures will change** — to what was actually billed.
Anyone who has already used earlier P&L figures (lender, CA, GST filing) should be told.

### Phase 3 — Correct history *(people decide, a script applies)*
1. Generate a **review sheet per customer**: each over-collected sale, its payments (date,
   amount, method, receipt/UTR, which screen recorded it, whether it was applied to the invoice),
   the matching ledger entries, and the customer's other open sales.
2. Staff check each one against the **bank statement and cash records** and mark every extra
   payment as **duplicate**, **belongs to another order**, or **genuine advance**.
3. A **self-verifying script** (same pattern as `c071d73`) applies the decisions. It takes a
   backup, runs a dry run first, soft-deletes duplicates with ledger reversal, re-links
   misallocated payments, checks every affected balance to the paisa (ledger balance = latest
   opening + entries after it), and **rolls back on any mismatch**.
4. Review invoices that look wrong on their face (e.g. a ₹147 invoice on a ₹26,460 order).

*Nothing is hard-deleted. Every correction is a soft-delete or re-link, with ledger reversal.*

### Phase 4 — Later, separately
- Convert store credit to a cash or bank refund *(needs a migration)*.
- Undo an accepted return *(stock may already be resold — needs its own design)*.

---

## 5. Decisions needed

1. **When an order has an invoice, is the invoice the bill?** *Recommended: yes.* Every piece
   of evidence says that's how the business already works.
2. **A payment larger than the bill:** refuse it *(recommended for now)*, or keep the extra as
   a customer advance?

Assumed unless told otherwise: revenue stays dated by **order date**, so it doesn't move
between months any more than it has to.

---

## 6. Safeguards

- `pg_dump` before every deploy; build → up → migrate, as in previous deploys.
- The view is read-only. The only trigger change affects the one order being paid.
- Run `scripts/one-bill-sizing.sql` before and after each phase. After Phase 2, *P&L off by* = 0 and
  *app shows owed* = *true still owed*. After Phase 3, *over-collected* = 0 or confirmed advances only.
- The Reconciliation page must be green after every phase.
