/**
 * Customer Report Service
 * Issue #73: Customer analytics with purchase patterns, segmentation, and credit analysis
 */

const db = require('../utils/db');
const NodeCache = require('node-cache');

// Cache with 1-hour TTL
const reportCache = new NodeCache({ stdTTL: 3600 });

class CustomerReportService {
  /**
   * Get complete customer analytics
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @returns {Promise<Object>} Complete customer report
   */
  async getCustomerAnalytics(startDate, endDate) {
    const cacheKey = `customer_${startDate}_${endDate}`;
    const cached = reportCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached customer report');
      return cached;
    }

    const [topCustomers, segmentation, creditUtilization, repeatRate, acquisitionTrend] = await Promise.all([
      this.getTopCustomers(startDate, endDate, 10),
      this.getCustomerSegmentation(startDate, endDate),
      this.getCreditUtilization(),
      this.getRepeatPurchaseRate(startDate, endDate),
      this.getCustomerAcquisitionTrend(startDate, endDate)
    ]);

    const result = {
      topCustomers,
      segmentation,
      creditUtilization,
      repeatPurchaseRate: repeatRate,
      acquisitionTrend
    };

    reportCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get top customers by revenue
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} limit - Number of top customers
   * @returns {Promise<Array>} Top customers list
   */
  async getTopCustomers(startDate, endDate, limit = 10) {
    const query = `
      SELECT
        c.id as customer_id,
        c.name,
        c.customer_type,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        MAX(o.created_at) as last_order_date
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      WHERE o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('cancelled')
      GROUP BY c.id, c.name, c.customer_type
      ORDER BY total_revenue DESC
      LIMIT $3
    `;

    const result = await db.query(query, [startDate, endDate, limit]);

    return result.rows.map(row => ({
      customerId: row.customer_id,
      name: row.name,
      type: row.customer_type,
      orderCount: parseInt(row.order_count),
      totalRevenue: parseFloat(row.total_revenue),
      lastOrder: row.last_order_date
    }));
  }

  /**
   * Get customer segmentation by type
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Customer segments
   */
  async getCustomerSegmentation(startDate, endDate) {
    const query = `
      SELECT
        customer_type,
        COUNT(DISTINCT c.id) as customer_count,
        COALESCE(SUM(total_revenue), 0) as segment_revenue
      FROM (
        SELECT
          c.id,
          c.customer_type,
          COALESCE(SUM(o.total_amount), 0) as total_revenue
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
          AND o.created_at >= $1 AND o.created_at <= $2
          AND o.status NOT IN ('cancelled', 'draft')
        GROUP BY c.id, c.customer_type
      ) AS customer_revenues
      GROUP BY customer_type
      ORDER BY segment_revenue DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      type: row.customer_type,
      customerCount: parseInt(row.customer_count),
      revenue: parseFloat(row.segment_revenue)
    }));
  }

  /**
   * Get credit utilization analysis
   * @returns {Promise<Array>} Credit usage data
   */
  async getCreditUtilization() {
    const query = `
      SELECT
        c.id as customer_id,
        c.name,
        cc.credit_limit,
        cc.credit_used,
        ROUND(
          COALESCE(
            (cc.credit_used / NULLIF(cc.credit_limit, 0)) * 100,
            0
          ),
          2
        ) as utilization_rate
      FROM customers c
      JOIN customer_credit cc ON c.id = cc.customer_id
      WHERE cc.credit_limit > 0
      ORDER BY utilization_rate DESC
      LIMIT 50
    `;

    const result = await db.query(query);

    return result.rows.map(row => ({
      customerId: row.customer_id,
      name: row.name,
      creditLimit: parseFloat(row.credit_limit),
      creditUsed: parseFloat(row.credit_used),
      utilizationRate: parseFloat(row.utilization_rate)
    }));
  }

  /**
   * Calculate repeat purchase rate
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<number>} Repeat purchase rate percentage
   */
  async getRepeatPurchaseRate(startDate, endDate) {
    const query = `
      SELECT
        ROUND(
          COALESCE(
            COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END)::numeric /
            NULLIF(COUNT(DISTINCT customer_id), 0) * 100,
            0
          ),
          2
        ) as repeat_rate
      FROM (
        SELECT
          customer_id,
          COUNT(*) as order_count
        FROM orders
        WHERE created_at >= $1 AND created_at <= $2
          AND status NOT IN ('cancelled')
        GROUP BY customer_id
      ) AS customer_orders
    `;

    const result = await db.query(query, [startDate, endDate]);
    return parseFloat(result.rows[0].repeat_rate) || 0;
  }

  /**
   * Get customer acquisition trend over time
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} New customers by month
   */
  async getCustomerAcquisitionTrend(startDate, endDate) {
    const query = `
      SELECT
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as new_customers
      FROM customers
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY month
      ORDER BY month
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      month: row.month,
      newCustomers: parseInt(row.new_customers)
    }));
  }
}

module.exports = new CustomerReportService();
