/**
 * Sales Report Service
 * Issue #70: Sales analytics with revenue trends, top products, and KPIs
 */

const db = require('../utils/db');
const NodeCache = require('node-cache');

// Cache with 5-minute TTL (reduced from 1 hour for more current data)
const reportCache = new NodeCache({ stdTTL: 300 });

class SalesReportService {
  /**
   * Get complete sales analytics
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {string} groupBy - Grouping interval (day, week, month)
   * @returns {Promise<Object>} Complete sales report
   */
  async getSalesAnalytics(startDate, endDate, groupBy = 'day') {
    const cacheKey = `sales_${startDate}_${endDate}_${groupBy}`;
    const cached = reportCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached sales report');
      return cached;
    }

    const [kpis, revenueTrend, topProducts, statusBreakdown, paymentBreakdown] = await Promise.all([
      this.calculateKPIs(startDate, endDate),
      this.getRevenueTrend(startDate, endDate, groupBy),
      this.getTopProducts(startDate, endDate, 10),
      this.getOrderStatusBreakdown(startDate, endDate),
      this.getPaymentMethodBreakdown(startDate, endDate)
    ]);

    const result = {
      kpis,
      revenue_trend: revenueTrend,
      top_products: topProducts,
      order_status_breakdown: statusBreakdown,
      payment_breakdown: paymentBreakdown
    };

    reportCache.set(cacheKey, result);
    return result;
  }

  /**
   * Calculate KPIs (total revenue, order count, avg order value, growth rate)
   * Based on actual payments received, not just orders placed
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} KPI metrics
   */
  async calculateKPIs(startDate, endDate) {
    // Debug logging
    console.log('=== KPI Calculation ===');
    console.log('Start Date:', startDate);
    console.log('End Date:', endDate);

    // Current period KPIs - based on actual payments received
    const currentQuery = `
      SELECT
        COALESCE(COUNT(DISTINCT p.order_id), 0) as order_count,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(AVG(p.amount), 0) as avg_payment_value,
        COALESCE(COUNT(p.id), 0) as payment_count
      FROM payments p
      WHERE p.payment_date >= $1 AND p.payment_date <= $2
        AND p.status = 'success'
        AND p.deleted_at IS NULL
    `;

    const currentResult = await db.query(currentQuery, [startDate, endDate]);
    const current = currentResult.rows[0];
    console.log('KPI Result:', current);

    // Calculate date range for previous period (same duration)
    const rangeDuration = new Date(endDate) - new Date(startDate);
    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(prevEndDate - rangeDuration);

    // Previous period KPIs
    const previousResult = await db.query(currentQuery, [prevStartDate, prevEndDate]);
    const previous = previousResult.rows[0];

    // Calculate growth rate
    const growthRate = previous.total_revenue > 0
      ? ((current.total_revenue - previous.total_revenue) / previous.total_revenue) * 100
      : 0;

    return {
      totalRevenue: parseFloat(current.total_revenue) || 0,
      orderCount: parseInt(current.order_count) || 0,
      paymentCount: parseInt(current.payment_count) || 0,
      avgOrderValue: parseFloat(current.avg_payment_value) || 0,
      growthRate: parseFloat(growthRate.toFixed(2))
    };
  }

  /**
   * Get revenue trend over time - based on actual payments
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} groupBy - Grouping interval (day, week, month)
   * @returns {Promise<Array>} Time-series revenue data
   */
  async getRevenueTrend(startDate, endDate, groupBy = 'day') {
    const query = `
      SELECT
        DATE_TRUNC($3, p.payment_date) as period,
        COUNT(DISTINCT p.order_id) as order_count,
        COUNT(p.id) as payment_count,
        COALESCE(SUM(p.amount), 0) as revenue,
        COALESCE(AVG(p.amount), 0) as avg_payment_value
      FROM payments p
      WHERE p.payment_date >= $1 AND p.payment_date <= $2
        AND p.status = 'success'
        AND p.deleted_at IS NULL
      GROUP BY period
      ORDER BY period
    `;

    const result = await db.query(query, [startDate, endDate, groupBy]);

    return result.rows.map(row => ({
      period: row.period,
      revenue: parseFloat(row.revenue),
      orderCount: parseInt(row.order_count),
      paymentCount: parseInt(row.payment_count),
      avgOrderValue: parseFloat(row.avg_payment_value)
    }));
  }

  /**
   * Get top-selling products by revenue
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} limit - Number of top products to return
   * @returns {Promise<Array>} Top products list
   */
  async getTopProducts(startDate, endDate, limit = 10) {
    const query = `
      SELECT
        p.name as product_name,
        s.sku_code as sku_code,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_revenue
      FROM order_items oi
      JOIN skus s ON oi.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('cancelled')
      GROUP BY p.id, p.name, s.id, s.sku_code
      ORDER BY total_revenue DESC
      LIMIT $3
    `;

    const result = await db.query(query, [startDate, endDate, limit]);

    return result.rows.map(row => ({
      productName: row.product_name,
      skuCode: row.sku_code,
      quantity: parseInt(row.total_quantity),
      revenue: parseFloat(row.total_revenue)
    }));
  }

  /**
   * Get order status breakdown
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Order counts by status
   */
  async getOrderStatusBreakdown(startDate, endDate) {
    const query = `
      SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_value
      FROM orders
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY status
      ORDER BY count DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      value: parseFloat(row.total_value)
    }));
  }

  /**
   * Get payment method breakdown
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Payment amounts by method
   */
  async getPaymentMethodBreakdown(startDate, endDate) {
    const query = `
      SELECT
        payment_method as method,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as amount
      FROM payments
      WHERE payment_date >= $1 AND payment_date <= $2
        AND status = 'success'
        AND deleted_at IS NULL
      GROUP BY payment_method
      ORDER BY amount DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      method: row.method,
      count: parseInt(row.count),
      amount: parseFloat(row.amount)
    }));
  }
}

module.exports = new SalesReportService();
