/**
 * Notification Service
 * High-level API for sending notifications
 * Issue #42: Implement Notification Service
 */

const WhatsAppService = require('./whatsapp/whatsappService');
const pool = require('../config/database');

const whatsappService = new WhatsAppService();

class NotificationService {
  /**
   * Send order confirmation
   */
  async sendOrderConfirmation(orderId) {
    // Fetch order details
    const orderQuery = `
      SELECT o.*, c.phone_number, c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    const variables = [
      order.customer_name,
      order.order_number,
      order.total_amount.toFixed(2),
      this.formatDate(order.delivery_date),
      `https://nursery.com/track/${order.order_number}`
    ];

    return await whatsappService.sendMessage(
      order.phone_number,
      null,
      {
        templateName: 'order_confirmation',
        variables,
        customerId: order.customer_id,
        orderId: order.id,
        category: 'order'
      }
    );
  }

  /**
   * Send order ready notification
   */
  async sendOrderReady(orderId) {
    const orderQuery = `
      SELECT o.*, c.phone_number, c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    const variables = [
      order.customer_name,
      order.order_number
    ];

    return await whatsappService.sendMessage(
      order.phone_number,
      null,
      {
        templateName: 'order_ready',
        variables,
        customerId: order.customer_id,
        orderId: order.id,
        category: 'order'
      }
    );
  }

  /**
   * Send delivery dispatched notification
   */
  async sendDeliveryDispatched(routeId) {
    // Get route and order details
    const query = `
      SELECT dr.*, rs.order_id, o.order_number,
             c.phone_number, c.name as customer_name, c.id as customer_id,
             u.full_name as driver_name
      FROM delivery_routes dr
      JOIN route_stops rs ON dr.id = rs.route_id
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON dr.driver_id = u.id
      WHERE dr.id = $1
    `;

    const result = await pool.query(query, [routeId]);

    // Send to each customer
    for (const stop of result.rows) {
      const variables = [
        stop.customer_name,
        stop.order_number,
        stop.driver_name || 'Our driver',
        `https://nursery.com/track/${stop.order_number}`
      ];

      await whatsappService.sendMessage(
        stop.phone_number,
        null,
        {
          templateName: 'delivery_dispatched',
          variables,
          customerId: stop.customer_id,
          orderId: stop.order_id,
          routeId: routeId,
          category: 'delivery'
        }
      );
    }
  }

  /**
   * Send ETA alert (20 minutes away)
   */
  async sendETAAlert(stopId, etaMinutes) {
    const query = `
      SELECT rs.*, o.order_number, o.id as order_id,
             c.phone_number, c.name as customer_name, c.id as customer_id,
             u.full_name as driver_name
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN delivery_routes dr ON rs.route_id = dr.id
      LEFT JOIN users u ON dr.driver_id = u.id
      WHERE rs.id = $1
    `;

    const result = await pool.query(query, [stopId]);
    if (result.rows.length === 0) {
      throw new Error('Stop not found');
    }

    const stop = result.rows[0];

    const variables = [
      etaMinutes.toString(),
      stop.driver_name || 'Our driver',
      stop.order_number
    ];

    return await whatsappService.sendMessage(
      stop.phone_number,
      null,
      {
        templateName: 'delivery_eta_alert',
        variables,
        customerId: stop.customer_id,
        orderId: stop.order_id,
        category: 'delivery'
      }
    );
  }

  /**
   * Send delivery completed notification
   */
  async sendDeliveryCompleted(stopId) {
    const query = `
      SELECT rs.*, o.order_number, o.id as order_id,
             c.phone_number, c.name as customer_name, c.id as customer_id
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE rs.id = $1
    `;

    const result = await pool.query(query, [stopId]);
    if (result.rows.length === 0) {
      throw new Error('Stop not found');
    }

    const stop = result.rows[0];

    const variables = [
      stop.customer_name,
      stop.order_number,
      `https://nursery.com/feedback/${stop.order_id}`
    ];

    return await whatsappService.sendMessage(
      stop.phone_number,
      null,
      {
        templateName: 'delivery_completed',
        variables,
        customerId: stop.customer_id,
        orderId: stop.order_id,
        category: 'delivery'
      }
    );
  }

  /**
   * Send delivery failed notification
   */
  async sendDeliveryFailed(stopId, failureReason) {
    const query = `
      SELECT rs.*, o.order_number, o.id as order_id,
             c.phone_number, c.name as customer_name, c.id as customer_id
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE rs.id = $1
    `;

    const result = await pool.query(query, [stopId]);
    if (result.rows.length === 0) {
      throw new Error('Stop not found');
    }

    const stop = result.rows[0];
    const whatsappConfig = require('../config/whatsapp');

    const variables = [
      stop.customer_name,
      stop.order_number,
      failureReason || 'Customer not available',
      whatsappConfig.settings.supportNumber
    ];

    return await whatsappService.sendMessage(
      stop.phone_number,
      null,
      {
        templateName: 'delivery_failed',
        variables,
        customerId: stop.customer_id,
        orderId: stop.order_id,
        category: 'delivery'
      }
    );
  }

  /**
   * Send payment reminder
   */
  async sendPaymentReminder(paymentId) {
    const query = `
      SELECT p.*, o.order_number,
             c.phone_number, c.name as customer_name, c.id as customer_id
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE p.id = $1
    `;

    const result = await pool.query(query, [paymentId]);
    if (result.rows.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = result.rows[0];

    const variables = [
      payment.customer_name,
      payment.amount.toFixed(2),
      payment.order_number,
      this.formatDate(payment.due_date),
      `https://nursery.com/pay/${payment.id}`
    ];

    return await whatsappService.sendMessage(
      payment.phone_number,
      null,
      {
        templateName: 'payment_reminder',
        variables,
        customerId: payment.customer_id,
        orderId: payment.order_id,
        paymentId: payment.id,
        category: 'payment'
      }
    );
  }

  /**
   * Send payment received confirmation
   */
  async sendPaymentReceived(paymentId) {
    const query = `
      SELECT p.*, o.order_number,
             c.phone_number, c.name as customer_name, c.id as customer_id
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE p.id = $1
    `;

    const result = await pool.query(query, [paymentId]);
    if (result.rows.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = result.rows[0];

    const variables = [
      payment.customer_name,
      payment.amount.toFixed(2),
      payment.order_number
    ];

    return await whatsappService.sendMessage(
      payment.phone_number,
      null,
      {
        templateName: 'payment_received',
        variables,
        customerId: payment.customer_id,
        orderId: payment.order_id,
        paymentId: payment.id,
        category: 'payment'
      }
    );
  }

  /**
   * Send ready alert notification (Issue #75)
   * @param {string} orderId - Order ID
   * @param {Array} lots - Array of lot details
   * @param {number} daysUntilReady - Days until ready (can be negative if overdue)
   */
  async sendReadyAlert(orderId, lots, daysUntilReady) {
    const orderQuery = `
      SELECT o.*, c.phone as phone_number, c.name as customer_name, c.id as customer_id
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    // Build message text for lots
    const lotsList = lots.map(l =>
      `${l.product_name} ${l.variant_name} (${l.quantity} qty)`
    ).join(', ');

    // Determine message based on days
    let readyMessage;
    if (daysUntilReady <= 0) {
      readyMessage = 'ready for delivery';
    } else if (daysUntilReady === 1) {
      readyMessage = 'ready tomorrow';
    } else {
      readyMessage = `ready in ${daysUntilReady} days`;
    }

    const variables = [
      order.customer_name,
      order.order_number,
      lotsList,
      readyMessage,
      `https://nursery.com/orders/${order.order_number}`
    ];

    return await whatsappService.sendMessage(
      order.phone_number,
      null,
      {
        templateName: 'order_ready_alert',
        variables,
        customerId: order.customer_id,
        orderId: order.id,
        category: 'order'
      }
    );
  }

  /**
   * Send upcoming payment reminder (due in 3 days) - Issue #76
   * @param {string} installmentId - Payment installment ID
   * @param {object} data - Payment data
   */
  async sendUpcomingPaymentReminder(installmentId, data) {
    const query = `
      SELECT c.phone_number, c.id as customer_id, o.id as order_id
      FROM payment_installments pi
      JOIN payments p ON pi.payment_id = p.id
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.id = $1
    `;

    const result = await pool.query(query, [installmentId]);
    if (result.rows.length === 0) {
      throw new Error('Installment not found');
    }

    const record = result.rows[0];

    const variables = [
      data.customerName,
      data.amount.toFixed(2),
      data.orderNumber,
      this.formatDate(data.dueDate),
      `https://nursery.com/pay/${installmentId}`
    ];

    return await whatsappService.sendMessage(
      record.phone_number,
      null,
      {
        templateName: 'payment_reminder_upcoming',
        variables,
        customerId: record.customer_id,
        orderId: record.order_id,
        category: 'payment'
      }
    );
  }

  /**
   * Send overdue payment reminder - Issue #76
   * @param {string} installmentId - Payment installment ID
   * @param {object} data - Payment data
   */
  async sendOverduePaymentReminder(installmentId, data) {
    const query = `
      SELECT c.phone_number, c.id as customer_id, o.id as order_id
      FROM payment_installments pi
      JOIN payments p ON pi.payment_id = p.id
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.id = $1
    `;

    const result = await pool.query(query, [installmentId]);
    if (result.rows.length === 0) {
      throw new Error('Installment not found');
    }

    const record = result.rows[0];
    const whatsappConfig = require('../config/whatsapp');

    const variables = [
      data.customerName,
      data.amount.toFixed(2),
      data.orderNumber,
      data.daysOverdue.toString(),
      `https://nursery.com/pay/${installmentId}`,
      whatsappConfig.settings.supportNumber
    ];

    return await whatsappService.sendMessage(
      record.phone_number,
      null,
      {
        templateName: 'payment_reminder_overdue',
        variables,
        customerId: record.customer_id,
        orderId: record.order_id,
        category: 'payment'
      }
    );
  }

  /**
   * Send growth progress update with photos - Issue #78
   * @param {string} orderId - Order ID
   * @param {object} data - Order and lots data
   */
  async sendGrowthProgressUpdate(orderId, data) {
    const orderQuery = `
      SELECT o.*, c.phone_number, c.id as customer_id
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    // Build message text
    const lotsText = data.lots.map(l => {
      const readyText = l.days_to_ready > 0
        ? `ready in ${l.days_to_ready} days`
        : l.days_to_ready === 0
          ? 'ready today'
          : 'ready for delivery';

      return `🌱 ${l.product_name} ${l.variant_name} - ${l.growth_stage || 'growing'} (${readyText})`;
    }).join('\n');

    // For now, send text message (WhatsApp media messages need separate implementation)
    // In production, use WhatsApp Business API media message endpoint

    const message = `
Hello ${data.customerName},

Here's your weekly growth progress update for Order #${data.orderNumber}:

${lotsText}

Your plants are growing well! We'll notify you when they're ready for delivery.

Track your order: https://nursery.com/orders/${data.orderNumber}

Happy Gardening! 🌿
    `.trim();

    // Send via WhatsApp (simplified - actual implementation would send photos)
    return await whatsappService.sendMessage(
      order.phone_number,
      message,
      {
        customerId: order.customer_id,
        orderId: order.id,
        category: 'growth_update'
      }
    );

    // TODO: Implement media message sending with actual photos
    // For each lot with photo, call WhatsApp Media API
  }

  /**
   * Send 3-days-before-delivery reminder
   * Tells the customer to prepare their field for sapling delivery
   */
  async sendDeliveryReminder3Days(orderId) {
    const orderQuery = `
      SELECT o.*, c.phone_number, c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    const variables = [
      order.customer_name,
      order.order_number,
      this.formatDate(order.delivery_date)
    ];

    return await whatsappService.sendMessage(
      order.phone_number,
      null,
      {
        templateName: 'delivery_reminder_3days',
        variables,
        customerId: order.customer_id,
        orderId: order.id,
        category: 'delivery'
      }
    );
  }

  /**
   * Send day-of-delivery morning reminder
   * Tells the customer their saplings will arrive today
   */
  async sendDeliveryDayReminder(orderId) {
    const orderQuery = `
      SELECT o.*, c.phone_number, c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = result.rows[0];

    const variables = [
      order.customer_name,
      order.order_number
    ];

    return await whatsappService.sendMessage(
      order.phone_number,
      null,
      {
        templateName: 'delivery_day_reminder',
        variables,
        customerId: order.customer_id,
        orderId: order.id,
        category: 'delivery'
      }
    );
  }

  /**
   * Format date helper
   */
  formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}

module.exports = NotificationService;
