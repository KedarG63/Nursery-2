/**
 * Notification Scheduled Jobs
 * Cron jobs for periodic notifications
 * Issue #44: Implement Automated Notification Triggers
 */

const cron = require('node-cron');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');

const notificationService = new NotificationService();

class NotificationJobs {
  /**
   * Initialize all cron jobs
   */
  static initializeJobs() {
    console.log('🔄 Initializing notification cron jobs...');

    // Daily payment reminders at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Running daily payment reminder job...');
      await this.sendPaymentReminders();
    });

    // Check for ETA alerts every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('⏰ Checking for ETA alerts...');
      await this.checkETAAlerts();
    });

    // Daily order ready check at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('⏰ Checking for ready orders...');
      await this.checkReadyOrders();
    });

    // Daily 3-day delivery reminder at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('⏰ Sending 3-day delivery reminders...');
      await this.sendDeliveryReminders3Days();
    });

    // Daily day-of-delivery reminder at 7:00 AM
    cron.schedule('0 7 * * *', async () => {
      console.log('⏰ Sending day-of-delivery reminders...');
      await this.sendDeliveryDayReminders();
    });

    console.log('✅ Notification cron jobs initialized');
  }

  /**
   * Send payment reminders for overdue payments
   */
  static async sendPaymentReminders() {
    try {
      const query = `
        SELECT p.id
        FROM payments p
        WHERE p.status = 'pending'
          AND p.due_date < NOW()
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.payment_id = p.id
              AND wm.template_name = 'payment_reminder'
              AND wm.created_at > NOW() - INTERVAL '24 hours'
          )
        LIMIT 50
      `;

      const result = await pool.query(query);

      for (const payment of result.rows) {
        try {
          await notificationService.sendPaymentReminder(payment.id);

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending reminder for payment ${payment.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${result.rows.length} payment reminders`);

    } catch (error) {
      console.error('Error sending payment reminders:', error);
    }
  }

  /**
   * Check for routes approaching stops (ETA alerts)
   */
  static async checkETAAlerts() {
    try {
      const query = `
        SELECT DISTINCT ON (rs.id)
               rs.id, rs.route_id,
               gt.latitude as vehicle_lat, gt.longitude as vehicle_lng,
               rs.latitude as stop_lat, rs.longitude as stop_lng
        FROM route_stops rs
        JOIN delivery_routes dr ON rs.route_id = dr.id
        JOIN gps_tracking gt ON gt.route_id = dr.id
        WHERE rs.status = 'pending'
          AND dr.status = 'in_progress'
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.order_id = rs.order_id
              AND wm.template_name = 'delivery_eta_alert'
              AND wm.created_at > NOW() - INTERVAL '30 minutes'
          )
        ORDER BY rs.id, gt.recorded_at DESC
      `;

      const result = await pool.query(query);

      const { haversineDistance } = require('../utils/distanceUtils');

      for (const stop of result.rows) {
        try {
          const distance = haversineDistance(
            stop.vehicle_lat,
            stop.vehicle_lng,
            stop.stop_lat,
            stop.stop_lng
          );

          // If within 5km, send ETA alert
          if (distance <= 5) {
            const etaMinutes = Math.round((distance / 30) * 60); // Assuming 30 km/h

            const notificationEvents = require('../events/notificationEvents');
            notificationEvents.emit('delivery:eta', {
              stopId: stop.id,
              etaMinutes
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Error checking ETA for stop ${stop.id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('Error checking ETA alerts:', error);
    }
  }

  /**
   * Send 3-day delivery reminders for orders delivering in exactly 3 days
   */
  static async sendDeliveryReminders3Days() {
    try {
      const query = `
        SELECT o.id
        FROM orders o
        WHERE o.delivery_date::date = CURRENT_DATE + INTERVAL '3 days'
          AND o.status NOT IN ('cancelled', 'delivered')
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.order_id = o.id
              AND wm.template_name = 'delivery_reminder_3days'
          )
        LIMIT 50
      `;

      const result = await pool.query(query);

      for (const order of result.rows) {
        try {
          await notificationService.sendDeliveryReminder3Days(order.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending 3-day reminder for order ${order.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${result.rows.length} 3-day delivery reminders`);

    } catch (error) {
      console.error('Error sending 3-day delivery reminders:', error);
    }
  }

  /**
   * Send day-of-delivery reminders for orders delivering today
   */
  static async sendDeliveryDayReminders() {
    try {
      const query = `
        SELECT o.id
        FROM orders o
        WHERE o.delivery_date::date = CURRENT_DATE
          AND o.status NOT IN ('cancelled', 'delivered')
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.order_id = o.id
              AND wm.template_name = 'delivery_day_reminder'
          )
        LIMIT 50
      `;

      const result = await pool.query(query);

      for (const order of result.rows) {
        try {
          await notificationService.sendDeliveryDayReminder(order.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending day-of reminder for order ${order.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${result.rows.length} day-of-delivery reminders`);

    } catch (error) {
      console.error('Error sending day-of-delivery reminders:', error);
    }
  }

  /**
   * Check for orders that are ready
   */
  static async checkReadyOrders() {
    try {
      const query = `
        SELECT o.id
        FROM orders o
        WHERE o.status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.order_id = o.id
              AND wm.template_name = 'order_ready'
          )
        LIMIT 50
      `;

      const result = await pool.query(query);

      for (const order of result.rows) {
        try {
          await notificationService.sendOrderReady(order.id);

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending ready notification for order ${order.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${result.rows.length} order ready notifications`);

    } catch (error) {
      console.error('Error checking ready orders:', error);
    }
  }
}

module.exports = NotificationJobs;
