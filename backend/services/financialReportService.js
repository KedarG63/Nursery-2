/**
 * Financial Report Service
 * Issue #74: Financial analytics with revenue, collections, cash flow, and margins
 */

const db = require('../utils/db');
const NodeCache = require('node-cache');

// Cache with 5-minute TTL (reduced from 1 hour for more current data)
const reportCache = new NodeCache({ stdTTL: 300 });

class FinancialReportService {
  /**
   * Get complete financial summary
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {string} groupBy - Grouping interval (day, week, month)
   * @returns {Promise<Object>} Complete financial report
   */
  async getFinancialSummary(startDate, endDate, groupBy = 'day') {
    const cacheKey = `financial_${startDate}_${endDate}_${groupBy}`;
    const cached = reportCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached financial report');
      return cached;
    }

    const [summary, paymentMethods, cashFlowTrend, profitMargins] = await Promise.all([
      this.getRevenueAndCollections(startDate, endDate),
      this.getPaymentMethodBreakdown(startDate, endDate),
      this.getCashFlowTrend(startDate, endDate, groupBy),
      this.getProfitMargins(startDate, endDate)
    ]);

    const result = {
      summary,
      paymentMethods,
      cashFlowTrend,
      profitMargins
    };

    reportCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get revenue and collections summary
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Revenue and collection metrics
   */
  async getRevenueAndCollections(startDate, endDate) {
    const query = `
      SELECT
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(SUM(o.paid_amount), 0) as total_collected,
        COALESCE(SUM(o.total_amount - o.paid_amount), 0) as outstanding
      FROM orders o
      WHERE o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('cancelled')
    `;

    const result = await db.query(query, [startDate, endDate]);
    const row = result.rows[0];

    const totalRevenue = parseFloat(row.total_revenue) || 0;
    const totalCollected = parseFloat(row.total_collected) || 0;
    const outstanding = parseFloat(row.outstanding) || 0;

    // Calculate collection rate
    const collectionRate = totalRevenue > 0
      ? parseFloat(((totalCollected / totalRevenue) * 100).toFixed(2))
      : 0;

    return {
      totalRevenue,
      totalCollected,
      outstanding,
      collectionRate
    };
  }

  /**
   * Get outstanding receivables (all time)
   * @returns {Promise<number>} Total outstanding amount
   */
  async getOutstandingReceivables() {
    const query = `
      SELECT
        COALESCE(SUM(total_amount - paid_amount), 0) as outstanding
      FROM orders
      WHERE status NOT IN ('cancelled')
        AND paid_amount < total_amount
    `;

    const result = await db.query(query);
    return parseFloat(result.rows[0].outstanding) || 0;
  }

  /**
   * Get payment method breakdown
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Payment method distribution
   */
  async getPaymentMethodBreakdown(startDate, endDate) {
    const query = `
      SELECT
        payment_method as method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments
      WHERE payment_date >= $1 AND payment_date <= $2
        AND status = 'success'
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      method: row.method,
      transactionCount: parseInt(row.transaction_count),
      amount: parseFloat(row.total_amount)
    }));
  }

  /**
   * Get cash flow trend over time
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} groupBy - Grouping interval (day, week, month)
   * @returns {Promise<Array>} Time-series cash flow data
   */
  async getCashFlowTrend(startDate, endDate, groupBy = 'day') {
    const query = `
      SELECT
        DATE_TRUNC($3, payment_date) as period,
        COALESCE(SUM(amount), 0) as cash_inflow,
        COUNT(*) as transaction_count
      FROM payments
      WHERE payment_date >= $1 AND payment_date <= $2
        AND status = 'success'
      GROUP BY period
      ORDER BY period
    `;

    const result = await db.query(query, [startDate, endDate, groupBy]);

    return result.rows.map(row => ({
      period: row.period,
      cashInflow: parseFloat(row.cash_inflow),
      transactionCount: parseInt(row.transaction_count)
    }));
  }

  /**
   * Get profit margins (if cost data available)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Profit margin metrics
   */
  async getProfitMargins(startDate, endDate) {
    const query = `
      SELECT
        COALESCE(SUM(oi.line_total), 0) as revenue,
        COALESCE(SUM(oi.quantity * COALESCE(s.cost_price, 0)), 0) as cogs,
        COALESCE(SUM(oi.line_total) - SUM(oi.quantity * COALESCE(s.cost_price, 0)), 0) as gross_profit
      FROM order_items oi
      JOIN skus s ON oi.sku_id = s.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('cancelled')
    `;

    const result = await db.query(query, [startDate, endDate]);
    const row = result.rows[0];

    const revenue = parseFloat(row.revenue) || 0;
    const cogs = parseFloat(row.cogs) || 0;
    const grossProfit = parseFloat(row.gross_profit) || 0;

    // Calculate margin percentage
    const marginPercentage = revenue > 0
      ? parseFloat(((grossProfit / revenue) * 100).toFixed(2))
      : 0;

    return {
      revenue,
      cogs,
      grossProfit,
      marginPercentage
    };
  }
}

module.exports = new FinancialReportService();
