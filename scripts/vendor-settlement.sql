-- Vendor settlement — READ ONLY. One net figure per vendor: what we owe them
-- once every unused purchase-return credit and every advance is taken off.
--
-- Run on the VM from ~/Nursery-2:
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db < scripts/vendor-settlement.sql
--
--   unpaid_bills   = seed + supplies bills still owed (same formula the app uses)
--   return_credit  = ACCEPTED purchase returns not yet applied to a bill or paid back
--   advance        = money already paid to the vendor and not yet set against a bill
--   net_to_settle  = unpaid_bills - return_credit - advance
--                    positive: we pay the vendor this much, and everything is square
--                    negative: the vendor owes us this much
--   awaiting_vendor = returns still in draft / submitted — NOT counted, they are
--                     not credit until the vendor accepts them

-- Advances exist only once the bulk vendor payments migration has run.
SELECT to_regclass('public.vendor_payments') IS NOT NULL AS has_vp \gset

\if :has_vp
  CREATE TEMP VIEW _vendor_advance AS
    SELECT vp.vendor_id,
           SUM(vp.amount
               - COALESCE((SELECT SUM(amount) FROM seed_purchase_payments     WHERE vendor_payment_id = vp.id), 0)
               - COALESCE((SELECT SUM(amount) FROM material_purchase_payments WHERE vendor_payment_id = vp.id), 0)) AS advance
    FROM vendor_payments vp
    WHERE vp.deleted_at IS NULL
    GROUP BY vp.vendor_id;
\else
  CREATE TEMP VIEW _vendor_advance AS
    SELECT NULL::uuid AS vendor_id, 0::numeric AS advance WHERE false;
\endif

CREATE TEMP VIEW _vendor_position AS
WITH bills AS (
  SELECT vendor_id, SUM(balance) AS unpaid_bills, COUNT(*) AS open_bills
  FROM (
    SELECT vendor_id, grand_total - amount_paid - COALESCE(vendor_credit_applied, 0) AS balance
    FROM seed_purchases WHERE deleted_at IS NULL
    UNION ALL
    SELECT vendor_id, grand_total - amount_paid
    FROM material_purchases WHERE deleted_at IS NULL
  ) b
  WHERE balance > 0.005
  GROUP BY vendor_id
),
credit AS (
  SELECT vrn.vendor_id,
         SUM(vrn.return_amount - COALESCE(st.settled, 0)) AS return_credit,
         COUNT(*) AS unused_returns
  FROM vendor_return_notes vrn
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS settled FROM vendor_return_settlements WHERE return_note_id = vrn.id
  ) st ON true
  WHERE vrn.deleted_at IS NULL
    AND vrn.status IN ('accepted', 'credited')
    AND vrn.return_amount - COALESCE(st.settled, 0) > 0.005
  GROUP BY vrn.vendor_id
),
pending AS (
  SELECT vendor_id, SUM(return_amount) AS awaiting_vendor
  FROM vendor_return_notes
  WHERE deleted_at IS NULL AND status IN ('draft', 'submitted')
  GROUP BY vendor_id
)
SELECT v.id AS vendor_id, v.vendor_name,
       COALESCE(b.unpaid_bills, 0)   AS unpaid_bills,
       COALESCE(b.open_bills, 0)     AS open_bills,
       COALESCE(c.return_credit, 0)  AS return_credit,
       COALESCE(c.unused_returns, 0) AS unused_returns,
       COALESCE(a.advance, 0)        AS advance,
       COALESCE(b.unpaid_bills, 0) - COALESCE(c.return_credit, 0) - COALESCE(a.advance, 0) AS net_to_settle,
       COALESCE(p.awaiting_vendor, 0) AS awaiting_vendor
FROM vendors v
LEFT JOIN bills b   ON b.vendor_id = v.id
LEFT JOIN credit c  ON c.vendor_id = v.id
LEFT JOIN pending p ON p.vendor_id = v.id
LEFT JOIN _vendor_advance a ON a.vendor_id = v.id
WHERE v.deleted_at IS NULL;

\echo '=== A. Net position with every vendor that has anything open ==='
SELECT vendor_name, unpaid_bills, open_bills, return_credit, unused_returns, advance,
       net_to_settle,
       CASE WHEN net_to_settle > 0.005 THEN 'we pay the vendor'
            WHEN net_to_settle < -0.005 THEN 'VENDOR OWES US'
            ELSE 'square' END AS who_pays,
       awaiting_vendor
FROM _vendor_position
WHERE unpaid_bills > 0.005 OR return_credit > 0.005 OR advance > 0.005 OR awaiting_vendor > 0.005
ORDER BY return_credit DESC, unpaid_bills DESC;

\echo '=== B. For vendors holding unused return credit: the unpaid bills it can be applied to ==='
SELECT pos.vendor_name, b.kind, b.purchase_number, b.purchase_date::date AS bill_date,
       b.grand_total, b.balance AS still_owed
FROM _vendor_position pos
JOIN (
  SELECT vendor_id, 'seeds' AS kind, purchase_number, purchase_date, grand_total,
         grand_total - amount_paid - COALESCE(vendor_credit_applied, 0) AS balance
  FROM seed_purchases WHERE deleted_at IS NULL
  UNION ALL
  SELECT vendor_id, 'supplies', purchase_number, purchase_date, grand_total, grand_total - amount_paid
  FROM material_purchases WHERE deleted_at IS NULL
) b ON b.vendor_id = pos.vendor_id
WHERE pos.return_credit > 0.005 AND b.balance > 0.005
ORDER BY pos.vendor_name, b.purchase_date;

\echo '=== C. Possible duplicate returns: same purchase, same packets, same amount ==='
SELECT v.vendor_name, sp.purchase_number, a.packets_returned AS packets, a.return_amount,
       a.return_number || ' (' || a.status || ')' AS return_1,
       b.return_number || ' (' || b.status || ')' AS return_2
FROM vendor_return_notes a
JOIN vendor_return_notes b
  ON b.seed_purchase_id = a.seed_purchase_id
 AND b.packets_returned = a.packets_returned
 AND b.return_amount = a.return_amount
 AND b.id > a.id
JOIN vendors v ON v.id = a.vendor_id
JOIN seed_purchases sp ON sp.id = a.seed_purchase_id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
  AND a.status <> 'rejected' AND b.status <> 'rejected'
ORDER BY a.return_amount DESC;
