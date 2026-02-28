/**
 * Growth Progress Photo Job
 * Weekly job to send growth progress photos to customers
 * Issue #78: Create weekly growth progress photo automation
 */

const cron = require('node-cron');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');

const notificationService = new NotificationService();

class GrowthProgressJob {
  /**
   * Initialize the cron job
   */
  static initialize() {
    // Run every Sunday at 10:00 AM
    cron.schedule('0 10 * * 0', async () => {
      console.log('⏰ Running weekly growth progress photo job...');
      await this.sendGrowthProgressPhotos();
    });

    console.log('✅ Growth progress job scheduled (Sundays at 10:00 AM)');
  }

  /**
   * Send growth progress photos
   */
  static async sendGrowthProgressPhotos() {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current ISO week and year
      const weekQuery = `
        SELECT
          EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER as week_number,
          EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER as year
      `;
      const weekResult = await client.query(weekQuery);
      const { week_number, year } = weekResult.rows[0];

      // Get active orders with allocated lots that have photos
      const ordersQuery = `
        SELECT DISTINCT
          o.id as order_id,
          o.order_number,
          o.customer_id,
          c.name as customer_name,
          c.phone as phone_number,
          oi.id as order_item_id,
          l.id as lot_id,
          l.lot_number,
          l.growth_stage as lot_status,
          l.expected_ready_date,
          p.name as product_name,
          s.sku_code as variant_name,
          oi.quantity,
          lp.id as photo_id,
          lp.photo_url,
          lp.growth_stage,
          lp.captured_at,
          (l.expected_ready_date - CURRENT_DATE) as days_to_ready
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN lots l ON oi.lot_id = l.id
        JOIN skus s ON oi.sku_id = s.id
        JOIN products p ON s.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT id, photo_url, growth_stage, captured_at
          FROM lot_photos
          WHERE lot_id = l.id
            AND photo_type = 'progress'
          ORDER BY captured_at DESC
          LIMIT 1
        ) lp ON TRUE
        WHERE o.status IN ('confirmed', 'preparing')
          AND l.growth_stage IN ('seed', 'germination', 'seedling', 'transplant', 'ready')
          AND NOT EXISTS (
            SELECT 1 FROM weekly_photo_notifications wpn
            WHERE wpn.lot_id = l.id
              AND wpn.order_id = o.id
              AND wpn.week_number = $1
              AND wpn.year = $2
          )
        ORDER BY o.customer_id, o.id
      `;

      const result = await client.query(ordersQuery, [week_number, year]);

      if (result.rows.length === 0) {
        console.log('ℹ️ No growth progress photos to send this week');
        await client.query('COMMIT');
        return;
      }

      // Group by customer and order
      const grouped = this.groupByCustomerOrder(result.rows);

      let successCount = 0;
      let failureCount = 0;
      let noPhotoCount = 0;

      for (const [orderId, orderData] of Object.entries(grouped)) {
        try {
          // Check if order has at least one photo
          const lotsWithPhotos = orderData.lots.filter(l => l.photo_url);

          if (lotsWithPhotos.length === 0) {
            console.log(`ℹ️ No photos available for order ${orderData.order_number}`);
            noPhotoCount++;
            continue;
          }

          // Send progress update with photos
          await notificationService.sendGrowthProgressUpdate(
            orderId,
            {
              customerName: orderData.customer_name,
              orderNumber: orderData.order_number,
              lots: lotsWithPhotos
            }
          );

          // Record notification sent
          for (const lot of orderData.lots) {
            await client.query(
              `INSERT INTO weekly_photo_notifications
               (lot_id, order_id, customer_id, photo_id, week_number, year)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (lot_id, order_id, week_number, year) DO NOTHING`,
              [lot.lot_id, orderId, orderData.customer_id, lot.photo_id, week_number, year]
            );
          }

          // Update lot tracking
          await client.query(
            `UPDATE lots
             SET last_photo_sent_at = CURRENT_TIMESTAMP
             WHERE id = ANY($1)`,
            [orderData.lots.map(l => l.lot_id)]
          );

          // Log notification
          await this.logNotification(client, {
            type: 'growth_progress',
            entityType: 'order',
            entityId: orderId,
            recipientPhone: orderData.phone_number,
            recipientId: orderData.customer_id,
            status: 'sent'
          });

          successCount++;

          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay (media messages)

        } catch (error) {
          console.error(`❌ Failed to send progress for order ${orderId}:`, error.message);

          await this.logNotification(client, {
            type: 'growth_progress',
            entityType: 'order',
            entityId: orderId,
            recipientPhone: orderData.phone_number,
            recipientId: orderData.customer_id,
            status: 'failed',
            errorMessage: error.message
          });

          failureCount++;
        }
      }

      await client.query('COMMIT');

      console.log(`✅ Growth progress job completed:`);
      console.log(`   - Success: ${successCount}`);
      console.log(`   - No photos: ${noPhotoCount}`);
      console.log(`   - Failed: ${failureCount}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error in growth progress job:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Group results by customer and order
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
          lots: []
        };
      }

      grouped[row.order_id].lots.push({
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
        variant_name: row.variant_name,
        quantity: row.quantity,
        lot_status: row.lot_status,
        growth_stage: row.growth_stage,
        days_to_ready: row.days_to_ready,
        photo_id: row.photo_id,
        photo_url: row.photo_url
      });
    });

    return grouped;
  }

  /**
   * Log notification
   */
  static async logNotification(client, data) {
    await client.query(
      `INSERT INTO notification_logs
       (notification_type, entity_type, entity_id, recipient_phone,
        recipient_id, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               CASE WHEN $6 = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        data.type,
        data.entityType,
        data.entityId,
        data.recipientPhone,
        data.recipientId,
        data.status,
        data.errorMessage || null
      ]
    );
  }
}

module.exports = GrowthProgressJob;
