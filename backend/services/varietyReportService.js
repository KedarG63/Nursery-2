/**
 * Variety Report Service
 *
 * "Everything about each product variety" — one row per SKU tying together
 * the full chain: seeds bought (seed_purchases) → plants produced (lots) →
 * current stock → units sold, revenue, buyers and selling-price variation
 * (order_items). Read-only aggregations; writes nothing.
 */

const db = require('../utils/db');

const num = (v) => parseFloat(v || 0);
const round2 = (v) => parseFloat(num(v).toFixed(2));

// Optional sales/purchase date window; stock is always "now".
function windowClause(from, to, col, params) {
  let sql = '';
  if (from) { params.push(from); sql += ` AND ${col} >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND ${col} <= $${params.length}`; }
  return sql;
}

class VarietyReportService {
  /**
   * One row per variety (SKU): bought → produced → stock → sold → prices.
   * @param {string} fromDate optional — applies to sales and purchases
   * @param {string} toDate   optional — applies to sales and purchases
   */
  async getVarietyOverview(fromDate = null, toDate = null) {
    // One shared params array; each clause claims the next $n placeholders.
    const params = [];
    const purchaseWindow = windowClause(fromDate, toDate, 'purchase_date', params);
    const salesWindow = windowClause(fromDate, toDate, 'o.order_date', params);

    const query = `
      SELECT
        s.id AS sku_id,
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(NULLIF(s.variety, ''), s.sku_code) AS variety,
        s.sku_code,
        s.active,
        s.price AS listed_price,
        s.cost,
        COALESCE(lo.available, 0) AS current_stock,
        COALESCE(lo.produced, 0) AS produced_qty,
        COALESCE(lo.lot_count, 0) AS lot_count,
        COALESCE(pu.purchase_count, 0) AS purchase_count,
        COALESCE(pu.seeds_bought, 0) AS seeds_bought,
        COALESCE(pu.purchase_spend, 0) AS purchase_spend,
        COALESCE(sa.sold_qty, 0) AS sold_qty,
        COALESCE(sa.revenue, 0) AS revenue,
        COALESCE(sa.order_count, 0) AS order_count,
        COALESCE(sa.buyer_count, 0) AS buyer_count,
        sa.min_price,
        sa.avg_price,
        sa.max_price,
        sa.last_sale_date
      FROM skus s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN (
        SELECT sku_id,
               SUM(available_quantity) AS available,
               SUM(quantity) AS produced,
               COUNT(*)::int AS lot_count
        FROM lots WHERE deleted_at IS NULL
        GROUP BY sku_id
      ) lo ON lo.sku_id = s.id
      LEFT JOIN (
        SELECT sku_id,
               COUNT(*)::int AS purchase_count,
               SUM(total_seeds) AS seeds_bought,
               SUM(grand_total) AS purchase_spend
        FROM seed_purchases
        WHERE deleted_at IS NULL ${purchaseWindow}
        GROUP BY sku_id
      ) pu ON pu.sku_id = s.id
      LEFT JOIN (
        SELECT oi.sku_id,
               SUM(oi.quantity) AS sold_qty,
               SUM(oi.line_total) AS revenue,
               COUNT(DISTINCT o.id)::int AS order_count,
               COUNT(DISTINCT o.customer_id)::int AS buyer_count,
               MIN(oi.unit_price) AS min_price,
               AVG(oi.unit_price) AS avg_price,
               MAX(oi.unit_price) AS max_price,
               MAX(o.order_date) AS last_sale_date
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.deleted_at IS NULL AND o.status != 'cancelled' ${salesWindow}
        GROUP BY oi.sku_id
      ) sa ON sa.sku_id = s.id
      WHERE s.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY COALESCE(sa.revenue, 0) DESC, p.name, s.sku_code
    `;

    const result = await db.query(query, params);

    return result.rows.map((r) => ({
      skuId: r.sku_id,
      productId: r.product_id,
      productName: r.product_name,
      variety: r.variety,
      skuCode: r.sku_code,
      active: r.active,
      listedPrice: round2(r.listed_price),
      cost: round2(r.cost),
      currentStock: parseInt(r.current_stock),
      producedQty: parseInt(r.produced_qty),
      lotCount: r.lot_count,
      purchaseCount: r.purchase_count,
      seedsBought: parseInt(r.seeds_bought),
      purchaseSpend: round2(r.purchase_spend),
      soldQty: parseInt(r.sold_qty),
      revenue: round2(r.revenue),
      orderCount: r.order_count,
      buyerCount: r.buyer_count,
      minPrice: r.min_price === null ? null : round2(r.min_price),
      avgPrice: r.avg_price === null ? null : round2(r.avg_price),
      maxPrice: r.max_price === null ? null : round2(r.max_price),
      lastSaleDate: r.last_sale_date,
    }));
  }

  /**
   * Full 360° detail for one variety (SKU).
   */
  async getVarietyDetail(skuId) {
    const info = await db.query(
      `SELECT s.id AS sku_id, s.sku_code, COALESCE(NULLIF(s.variety, ''), s.sku_code) AS variety,
              s.price AS listed_price, s.cost, s.min_stock_level, s.active,
              p.id AS product_id, p.name AS product_name, p.category
       FROM skus s JOIN products p ON p.id = s.product_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [skuId]
    );
    if (info.rows.length === 0) return null;

    const [stock, purchases, lots, monthly, buyers, recentSales, totals] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(available_quantity), 0) AS available,
                COALESCE(SUM(quantity), 0) AS produced,
                COUNT(*)::int AS lot_count
         FROM lots WHERE sku_id = $1 AND deleted_at IS NULL`,
        [skuId]
      ),
      db.query(
        `SELECT sp.id, sp.purchase_number, sp.purchase_date, v.vendor_name,
                sp.number_of_packets, sp.total_seeds, sp.seeds_used, sp.seeds_remaining,
                sp.grand_total, sp.germination_rate, sp.payment_status
         FROM seed_purchases sp
         LEFT JOIN vendors v ON v.id = sp.vendor_id
         WHERE sp.sku_id = $1 AND sp.deleted_at IS NULL
         ORDER BY sp.purchase_date DESC
         LIMIT 20`,
        [skuId]
      ),
      db.query(
        `SELECT id, lot_number, growth_stage, quantity, available_quantity,
                planted_date, expected_ready_date, current_location::text AS location
         FROM lots
         WHERE sku_id = $1 AND deleted_at IS NULL
         ORDER BY planted_date DESC NULLS LAST, created_at DESC
         LIMIT 20`,
        [skuId]
      ),
      // Last 12 months: units, revenue, and the price band (min/avg/max)
      db.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM') AS month_key,
                SUM(oi.quantity) AS qty,
                SUM(oi.line_total) AS revenue,
                MIN(oi.unit_price) AS min_price,
                AVG(oi.unit_price) AS avg_price,
                MAX(oi.unit_price) AS max_price
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.sku_id = $1 AND o.deleted_at IS NULL AND o.status != 'cancelled'
           AND o.order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
         GROUP BY 1 ORDER BY 1`,
        [skuId]
      ),
      db.query(
        `SELECT c.id AS customer_id, c.name AS customer_name, c.phone, c.whatsapp_number,
                SUM(oi.quantity) AS qty,
                SUM(oi.line_total) AS spent,
                COUNT(DISTINCT o.id)::int AS order_count,
                MIN(oi.unit_price) AS min_price,
                AVG(oi.unit_price) AS avg_price,
                MAX(oi.unit_price) AS max_price,
                MAX(o.order_date) AS last_purchase_date
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN customers c ON c.id = o.customer_id
         WHERE oi.sku_id = $1 AND o.deleted_at IS NULL AND o.status != 'cancelled'
           AND c.deleted_at IS NULL
         GROUP BY c.id, c.name, c.phone, c.whatsapp_number
         ORDER BY spent DESC`,
        [skuId]
      ),
      db.query(
        `SELECT o.id AS order_id, o.order_number, o.order_date, c.name AS customer_name,
                oi.quantity, oi.unit_price, oi.line_total, o.status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE oi.sku_id = $1 AND o.deleted_at IS NULL AND o.status != 'cancelled'
         ORDER BY o.order_date DESC, o.created_at DESC
         LIMIT 15`,
        [skuId]
      ),
      db.query(
        `SELECT COALESCE(SUM(oi.quantity), 0) AS sold_qty,
                COALESCE(SUM(oi.line_total), 0) AS revenue,
                COUNT(DISTINCT o.id)::int AS order_count,
                COUNT(DISTINCT o.customer_id)::int AS buyer_count,
                MIN(oi.unit_price) AS min_price,
                AVG(oi.unit_price) AS avg_price,
                MAX(oi.unit_price) AS max_price
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.sku_id = $1 AND o.deleted_at IS NULL AND o.status != 'cancelled'`,
        [skuId]
      ),
    ]);

    // Zero-fill the 12-month series so charts are continuous
    const monthMap = new Map(monthly.rows.map((r) => [r.month_key, r]));
    const series = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = monthMap.get(key);
      series.push({
        month_key: key,
        qty: row ? parseInt(row.qty) : 0,
        revenue: row ? round2(row.revenue) : 0,
        min_price: row ? round2(row.min_price) : null,
        avg_price: row ? round2(row.avg_price) : null,
        max_price: row ? round2(row.max_price) : null,
      });
    }

    const purchaseTotals = purchases.rows.reduce(
      (acc, r) => ({
        seeds: acc.seeds + parseInt(r.total_seeds || 0),
        spend: acc.spend + num(r.grand_total),
      }),
      { seeds: 0, spend: 0 }
    );

    const t = totals.rows[0];
    const s = stock.rows[0];
    return {
      info: {
        ...info.rows[0],
        listed_price: round2(info.rows[0].listed_price),
        cost: round2(info.rows[0].cost),
      },
      stock: {
        available: parseInt(s.available),
        produced: parseInt(s.produced),
        lot_count: s.lot_count,
      },
      sales: {
        sold_qty: parseInt(t.sold_qty),
        revenue: round2(t.revenue),
        order_count: t.order_count,
        buyer_count: t.buyer_count,
        min_price: t.min_price === null ? null : round2(t.min_price),
        avg_price: t.avg_price === null ? null : round2(t.avg_price),
        max_price: t.max_price === null ? null : round2(t.max_price),
      },
      procurement: {
        purchase_count: purchases.rows.length,
        seeds_bought: purchaseTotals.seeds,
        spend: round2(purchaseTotals.spend),
        purchases: purchases.rows.map((r) => ({
          ...r,
          grand_total: round2(r.grand_total),
          germination_rate: r.germination_rate === null ? null : round2(r.germination_rate),
        })),
      },
      lots: lots.rows,
      monthly: series,
      buyers: buyers.rows.map((r) => ({
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        phone: r.phone,
        whatsapp_number: r.whatsapp_number,
        qty: parseInt(r.qty),
        spent: round2(r.spent),
        order_count: r.order_count,
        min_price: round2(r.min_price),
        avg_price: round2(r.avg_price),
        max_price: round2(r.max_price),
        last_purchase_date: r.last_purchase_date,
      })),
      recent_sales: recentSales.rows.map((r) => ({
        ...r,
        unit_price: round2(r.unit_price),
        line_total: round2(r.line_total),
      })),
    };
  }
}

module.exports = new VarietyReportService();
