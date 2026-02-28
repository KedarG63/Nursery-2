/**
 * Delivery Events
 * Event-driven triggers for delivery-related actions
 * Issue #79: Auto order status update from delivery
 */

const EventEmitter = require('events');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const OrderService = require('../services/orderService');

const notificationService = new NotificationService();
const orderService = new OrderService();

class DeliveryEvents extends EventEmitter {
  constructor() {
    super();
    this.setupListeners();
  }

  setupListeners() {
    // Route started - update orders to 'dispatched'
    this.on('route:started', async (data) => {
      try {
        await this.handleRouteStarted(data.routeId);
      } catch (error) {
        console.error('Error handling route started:', error);
      }
    });

    // Stop delivered - check if order complete
    this.on('stop:delivered', async (data) => {
      try {
        await this.handleStopDelivered(data.stopId);
      } catch (error) {
        console.error('Error handling stop delivered:', error);
      }
    });

    // Route completed - finalize all orders
    this.on('route:completed', async (data) => {
      try {
        await this.handleRouteCompleted(data.routeId);
      } catch (error) {
        console.error('Error handling route completed:', error);
      }
    });
  }

  /**
   * Handle route started - update all orders to 'dispatched'
   * @param {string} routeId - Route ID
   */
  async handleRouteStarted(routeId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get all orders on this route
      const ordersQuery = `
        SELECT DISTINCT o.id, o.order_number, o.status
        FROM orders o
        JOIN route_stops rs ON rs.order_id = o.id
        WHERE rs.route_id = $1
          AND o.status = 'confirmed'
      `;

      const result = await client.query(ordersQuery, [routeId]);

      for (const order of result.rows) {
        // Update order status to 'dispatched'
        await orderService.updateOrderStatus(
          order.id,
          'dispatched',
          'Delivery route started',
          null, // system-generated
          client
        );

        console.log(`📦 Order ${order.order_number} updated to 'dispatched'`);
      }

      await client.query('COMMIT');

      console.log(`✅ Updated ${result.rows.length} orders to dispatched for route ${routeId}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating orders on route start:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle stop delivered - check if order is fully delivered
   * @param {string} stopId - Route stop ID
   */
  async handleStopDelivered(stopId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get order for this stop
      const stopQuery = `
        SELECT rs.order_id, o.order_number, o.status, o.payment_method
        FROM route_stops rs
        JOIN orders o ON rs.order_id = o.id
        WHERE rs.id = $1
      `;

      const stopResult = await client.query(stopQuery, [stopId]);

      if (stopResult.rows.length === 0) {
        throw new Error('Stop not found');
      }

      const { order_id, order_number, status, payment_method } = stopResult.rows[0];

      // Check if all stops for this order are delivered
      const allStopsQuery = `
        SELECT COUNT(*) as total_stops,
               COUNT(*) FILTER (WHERE status = 'delivered') as delivered_stops
        FROM route_stops
        WHERE order_id = $1
      `;

      const stopsResult = await client.query(allStopsQuery, [order_id]);
      const { total_stops, delivered_stops } = stopsResult.rows[0];

      // If all stops delivered, update order to 'delivered'
      if (parseInt(total_stops) === parseInt(delivered_stops)) {
        await orderService.updateOrderStatus(
          order_id,
          'delivered',
          'All items delivered successfully',
          null,
          client
        );

        // Handle COD payment
        if (payment_method === 'cash') {
          await this.handleCODPayment(order_id, client);
        }

        // Update inventory - reduce allocated quantities
        await this.updateInventoryOnDelivery(order_id, client);

        // Send delivery confirmation
        await notificationService.sendDeliveryCompleted(stopId);

        console.log(`✅ Order ${order_number} marked as delivered (all stops completed)`);
      } else {
        console.log(`ℹ️ Order ${order_number}: ${delivered_stops}/${total_stops} stops delivered`);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error handling stop delivered:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle COD payment on delivery
   * @param {string} orderId - Order ID
   * @param {object} client - Database client
   */
  async handleCODPayment(orderId, client) {
    // Check if payment already recorded
    const paymentCheck = `
      SELECT id FROM payments
      WHERE order_id = $1 AND status = 'success'
    `;

    const existing = await client.query(paymentCheck, [orderId]);

    if (existing.rows.length > 0) {
      console.log(`ℹ️ Payment already recorded for order ${orderId}`);
      return;
    }

    // Get order total
    const orderQuery = `
      SELECT total_amount, customer_id FROM orders WHERE id = $1
    `;

    const orderResult = await client.query(orderQuery, [orderId]);
    const { total_amount, customer_id } = orderResult.rows[0];

    // Create payment record
    const paymentInsert = `
      INSERT INTO payments
        (order_id, customer_id, amount, payment_method, status,
         payment_date, transaction_id, notes)
      VALUES
        ($1, $2, $3, 'cash', 'completed', CURRENT_TIMESTAMP,
         $4, 'Cash on Delivery - Auto-recorded')
      RETURNING id
    `;

    const txnId = `COD-${orderId.substring(0, 8)}-${Date.now()}`;
    await client.query(paymentInsert, [orderId, customer_id, total_amount, txnId]);

    console.log(`💰 COD payment recorded for order ${orderId}: ₹${total_amount}`);
  }

  /**
   * Update inventory on successful delivery
   * @param {string} orderId - Order ID
   * @param {object} client - Database client
   */
  async updateInventoryOnDelivery(orderId, client) {
    // Get allocated lots for this order
    const lotsQuery = `
      SELECT oi.allocated_lot_id, oi.quantity, oi.sku_id
      FROM order_items oi
      WHERE oi.order_id = $1
        AND oi.allocated_lot_id IS NOT NULL
    `;

    const result = await client.query(lotsQuery, [orderId]);

    for (const item of result.rows) {
      // Reduce current_quantity from lot
      await client.query(
        `UPDATE lots
         SET current_quantity = current_quantity - $1
         WHERE id = $2`,
        [item.quantity, item.allocated_lot_id]
      );

      // Record lot movement
      await client.query(
        `INSERT INTO lot_movements
         (lot_id, movement_type, quantity, notes, created_at)
         VALUES ($1, 'delivery', $2, $3, CURRENT_TIMESTAMP)`,
        [
          item.allocated_lot_id,
          -item.quantity,
          `Delivered for order ${orderId}`
        ]
      );
    }

    console.log(`📦 Inventory updated for ${result.rows.length} items`);
  }

  /**
   * Handle route completed
   * @param {string} routeId - Route ID
   */
  async handleRouteCompleted(routeId) {
    console.log(`✅ Route ${routeId} completed`);
    // Additional cleanup or reporting logic can go here
  }
}

// Export singleton instance
const deliveryEvents = new DeliveryEvents();
module.exports = deliveryEvents;
