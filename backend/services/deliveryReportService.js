/**
 * Delivery Report Service
 * Issue #72: Delivery performance analytics with on-time rates and driver metrics
 */

const db = require('../utils/db');
const NodeCache = require('node-cache');

// Cache with 1-hour TTL
const reportCache = new NodeCache({ stdTTL: 3600 });

class DeliveryReportService {
  /**
   * Get complete delivery analytics
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {string} driverId - Optional driver ID filter
   * @returns {Promise<Object>} Complete delivery report
   */
  async getDeliveryAnalytics(startDate, endDate, driverId = null) {
    const cacheKey = `delivery_${startDate}_${endDate}_${driverId || 'all'}`;
    const cached = reportCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached delivery report');
      return cached;
    }

    const [onTimeData, driverPerformance, failureReasons, avgTime] = await Promise.all([
      this.calculateOnTimeRate(startDate, endDate, driverId),
      this.getDriverPerformance(startDate, endDate),
      this.getFailedDeliveryReasons(startDate, endDate),
      this.getAverageDeliveryTime(startDate, endDate)
    ]);

    const result = {
      onTimeRate: onTimeData.onTimeRate,
      totalDeliveries: onTimeData.totalDeliveries,
      onTimeDeliveries: onTimeData.onTimeDeliveries,
      avgDeliveryTime: avgTime,
      driverPerformance,
      failureReasons
    };

    reportCache.set(cacheKey, result);
    return result;
  }

  /**
   * Calculate on-time delivery rate
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} driverId - Optional driver ID filter
   * @returns {Promise<Object>} On-time rate metrics
   */
  async calculateOnTimeRate(startDate, endDate, driverId = null) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE rs.actual_arrival_time <= rs.estimated_arrival_time) as on_time_count,
        COUNT(*) as total_deliveries,
        ROUND(
          COALESCE(
            COUNT(*) FILTER (WHERE rs.actual_arrival_time <= rs.estimated_arrival_time)::numeric /
            NULLIF(COUNT(*), 0) * 100,
            0
          ),
          2
        ) as on_time_rate
      FROM route_stops rs
      JOIN delivery_routes dr ON rs.route_id = dr.id
      WHERE dr.route_date >= $1 AND dr.route_date <= $2
        AND rs.status = 'delivered'
        AND ($3::uuid IS NULL OR dr.driver_id = $3)
    `;

    const result = await db.query(query, [startDate, endDate, driverId]);
    const row = result.rows[0];

    return {
      onTimeDeliveries: parseInt(row.on_time_count) || 0,
      totalDeliveries: parseInt(row.total_deliveries) || 0,
      onTimeRate: parseFloat(row.on_time_rate) || 0
    };
  }

  /**
   * Get driver performance metrics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Driver performance data
   */
  async getDriverPerformance(startDate, endDate) {
    const query = `
      SELECT
        u.id,
        u.full_name,
        COUNT(DISTINCT dr.id) as routes_completed,
        COUNT(rs.id) as total_stops,
        COUNT(rs.id) FILTER (WHERE rs.status = 'delivered') as successful_deliveries,
        COUNT(rs.id) FILTER (WHERE rs.status = 'failed') as failed_deliveries,
        ROUND(
          COALESCE(
            COUNT(rs.id) FILTER (WHERE rs.status = 'delivered')::numeric /
            NULLIF(COUNT(rs.id), 0) * 100,
            0
          ),
          2
        ) as success_rate,
        ROUND(
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (rs.actual_arrival_time - rs.estimated_arrival_time))/60),
            0
          ),
          2
        ) as avg_delay_minutes
      FROM users u
      JOIN delivery_routes dr ON u.id = dr.driver_id
      LEFT JOIN route_stops rs ON dr.id = rs.route_id
      WHERE dr.route_date >= $1 AND dr.route_date <= $2
      GROUP BY u.id, u.full_name
      ORDER BY routes_completed DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      driverId: row.id,
      name: row.full_name,
      routesCompleted: parseInt(row.routes_completed),
      totalStops: parseInt(row.total_stops),
      successfulDeliveries: parseInt(row.successful_deliveries),
      failedDeliveries: parseInt(row.failed_deliveries),
      successRate: parseFloat(row.success_rate),
      avgDelayMinutes: parseFloat(row.avg_delay_minutes)
    }));
  }

  /**
   * Get failed delivery reasons breakdown
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Failed delivery reasons
   */
  async getFailedDeliveryReasons(startDate, endDate) {
    const query = `
      SELECT
        failure_reason as reason,
        COUNT(*) as count
      FROM route_stops
      WHERE status = 'failed'
        AND updated_at >= $1 AND updated_at <= $2
        AND failure_reason IS NOT NULL
      GROUP BY failure_reason
      ORDER BY count DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    return result.rows.map(row => ({
      reason: row.reason,
      count: parseInt(row.count)
    }));
  }

  /**
   * Get average delivery time (route completion)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<number>} Average delivery time in minutes
   */
  async getAverageDeliveryTime(startDate, endDate) {
    const query = `
      SELECT
        ROUND(
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (dr.actual_end_time - dr.actual_start_time))/60),
            0
          ),
          2
        ) as avg_time_minutes
      FROM delivery_routes dr
      WHERE dr.route_date >= $1 AND dr.route_date <= $2
        AND dr.status = 'completed'
        AND dr.actual_start_time IS NOT NULL
        AND dr.actual_end_time IS NOT NULL
    `;

    const result = await db.query(query, [startDate, endDate]);
    return parseFloat(result.rows[0].avg_time_minutes) || 0;
  }
}

module.exports = new DeliveryReportService();
