/**
 * Ready Notification Job
 * Daily job to check lots reaching ready stage and send notifications
 * Issue #75: Create scheduled job for ready notifications
 */

const cron = require('node-cron');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');

const notificationService = new NotificationService();

class ReadyNotificationJob {
  /**
   * Initialize the cron job
   */
  static initialize() {
    // Run daily at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('⏰ Running ready notification job...');
      await this.processReadyNotifications();
    });

    console.log('✅ Ready notification job scheduled (daily at 8:00 AM)');
  }

  /**
   * Process lots reaching ready stage
   */
  static async processReadyNotifications() {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Query lots reaching ready stage today (±1 day buffer)
      const lotsQuery = `
        SELECT
          l.id as lot_id,
          l.lot_number,
          l.expected_ready_date,
          l.available_quantity as current_quantity,
          o.id as order_id,
          o.order_number,
          o.customer_id,
          c.name as customer_name,
          c.phone as phone_number,
          oi.quantity as ordered_quantity,
          oi.sku_id,
          s.sku_code as variant_name,
          p.name as product_name,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE))::INTEGER as days_until_ready
        FROM lots l
        INNER JOIN order_items oi ON oi.lot_id = l.id
        INNER JOIN orders o ON oi.order_id = o.id
        INNER JOIN customers c ON o.customer_id = c.id
        INNER JOIN skus s ON oi.sku_id = s.id
        INNER JOIN products p ON s.product_id = p.id
        WHERE l.growth_stage = 'ready'
          AND l.expected_ready_date BETWEEN CURRENT_DATE - INTERVAL '1 day'
                                        AND CURRENT_DATE + INTERVAL '1 day'
          AND l.ready_notification_sent = FALSE
          AND o.status IN ('confirmed', 'preparing')
        ORDER BY o.customer_id, o.id
      `;

      const result = await client.query(lotsQuery);

      if (result.rows.length === 0) {
        console.log('ℹ️ No lots ready for notification today');
        await client.query('COMMIT');
        return;
      }

      // Group by customer and order
      const ordersByCustomer = this.groupByCustomerOrder(result.rows);

      let successCount = 0;
      let failureCount = 0;

      // Send notifications for each order
      for (const [orderId, orderData] of Object.entries(ordersByCustomer)) {
        try {
          // Send ready alert
          await notificationService.sendReadyAlert(
            orderId,
            orderData.lots,
            orderData.daysUntilReady
          );

          // Mark lots as notified
          const lotIds = orderData.lots.map(l => l.lot_id);
          await client.query(
            `UPDATE lots
             SET ready_notification_sent = TRUE,
                 ready_notification_sent_at = CURRENT_TIMESTAMP
             WHERE id = ANY($1)`,
            [lotIds]
          );

          // Log successful notification
          await this.logNotification(client, {
            type: 'ready_alert',
            entityType: 'order',
            entityId: orderId,
            recipientPhone: orderData.phone_number,
            recipientId: orderData.customer_id,
            status: 'sent',
            templateName: 'order_ready_alert'
          });

          successCount++;

          // Rate limiting - 1 second delay between messages
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Failed to send ready alert for order ${orderId}:`, error.message);

          // Log failure
          await this.logNotification(client, {
            type: 'ready_alert',
            entityType: 'order',
            entityId: orderId,
            recipientPhone: orderData.phone_number,
            recipientId: orderData.customer_id,
            status: 'failed',
            templateName: 'order_ready_alert',
            errorMessage: error.message,
            retryCount: 0
          });

          failureCount++;
        }
      }

      await client.query('COMMIT');

      console.log(`✅ Ready notification job completed:`);
      console.log(`   - Success: ${successCount}`);
      console.log(`   - Failed: ${failureCount}`);

      // Retry failed notifications once
      if (failureCount > 0) {
        setTimeout(() => this.retryFailedNotifications(), 5 * 60 * 1000); // Retry after 5 minutes
      }

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error in ready notification job:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Group lots by customer and order
   */
  static groupByCustomerOrder(rows) {
    const grouped = {};

    rows.forEach(row => {
      if (!grouped[row.order_id]) {
        grouped[row.order_id] = {
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          phone_number: row.phone_number,
          order_number: row.order_number,
          daysUntilReady: row.days_until_ready,
          lots: []
        };
      }

      grouped[row.order_id].lots.push({
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
        variant_name: row.variant_name,
        quantity: row.ordered_quantity
      });
    });

    return grouped;
  }

  /**
   * Log notification to audit trail
   */
  static async logNotification(client, data) {
    await client.query(
      `INSERT INTO notification_logs
       (notification_type, entity_type, entity_id, recipient_phone,
        recipient_id, status, template_name, error_message, retry_count, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6::text, $7, $8, $9,
               CASE WHEN $6::text = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        data.type,
        data.entityType,
        data.entityId,
        data.recipientPhone,
        data.recipientId,
        data.status,
        data.templateName,
        data.errorMessage || null,
        data.retryCount || 0
      ]
    );
  }

  /**
   * Retry failed notifications once
   */
  static async retryFailedNotifications() {
    const client = await pool.connect();

    try {
      // Get failed notifications from last 1 hour with retry_count = 0
      const failedQuery = `
        SELECT DISTINCT entity_id as order_id
        FROM notification_logs
        WHERE notification_type = 'ready_alert'
          AND status = 'failed'
          AND retry_count = 0
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      `;

      const result = await client.query(failedQuery);

      for (const row of result.rows) {
        try {
          // Get order details for retry
          const orderQuery = `
            SELECT o.id, o.customer_id, c.phone as phone_number,
                   json_agg(json_build_object(
                     'lot_id', l.id,
                     'lot_number', l.lot_number,
                     'product_name', p.name,
                     'variant_name', s.sku_code,
                     'quantity', oi.quantity
                   )) as lots,
                   EXTRACT(DAY FROM (MIN(l.expected_ready_date) - CURRENT_DATE))::INTEGER as days_until_ready
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN lots l ON oi.lot_id = l.id
            JOIN skus s ON oi.sku_id = s.id
            JOIN products p ON s.product_id = p.id
            WHERE o.id = $1
            GROUP BY o.id, o.customer_id, c.phone
          `;

          const orderResult = await client.query(orderQuery, [row.order_id]);

          if (orderResult.rows.length > 0) {
            const order = orderResult.rows[0];

            await notificationService.sendReadyAlert(
              row.order_id,
              order.lots,
              order.days_until_ready
            );

            // Update retry count
            await client.query(
              `UPDATE notification_logs
               SET status = 'sent',
                   retry_count = 1,
                   sent_at = CURRENT_TIMESTAMP
               WHERE entity_id = $1
                 AND notification_type = 'ready_alert'
                 AND status = 'failed'`,
              [row.order_id]
            );

            console.log(`✅ Retry successful for order ${row.order_id}`);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Retry failed for order ${row.order_id}:`, error.message);

          // Mark as permanently failed
          await client.query(
            `UPDATE notification_logs
             SET retry_count = 1, error_message = $2
             WHERE entity_id = $1
               AND notification_type = 'ready_alert'
               AND status = 'failed'`,
            [row.order_id, error.message]
          );
        }
      }

    } catch (error) {
      console.error('❌ Error in retry job:', error);
    } finally {
      client.release();
    }
  }
}

module.exports = ReadyNotificationJob;
