/**
 * Order Service
 * Business logic for order management
 * Issue #79: Auto order status updates
 */

const pool = require('../config/database');

class OrderService {
  /**
   * Update order status with history tracking
   * @param {string} orderId - Order ID
   * @param {string} newStatus - New status value
   * @param {string} notes - Status change notes
   * @param {string} userId - User who made the change (null for system)
   * @param {object} client - Database client (for transactions)
   */
  async updateOrderStatus(orderId, newStatus, notes, userId, client) {
    const dbClient = client || pool;

    try {
      // Update order status
      await dbClient.query(
        `UPDATE orders
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newStatus, orderId]
      );

      // Record status history
      await dbClient.query(
        `INSERT INTO order_status_history
         (order_id, status, notes, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [orderId, newStatus, notes, userId]
      );

      return { success: true };

    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Check if order is fully delivered
   * @param {string} orderId - Order ID
   * @param {object} client - Database client (optional)
   * @returns {boolean} True if all stops are delivered
   */
  async isOrderFullyDelivered(orderId, client) {
    const dbClient = client || pool;

    const query = `
      SELECT
        COUNT(*) as total_stops,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_stops
      FROM route_stops
      WHERE order_id = $1
    `;

    const result = await dbClient.query(query, [orderId]);
    const { total_stops, delivered_stops } = result.rows[0];

    return parseInt(total_stops) === parseInt(delivered_stops) && total_stops > 0;
  }

  /**
   * Get order details by ID
   * @param {string} orderId - Order ID
   * @returns {object} Order details
   */
  async getOrderById(orderId) {
    const query = `
      SELECT o.*, c.name as customer_name, c.phone_number
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(query, [orderId]);

    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    return result.rows[0];
  }

  /**
   * Get order items for an order
   * @param {string} orderId - Order ID
   * @returns {Array} Array of order items
   */
  async getOrderItems(orderId) {
    const query = `
      SELECT oi.*, s.sku_code, s.variant_name, p.name as product_name
      FROM order_items oi
      JOIN skus s ON oi.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE oi.order_id = $1
    `;

    const result = await pool.query(query, [orderId]);
    return result.rows;
  }
}

module.exports = OrderService;
