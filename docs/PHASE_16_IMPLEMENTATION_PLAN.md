# Phase 16: Automation & Scheduled Jobs - Implementation Plan

## Overview
Phase 16 focuses on implementing automated notifications, scheduled jobs, and event-driven triggers to reduce manual work and improve customer communication. This includes 6 issues (#75-#80) covering ready notifications, payment reminders, ETA alerts, growth progress photos, auto order status updates, and low stock alerts.

## Prerequisites
- ✅ Phase 15 completed (WhatsApp integration, GPS tracking)
- ✅ Existing notification service structure
- ✅ node-cron already installed (v3.0.3)
- ✅ Database connection pooling configured
- ✅ WhatsApp templates configured

---

## Issue #75: Ready Notifications Scheduled Job

### Overview
Daily cron job to identify lots reaching ready stage and notify customers about their orders.

### Database Schema Changes

#### Migration 1: Add ready notification tracking
**File:** `backend/migrations/1760800000001_add_ready_notification_tracking.js`

```sql
-- Add notification tracking to lots table
ALTER TABLE lots
  ADD COLUMN ready_notification_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN ready_notification_sent_at TIMESTAMP;

-- Add index for performance
CREATE INDEX idx_lots_expected_ready_date
  ON lots(expected_ready_date)
  WHERE ready_notification_sent = FALSE;

-- Add notification logs table for audit trail
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'lot', 'order', 'payment', etc.
  entity_id UUID NOT NULL,
  recipient_phone VARCHAR(20),
  recipient_id UUID, -- customer_id or user_id
  status VARCHAR(20) NOT NULL, -- 'sent', 'failed', 'retry'
  template_name VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

CREATE INDEX idx_notification_logs_entity ON notification_logs(entity_type, entity_id);
CREATE INDEX idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX idx_notification_logs_type_status ON notification_logs(notification_type, status);
```

### Backend Implementation

#### File 1: `backend/jobs/readyNotificationJob.js` (NEW)
```javascript
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
          l.current_quantity,
          o.id as order_id,
          o.order_number,
          o.customer_id,
          c.name as customer_name,
          c.phone_number,
          oi.quantity as ordered_quantity,
          oi.sku_id,
          s.variant_name,
          p.name as product_name,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
        FROM lots l
        INNER JOIN order_items oi ON oi.allocated_lot_id = l.id
        INNER JOIN orders o ON oi.order_id = o.id
        INNER JOIN customers c ON o.customer_id = c.id
        INNER JOIN skus s ON oi.sku_id = s.id
        INNER JOIN products p ON s.product_id = p.id
        WHERE l.status = 'growing'
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

          // Log failure with retry flag
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               CASE WHEN $6 = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
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
            SELECT o.id, o.customer_id, c.phone_number,
                   array_agg(json_build_object(
                     'lot_id', l.id,
                     'lot_number', l.lot_number,
                     'product_name', p.name,
                     'variant_name', s.variant_name,
                     'quantity', oi.quantity
                   )) as lots,
                   EXTRACT(DAY FROM (MIN(l.expected_ready_date) - CURRENT_DATE)) as days_until_ready
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN lots l ON oi.allocated_lot_id = l.id
            JOIN skus s ON oi.sku_id = s.id
            JOIN products p ON s.product_id = p.id
            WHERE o.id = $1
            GROUP BY o.id, o.customer_id, c.phone_number
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
```

#### File 2: Update `backend/services/notificationService.js`
Add new method `sendReadyAlert`:

```javascript
/**
 * Send ready alert notification
 * @param {string} orderId - Order ID
 * @param {Array} lots - Array of lot details
 * @param {number} daysUntilReady - Days until ready (can be negative if overdue)
 */
async sendReadyAlert(orderId, lots, daysUntilReady) {
  const orderQuery = `
    SELECT o.*, c.phone_number, c.name as customer_name, c.id as customer_id
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
```

#### File 3: Update `backend/server.js`
Add job initialization:

```javascript
// After all middleware and routes, before server start:

// Initialize scheduled jobs
const ReadyNotificationJob = require('./jobs/readyNotificationJob');
ReadyNotificationJob.initialize();
```

### WhatsApp Template Required

**Template Name:** `order_ready_alert`

**Template Content:**
```
Hello {{1}},

Your order #{{2}} is {{4}}!

Plants included:
{{3}}

We'll coordinate delivery soon. Track your order: {{5}}

Thank you for choosing our nursery! 🌱
```

**Variables:**
1. Customer name
2. Order number
3. Lots list (comma-separated)
4. Ready message ("ready for delivery" / "ready in X days")
5. Tracking URL

---

## Issue #76: Payment Reminders Scheduled Job

### Overview
Daily cron job to send payment reminders for overdue and upcoming payments, with escalation for severely overdue payments.

### Database Schema Changes

#### Migration 2: Add payment reminder tracking
**File:** `backend/migrations/1760800000002_add_payment_reminder_tracking.js`

```sql
-- Add reminder tracking to payment_installments
ALTER TABLE payment_installments
  ADD COLUMN last_reminder_sent_at TIMESTAMP,
  ADD COLUMN reminder_count INTEGER DEFAULT 0,
  ADD COLUMN escalated BOOLEAN DEFAULT FALSE,
  ADD COLUMN escalated_at TIMESTAMP;

-- Add index for efficient querying
CREATE INDEX idx_payment_installments_due_reminders
  ON payment_installments(due_date, status)
  WHERE status = 'pending';

-- Add manager email preferences table
CREATE TABLE manager_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  notification_type VARCHAR(50) NOT NULL, -- 'overdue_payments', 'low_stock', etc.
  enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  whatsapp_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, notification_type)
);

-- Seed with default preferences for Admin/Manager roles
INSERT INTO manager_notification_preferences (user_id, notification_type, enabled)
SELECT u.id, 'overdue_payments', TRUE
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE r.name IN ('Admin', 'Manager')
ON CONFLICT DO NOTHING;
```

### Backend Implementation

#### File 1: `backend/jobs/paymentReminderJob.js` (NEW)
```javascript
/**
 * Payment Reminder Job
 * Daily job to send payment reminders for overdue and upcoming payments
 * Issue #76: Create scheduled job for payment reminders
 */

const cron = require('node-cron');
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const EmailService = require('../services/emailService');

const notificationService = new NotificationService();
const emailService = new EmailService();

class PaymentReminderJob {
  /**
   * Initialize the cron job
   */
  static initialize() {
    // Run daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Running payment reminder job...');
      await this.processPaymentReminders();
    });

    console.log('✅ Payment reminder job scheduled (daily at 9:00 AM)');
  }

  /**
   * Process payment reminders
   */
  static async processPaymentReminders() {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Upcoming payments (due in 3 days)
      await this.sendUpcomingReminders(client);

      // 2. Overdue payments (1-29 days overdue)
      await this.sendOverdueReminders(client);

      // 3. Severely overdue (30+ days) - escalate to manager
      await this.escalateSeverelyOverdue(client);

      await client.query('COMMIT');

      console.log('✅ Payment reminder job completed');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error in payment reminder job:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Send reminders for upcoming payments (due in 3 days)
   */
  static async sendUpcomingReminders(client) {
    const query = `
      SELECT
        pi.id as installment_id,
        pi.amount,
        pi.due_date,
        pi.installment_number,
        p.id as payment_id,
        o.id as order_id,
        o.order_number,
        c.id as customer_id,
        c.name as customer_name,
        c.phone_number,
        c.email
      FROM payment_installments pi
      JOIN payments p ON pi.payment_id = p.id
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.status = 'pending'
        AND pi.due_date = CURRENT_DATE + INTERVAL '3 days'
        AND (pi.last_reminder_sent_at IS NULL
             OR pi.last_reminder_sent_at < CURRENT_DATE)
      ORDER BY c.id, o.id
      LIMIT 100
    `;

    const result = await client.query(query);

    let successCount = 0;

    for (const installment of result.rows) {
      try {
        // Send gentle upcoming reminder
        await notificationService.sendUpcomingPaymentReminder(
          installment.installment_id,
          {
            customerName: installment.customer_name,
            amount: installment.amount,
            dueDate: installment.due_date,
            orderNumber: installment.order_number,
            installmentNumber: installment.installment_number
          }
        );

        // Update reminder tracking
        await client.query(
          `UPDATE payment_installments
           SET last_reminder_sent_at = CURRENT_TIMESTAMP,
               reminder_count = reminder_count + 1
           WHERE id = $1`,
          [installment.installment_id]
        );

        // Log notification
        await this.logNotification(client, {
          type: 'payment_reminder_upcoming',
          entityType: 'payment_installment',
          entityId: installment.installment_id,
          recipientPhone: installment.phone_number,
          recipientId: installment.customer_id,
          status: 'sent'
        });

        successCount++;

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Failed reminder for installment ${installment.installment_id}:`, error.message);

        await this.logNotification(client, {
          type: 'payment_reminder_upcoming',
          entityType: 'payment_installment',
          entityId: installment.installment_id,
          recipientPhone: installment.phone_number,
          recipientId: installment.customer_id,
          status: 'failed',
          errorMessage: error.message
        });
      }
    }

    console.log(`   - Upcoming reminders sent: ${successCount}/${result.rows.length}`);
  }

  /**
   * Send reminders for overdue payments (1-29 days)
   */
  static async sendOverdueReminders(client) {
    const query = `
      SELECT
        pi.id as installment_id,
        pi.amount,
        pi.due_date,
        pi.installment_number,
        pi.reminder_count,
        EXTRACT(DAY FROM (CURRENT_DATE - pi.due_date))::INTEGER as days_overdue,
        p.id as payment_id,
        o.id as order_id,
        o.order_number,
        c.id as customer_id,
        c.name as customer_name,
        c.phone_number,
        c.email
      FROM payment_installments pi
      JOIN payments p ON pi.payment_id = p.id
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.status = 'pending'
        AND pi.due_date < CURRENT_DATE
        AND pi.due_date >= CURRENT_DATE - INTERVAL '29 days'
        AND (pi.last_reminder_sent_at IS NULL
             OR pi.last_reminder_sent_at < CURRENT_DATE - INTERVAL '3 days')
      ORDER BY pi.due_date ASC, c.id
      LIMIT 100
    `;

    const result = await client.query(query);

    let successCount = 0;

    for (const installment of result.rows) {
      try {
        // Send urgent overdue reminder
        await notificationService.sendOverduePaymentReminder(
          installment.installment_id,
          {
            customerName: installment.customer_name,
            amount: installment.amount,
            dueDate: installment.due_date,
            orderNumber: installment.order_number,
            daysOverdue: installment.days_overdue,
            installmentNumber: installment.installment_number
          }
        );

        // Update reminder tracking
        await client.query(
          `UPDATE payment_installments
           SET last_reminder_sent_at = CURRENT_TIMESTAMP,
               reminder_count = reminder_count + 1
           WHERE id = $1`,
          [installment.installment_id]
        );

        // Log notification
        await this.logNotification(client, {
          type: 'payment_reminder_overdue',
          entityType: 'payment_installment',
          entityId: installment.installment_id,
          recipientPhone: installment.phone_number,
          recipientId: installment.customer_id,
          status: 'sent'
        });

        successCount++;

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Failed overdue reminder for ${installment.installment_id}:`, error.message);

        await this.logNotification(client, {
          type: 'payment_reminder_overdue',
          entityType: 'payment_installment',
          entityId: installment.installment_id,
          recipientPhone: installment.phone_number,
          recipientId: installment.customer_id,
          status: 'failed',
          errorMessage: error.message
        });
      }
    }

    console.log(`   - Overdue reminders sent: ${successCount}/${result.rows.length}`);
  }

  /**
   * Escalate severely overdue payments (30+ days) to manager
   */
  static async escalateSeverelyOverdue(client) {
    const query = `
      SELECT
        pi.id as installment_id,
        pi.amount,
        pi.due_date,
        pi.installment_number,
        EXTRACT(DAY FROM (CURRENT_DATE - pi.due_date))::INTEGER as days_overdue,
        p.id as payment_id,
        p.total_amount,
        o.id as order_id,
        o.order_number,
        o.total_amount as order_total,
        c.id as customer_id,
        c.name as customer_name,
        c.phone_number,
        c.email
      FROM payment_installments pi
      JOIN payments p ON pi.payment_id = p.id
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.status = 'pending'
        AND pi.due_date < CURRENT_DATE - INTERVAL '30 days'
        AND pi.escalated = FALSE
      ORDER BY pi.due_date ASC
      LIMIT 50
    `;

    const result = await client.query(query);

    if (result.rows.length === 0) {
      console.log('   - No severely overdue payments to escalate');
      return;
    }

    // Get managers to notify
    const managersQuery = `
      SELECT DISTINCT u.email, u.name, u.id
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN manager_notification_preferences mnp
        ON u.id = mnp.user_id
        AND mnp.notification_type = 'overdue_payments'
      WHERE r.name IN ('Admin', 'Manager')
        AND u.email IS NOT NULL
        AND (mnp.enabled IS NULL OR mnp.enabled = TRUE)
        AND (mnp.email_enabled IS NULL OR mnp.email_enabled = TRUE)
    `;

    const managers = await client.query(managersQuery);

    if (managers.rows.length === 0) {
      console.log('   ⚠️ No managers found to escalate overdue payments');
      return;
    }

    // Send email to managers
    const overdueList = result.rows.map(p => ({
      customerName: p.customer_name,
      orderNumber: p.order_number,
      amount: p.amount,
      dueDate: p.due_date,
      daysOverdue: p.days_overdue,
      phone: p.phone_number
    }));

    for (const manager of managers.rows) {
      try {
        await emailService.sendOverduePaymentEscalation(
          manager.email,
          manager.name,
          overdueList
        );

        console.log(`   ✉️ Escalation email sent to ${manager.email}`);

      } catch (error) {
        console.error(`❌ Failed to send escalation to ${manager.email}:`, error.message);
      }
    }

    // Mark as escalated
    const installmentIds = result.rows.map(r => r.installment_id);
    await client.query(
      `UPDATE payment_installments
       SET escalated = TRUE, escalated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1)`,
      [installmentIds]
    );

    // Log escalation
    for (const installment of result.rows) {
      await this.logNotification(client, {
        type: 'payment_escalation',
        entityType: 'payment_installment',
        entityId: installment.installment_id,
        recipientPhone: null,
        recipientId: installment.customer_id,
        status: 'sent'
      });
    }

    console.log(`   - Escalated ${result.rows.length} severely overdue payments`);
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

module.exports = PaymentReminderJob;
```

#### File 2: Create `backend/services/emailService.js` (NEW)
```javascript
/**
 * Email Service
 * Handles email notifications
 * Issue #76: Payment reminder escalation
 * Issue #80: Low stock alerts
 */

class EmailService {
  /**
   * Send overdue payment escalation email to managers
   */
  async sendOverduePaymentEscalation(managerEmail, managerName, overduePayments) {
    // TODO: Implement with actual email provider (Sendgrid, AWS SES, etc.)
    // For now, just log
    console.log(`📧 [EMAIL] To: ${managerEmail}`);
    console.log(`Subject: Severely Overdue Payments Alert - ${overduePayments.length} Accounts`);
    console.log(`Body:
      Dear ${managerName},

      The following payments are severely overdue (30+ days):

      ${overduePayments.map((p, i) => `
      ${i + 1}. ${p.customerName} - Order #${p.orderNumber}
         Amount: ₹${p.amount}
         Due Date: ${new Date(p.dueDate).toLocaleDateString()}
         Days Overdue: ${p.daysOverdue}
         Contact: ${p.phone}
      `).join('\n')}

      Please take immediate action to follow up with these customers.

      Regards,
      Nursery Management System
    `);

    return { success: true, provider: 'mock' };
  }

  /**
   * Send low stock alert to inventory managers
   */
  async sendLowStockAlert(managerEmail, managerName, lowStockItems) {
    console.log(`📧 [EMAIL] To: ${managerEmail}`);
    console.log(`Subject: Low Stock Alert - ${lowStockItems.length} SKUs Below Minimum`);
    console.log(`Body:
      Dear ${managerName},

      The following SKUs are below minimum stock level:

      ${lowStockItems.map((item, i) => `
      ${i + 1}. ${item.productName} - ${item.variantName}
         Current Stock: ${item.currentStock}
         Minimum Level: ${item.minStockLevel}
         Suggested Reorder: ${item.reorderQuantity}
      `).join('\n')}

      Please arrange for restocking.

      Regards,
      Nursery Management System
    `);

    return { success: true, provider: 'mock' };
  }
}

module.exports = EmailService;
```

#### File 3: Update `backend/services/notificationService.js`
Add new methods:

```javascript
/**
 * Send upcoming payment reminder (due in 3 days)
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
 * Send overdue payment reminder
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
```

#### File 4: Update `backend/server.js`
```javascript
const PaymentReminderJob = require('./jobs/paymentReminderJob');
PaymentReminderJob.initialize();
```

### WhatsApp Templates Required

**Template 1:** `payment_reminder_upcoming`
```
Hello {{1}},

This is a friendly reminder that your payment of ₹{{2}} for Order #{{3}} is due on {{4}}.

Pay now: {{5}}

Thank you! 🙏
```

**Template 2:** `payment_reminder_overdue`
```
Dear {{1}},

Your payment of ₹{{2}} for Order #{{3}} is overdue by {{4}} days.

Please clear your dues at the earliest: {{5}}

For assistance, contact: {{6}}
```

---

## Issue #77: ETA Notification from GPS

### Overview
Real-time trigger to send ETA notifications when delivery vehicle is within 5km of customer location.

### Database Schema Changes

#### Migration 3: Add ETA notification tracking
**File:** `backend/migrations/1760800000003_add_eta_notification_tracking.js`

```sql
-- Add ETA notification tracking to route_stops
ALTER TABLE route_stops
  ADD COLUMN eta_notification_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN eta_notification_sent_at TIMESTAMP,
  ADD COLUMN last_distance_km DECIMAL(10, 2);

-- Add index for performance
CREATE INDEX idx_route_stops_eta_tracking
  ON route_stops(route_id, status, eta_notification_sent)
  WHERE status = 'pending';
```

### Backend Implementation

#### File 1: Update `backend/services/gpsTrackingService.js`

Add ETA check logic to existing GPS tracking service:

```javascript
// Add to existing gpsTrackingService.js

const { haversineDistance } = require('../utils/distanceUtils');
const NotificationService = require('./notificationService');
const pool = require('../config/database');

const notificationService = new NotificationService();

/**
 * Process GPS update and check for ETA alerts
 * Called whenever new GPS data is received
 */
async processGPSUpdate(routeId, latitude, longitude) {
  try {
    // Get next pending stop for this route
    const stopQuery = `
      SELECT
        rs.id as stop_id,
        rs.latitude as stop_lat,
        rs.longitude as stop_lng,
        rs.eta_notification_sent,
        rs.sequence_number,
        o.order_number,
        c.name as customer_name
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN delivery_routes dr ON rs.route_id = dr.id
      WHERE rs.route_id = $1
        AND rs.status = 'pending'
        AND dr.status = 'in_progress'
        AND rs.eta_notification_sent = FALSE
      ORDER BY rs.sequence_number ASC
      LIMIT 1
    `;

    const result = await pool.query(stopQuery, [routeId]);

    if (result.rows.length === 0) {
      return; // No pending stops
    }

    const stop = result.rows[0];

    // Calculate distance to stop
    const distance = haversineDistance(
      latitude,
      longitude,
      stop.stop_lat,
      stop.stop_lng
    );

    // Update last known distance
    await pool.query(
      `UPDATE route_stops
       SET last_distance_km = $1
       WHERE id = $2`,
      [distance, stop.stop_id]
    );

    // Trigger ETA notification if within 5km
    if (distance <= 5.0 && !stop.eta_notification_sent) {
      // Calculate ETA (assuming 30 km/h average speed in city)
      const etaMinutes = Math.round((distance / 30) * 60);

      console.log(`📍 Vehicle within 5km of stop ${stop.stop_id}. Sending ETA alert...`);

      // Send notification
      await notificationService.sendETAAlert(stop.stop_id, etaMinutes);

      // Mark as sent
      await pool.query(
        `UPDATE route_stops
         SET eta_notification_sent = TRUE,
             eta_notification_sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [stop.stop_id]
      );

      console.log(`✅ ETA alert sent for ${stop.customer_name} (${distance.toFixed(1)}km away)`);
    }

    // Reset notification flag if vehicle moves away (> 10km)
    if (distance > 10.0 && stop.eta_notification_sent) {
      await pool.query(
        `UPDATE route_stops
         SET eta_notification_sent = FALSE,
             eta_notification_sent_at = NULL
         WHERE id = $1`,
        [stop.stop_id]
      );

      console.log(`🔄 Reset ETA notification for stop ${stop.stop_id} (moved away)`);
    }

  } catch (error) {
    console.error('Error processing ETA check:', error);
  }
}

module.exports = {
  ...existingExports,
  processGPSUpdate
};
```

#### File 2: Update `backend/webhooks/gpsWebhook.js`

Integrate ETA checking into GPS webhook handlers:

```javascript
const gpsTrackingService = require('../services/gpsTrackingService');

// In handleTestWebhook and other webhook handlers:
async handleTestWebhook(req, res) {
  try {
    const { route_id, latitude, longitude, ...otherData } = req.body;

    // ... existing GPS data storage ...

    // Check for ETA alerts
    await gpsTrackingService.processGPSUpdate(route_id, latitude, longitude);

    res.json({ success: true });
  } catch (error) {
    console.error('GPS webhook error:', error);
    res.status(500).json({ error: 'Failed to process GPS update' });
  }
}
```

#### File 3: Create `backend/utils/distanceUtils.js` (if not exists)

```javascript
/**
 * Distance calculation utilities
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in km
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

module.exports = {
  haversineDistance
};
```

### Notes
- ETA alert sent only once per stop
- Alert resets if vehicle moves away (>10km), allowing re-triggering if needed
- Uses existing `sendETAAlert` method in NotificationService
- Integrates with existing GPS tracking infrastructure

---

## Issue #78: Weekly Growth Progress Photos

### Overview
Weekly cron job to send growth progress photos of allocated lots to customers.

### Database Schema Changes

#### Migration 4: Create lot photos table
**File:** `backend/migrations/1760800000004_create_lot_photos_table.js`

```sql
-- Create lot_photos table
CREATE TABLE lot_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  photo_url VARCHAR(500) NOT NULL,
  photo_type VARCHAR(50) DEFAULT 'progress', -- 'initial', 'progress', 'ready'
  growth_stage VARCHAR(50), -- 'seedling', 'vegetative', 'flowering', 'ready'
  notes TEXT,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lot_photos_lot_id ON lot_photos(lot_id);
CREATE INDEX idx_lot_photos_captured_at ON lot_photos(lot_id, captured_at DESC);

-- Add photo notification tracking to lots
ALTER TABLE lots
  ADD COLUMN last_photo_sent_at TIMESTAMP;

-- Add weekly photo notification tracking
CREATE TABLE weekly_photo_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  photo_id UUID REFERENCES lot_photos(id),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  week_number INTEGER, -- ISO week number
  year INTEGER,
  UNIQUE(lot_id, order_id, week_number, year)
);

CREATE INDEX idx_weekly_photo_notif_customer ON weekly_photo_notifications(customer_id);
```

### Backend Implementation

#### File 1: `backend/jobs/growthProgressJob.js` (NEW)

```javascript
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
          c.phone_number,
          oi.id as order_item_id,
          l.id as lot_id,
          l.lot_number,
          l.status as lot_status,
          l.expected_ready_date,
          p.name as product_name,
          s.variant_name,
          oi.quantity,
          lp.id as photo_id,
          lp.photo_url,
          lp.growth_stage,
          lp.captured_at,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE))::INTEGER as days_to_ready
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN lots l ON oi.allocated_lot_id = l.id
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
          AND l.status IN ('growing', 'ready')
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
```

#### File 2: Update `backend/services/notificationService.js`

Add new method:

```javascript
/**
 * Send growth progress update with photos
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
```

#### File 3: Update `backend/server.js`

```javascript
const GrowthProgressJob = require('./jobs/growthProgressJob');
GrowthProgressJob.initialize();
```

### Notes
- Photo upload functionality to be implemented separately (via mobile app or admin portal)
- WhatsApp media messages require separate implementation using WhatsApp Business API
- Placeholder implementation sends text-only updates
- Weekly notifications prevent spam (tracked by week number)

---

## Issue #79: Auto Order Status Updates from Delivery

### Overview
Automated order status transitions based on delivery route events.

### Database Schema Changes

No new migrations required - uses existing tables.

### Backend Implementation

#### File 1: `backend/events/deliveryEvents.js` (UPDATE)

Enhance existing event emitter with order status automation:

```javascript
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
   */
  async handleCODPayment(orderId, client) {
    // Check if payment already recorded
    const paymentCheck = `
      SELECT id FROM payments
      WHERE order_id = $1 AND status = 'completed'
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
   */
  async handleRouteCompleted(routeId) {
    console.log(`✅ Route ${routeId} completed`);
    // Additional cleanup or reporting logic can go here
  }
}

// Export singleton instance
const deliveryEvents = new DeliveryEvents();
module.exports = deliveryEvents;
```

#### File 2: Create `backend/services/orderService.js` (NEW)

```javascript
/**
 * Order Service
 * Business logic for order management
 * Issue #79: Auto order status updates
 */

const pool = require('../config/database');

class OrderService {
  /**
   * Update order status with history tracking
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
}

module.exports = OrderService;
```

#### File 3: Update `backend/controllers/driverController.js`

Emit events when driver updates delivery status:

```javascript
const deliveryEvents = require('../events/deliveryEvents');

// In startRoute function:
async startRoute(req, res) {
  try {
    const { routeId } = req.params;

    // ... existing start route logic ...

    // Emit route started event
    deliveryEvents.emit('route:started', { routeId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// In completeStop function:
async completeStop(req, res) {
  try {
    const { stopId } = req.params;

    // ... existing complete stop logic ...

    // Emit stop delivered event
    deliveryEvents.emit('stop:delivered', { stopId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// In completeRoute function:
async completeRoute(req, res) {
  try {
    const { routeId } = req.params;

    // ... existing complete route logic ...

    // Emit route completed event
    deliveryEvents.emit('route:completed', { routeId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### Notes
- Event-driven architecture decouples delivery actions from order status updates
- Automatic COD payment recording on delivery
- Inventory automatically updated when delivery confirmed
- Status history maintained for audit trail

---

## Issue #80: Low Stock Alert System

### Overview
Automated alerts when SKU stock falls below minimum threshold, triggered by lot allocation.

### Database Schema Changes

#### Migration 5: Add stock tracking fields
**File:** `backend/migrations/1760800000005_add_stock_alert_tracking.js`

```sql
-- Add stock level fields to SKUs
ALTER TABLE skus
  ADD COLUMN min_stock_level INTEGER DEFAULT 50,
  ADD COLUMN max_stock_level INTEGER DEFAULT 500,
  ADD COLUMN reorder_point INTEGER DEFAULT 100,
  ADD COLUMN last_stock_alert_sent_at TIMESTAMP;

-- Create notifications table for in-app notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  role_name VARCHAR(50), -- Send to all users with this role
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50), -- 'sku', 'order', 'payment', etc.
  entity_id UUID,
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_role ON notifications(role_name, created_at);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Create stock alert history
CREATE TABLE stock_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id),
  current_stock INTEGER NOT NULL,
  min_stock_level INTEGER NOT NULL,
  reorder_quantity INTEGER,
  alert_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX idx_stock_alert_history_sku ON stock_alert_history(sku_id);
CREATE INDEX idx_stock_alert_history_unresolved
  ON stock_alert_history(sku_id, alert_sent_at)
  WHERE resolved_at IS NULL;
```

### Backend Implementation

#### File 1: Create `backend/services/stockAlertService.js` (NEW)

```javascript
/**
 * Stock Alert Service
 * Monitors stock levels and sends alerts
 * Issue #80: Create low stock alert system
 */

const pool = require('../config/database');
const EmailService = require('./emailService');

const emailService = new EmailService();

class StockAlertService {
  /**
   * Check stock level and trigger alert if below threshold
   * Called after lot allocation
   */
  async checkStockLevel(skuId, client) {
    const dbClient = client || pool;

    try {
      // Calculate available stock for SKU
      const stockQuery = `
        SELECT
          s.id,
          s.sku_code,
          s.variant_name,
          s.min_stock_level,
          s.max_stock_level,
          s.reorder_point,
          s.last_stock_alert_sent_at,
          p.name as product_name,
          COALESCE(SUM(l.current_quantity), 0)::INTEGER as available_stock
        FROM skus s
        JOIN products p ON s.product_id = p.id
        LEFT JOIN lots l ON l.sku_id = s.id
          AND l.status IN ('ready', 'growing')
          AND l.current_quantity > 0
        WHERE s.id = $1
        GROUP BY s.id, s.sku_code, s.variant_name, s.min_stock_level,
                 s.max_stock_level, s.reorder_point, s.last_stock_alert_sent_at, p.name
      `;

      const result = await dbClient.query(stockQuery, [skuId]);

      if (result.rows.length === 0) {
        console.log(`⚠️ SKU ${skuId} not found`);
        return;
      }

      const sku = result.rows[0];

      // Check if below minimum level
      if (sku.available_stock < sku.min_stock_level) {
        // Check if alert already sent recently (within 7 days)
        if (sku.last_stock_alert_sent_at) {
          const daysSinceLastAlert = Math.floor(
            (Date.now() - new Date(sku.last_stock_alert_sent_at).getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceLastAlert < 7) {
            console.log(`ℹ️ Low stock alert for ${sku.sku_code} already sent ${daysSinceLastAlert} days ago`);
            return;
          }
        }

        // Trigger alert
        await this.sendLowStockAlert(sku, dbClient);

        // Update last alert timestamp
        await dbClient.query(
          `UPDATE skus
           SET last_stock_alert_sent_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [skuId]
        );

        console.log(`🚨 Low stock alert sent for ${sku.sku_code} (${sku.available_stock} < ${sku.min_stock_level})`);
      }

    } catch (error) {
      console.error('Error checking stock level:', error);
      throw error;
    }
  }

  /**
   * Send low stock alert to Inventory Managers
   */
  async sendLowStockAlert(sku, client) {
    const dbClient = client || pool;

    // Calculate reorder quantity
    const reorderQuantity = sku.max_stock_level - sku.available_stock;

    // Get Inventory Manager and Admin users
    const managersQuery = `
      SELECT DISTINCT u.id, u.email, u.name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name IN ('Admin', 'Manager')
        AND u.email IS NOT NULL
    `;

    const managers = await dbClient.query(managersQuery);

    // Create in-app notifications for Inventory Manager role
    await dbClient.query(
      `INSERT INTO notifications
       (role_name, notification_type, title, message, entity_type, entity_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'Manager',
        'low_stock',
        'Low Stock Alert',
        `${sku.product_name} - ${sku.variant_name} (${sku.sku_code}) is running low. Current: ${sku.available_stock}, Minimum: ${sku.min_stock_level}. Suggested reorder: ${reorderQuantity} units.`,
        'sku',
        sku.id,
        sku.available_stock < (sku.min_stock_level * 0.5) ? 'urgent' : 'high'
      ]
    );

    // Send email alerts
    const lowStockData = [{
      productName: sku.product_name,
      variantName: sku.variant_name,
      skuCode: sku.sku_code,
      currentStock: sku.available_stock,
      minStockLevel: sku.min_stock_level,
      reorderQuantity: reorderQuantity
    }];

    for (const manager of managers.rows) {
      try {
        await emailService.sendLowStockAlert(
          manager.email,
          manager.name,
          lowStockData
        );

        console.log(`📧 Low stock email sent to ${manager.email}`);

      } catch (error) {
        console.error(`Failed to send email to ${manager.email}:`, error.message);
      }
    }

    // Record in stock alert history
    await dbClient.query(
      `INSERT INTO stock_alert_history
       (sku_id, current_stock, min_stock_level, reorder_quantity)
       VALUES ($1, $2, $3, $4)`,
      [sku.id, sku.available_stock, sku.min_stock_level, reorderQuantity]
    );
  }

  /**
   * Mark stock alert as resolved
   */
  async resolveStockAlert(skuId, userId) {
    await pool.query(
      `UPDATE stock_alert_history
       SET resolved_at = CURRENT_TIMESTAMP,
           resolved_by = $2
       WHERE sku_id = $1
         AND resolved_at IS NULL`,
      [skuId, userId]
    );
  }

  /**
   * Get unresolved stock alerts
   */
  async getUnresolvedAlerts() {
    const query = `
      SELECT
        sah.*,
        s.sku_code,
        s.variant_name,
        p.name as product_name
      FROM stock_alert_history sah
      JOIN skus s ON sah.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE sah.resolved_at IS NULL
      ORDER BY sah.alert_sent_at DESC
    `;

    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = StockAlertService;
```

#### File 2: Update `backend/services/lotAllocationService.js`

Integrate stock alert checking:

```javascript
const StockAlertService = require('./stockAlertService');
const stockAlertService = new StockAlertService();

// In allocateLotToOrder function or similar:
async allocateLotToOrder(orderId, orderItemId, lotId, quantity, client) {
  const dbClient = client || pool;

  try {
    // ... existing allocation logic ...

    // Get SKU ID for the lot
    const lotQuery = `
      SELECT sku_id FROM lots WHERE id = $1
    `;
    const lotResult = await dbClient.query(lotQuery, [lotId]);

    if (lotResult.rows.length > 0) {
      const skuId = lotResult.rows[0].sku_id;

      // Check stock level after allocation
      await stockAlertService.checkStockLevel(skuId, dbClient);
    }

    // ... rest of allocation logic ...

  } catch (error) {
    console.error('Error in lot allocation:', error);
    throw error;
  }
}
```

#### File 3: Create `backend/routes/notifications.js` (NEW)

API endpoints for in-app notifications:

```javascript
/**
 * Notifications Routes
 * API endpoints for in-app notifications
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get notifications for current user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { unreadOnly = false, limit = 50 } = req.query;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    let query = `
      SELECT *
      FROM notifications
      WHERE (user_id = $1 OR role_name = ANY($2))
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    const params = [userId, userRoles];

    if (unreadOnly === 'true') {
      query += ` AND read = FALSE`;
    }

    query += ` ORDER BY created_at DESC LIMIT $3`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, userId]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    await pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE (user_id = $1 OR role_name = ANY($2))
         AND read = FALSE`,
      [userId, userRoles]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
```

#### File 4: Update `backend/server.js`

```javascript
const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);
```

### Notes
- Stock alerts sent only once per week to avoid spam
- Alert reset after stock replenished (manual or automatic)
- In-app notifications accessible via API
- Email alerts sent to Admins and Managers
- Priority level based on severity (urgent if < 50% of minimum)

---

## Testing Plan

### Unit Testing Checklist

**Issue #75 - Ready Notifications:**
- [ ] Cron job runs at scheduled time
- [ ] Correctly identifies lots reaching ready date
- [ ] Groups by customer/order properly
- [ ] Sends notifications successfully
- [ ] Marks lots as notified
- [ ] Logs notification history
- [ ] Retry logic works correctly

**Issue #76 - Payment Reminders:**
- [ ] Identifies upcoming payments (3 days)
- [ ] Identifies overdue payments
- [ ] Identifies severely overdue (30+ days)
- [ ] Sends appropriate message templates
- [ ] Updates reminder timestamps
- [ ] Escalation emails sent to managers
- [ ] Rate limiting works

**Issue #77 - ETA Alerts:**
- [ ] Distance calculation accurate (Haversine)
- [ ] Triggers at 5km threshold
- [ ] Sends notification only once per stop
- [ ] Resets if vehicle moves away
- [ ] ETA calculation reasonable
- [ ] Integrates with GPS updates

**Issue #78 - Growth Progress:**
- [ ] Runs weekly on Sunday
- [ ] Identifies orders with allocated lots
- [ ] Fetches latest photos correctly
- [ ] Skips orders without photos
- [ ] Sends appropriate messages
- [ ] Tracks weekly sends (no duplicates)

**Issue #79 - Auto Status Updates:**
- [ ] Route start updates orders to 'dispatched'
- [ ] Stop delivery checks completion
- [ ] Order marked 'delivered' when all stops done
- [ ] COD payment recorded automatically
- [ ] Inventory updated correctly
- [ ] Status history recorded
- [ ] Events emitted properly

**Issue #80 - Low Stock Alerts:**
- [ ] Stock calculation accurate
- [ ] Triggers at threshold
- [ ] Sends in-app notifications
- [ ] Sends email to managers
- [ ] Suggests correct reorder quantity
- [ ] Alert spam prevention (7 days)
- [ ] Alert history tracked

### Integration Testing

1. **End-to-End Flow:**
   - Create order → Allocate lot → Check stock alert
   - Start route → Orders dispatched
   - Complete delivery → Order delivered → Payment recorded → Inventory updated

2. **Notification Flow:**
   - Ready notification → ETA alert → Delivery confirmation

3. **Payment Flow:**
   - Upcoming reminder → Overdue reminder → Escalation

### Manual Testing

1. Test all cron jobs manually via API or CLI
2. Verify WhatsApp messages received
3. Check email notifications
4. Verify in-app notifications display correctly
5. Test with multiple orders, customers, SKUs

---

## Deployment Checklist

### Database Migrations
- [ ] Run migrations 1-5 in sequence
- [ ] Verify all tables created
- [ ] Verify indexes created
- [ ] Seed initial data (manager preferences, stock levels)

### Environment Variables
- [ ] Email service credentials (if using real provider)
- [ ] WhatsApp API credentials verified
- [ ] Cron job schedules configurable

### Server Configuration
- [ ] All job files included in deployment
- [ ] server.js updated with job initializations
- [ ] Services properly imported
- [ ] Routes registered

### Monitoring
- [ ] Log cron job executions
- [ ] Monitor notification send rates
- [ ] Track failed notifications
- [ ] Alert on job failures

---

## Dependencies Summary

### Already Installed
- ✅ node-cron (v3.0.3)
- ✅ pg (PostgreSQL client)
- ✅ express

### To Be Configured
- Email service (Sendgrid/AWS SES) - currently mocked
- WhatsApp templates (need approval from WhatsApp Business)

---

## Rollback Plan

If issues arise:

1. **Disable cron jobs:** Comment out job initialization in server.js
2. **Revert migrations:** Use `npm run migrate:down` (run 5 times)
3. **Manual intervention:** Handle notifications manually via existing endpoints
4. **Database cleanup:** Remove notification_logs, stock_alert_history entries

---

## Phase 16 Summary

**Total Issues:** 6 (#75-#80)

**Total Files to Create:**
- 5 new migrations
- 4 new job files
- 2 new service files (EmailService, OrderService)
- 1 new route file (notifications.js)

**Total Files to Update:**
- backend/services/notificationService.js (add 4 new methods)
- backend/services/gpsTrackingService.js (add ETA check)
- backend/services/lotAllocationService.js (add stock alert trigger)
- backend/events/deliveryEvents.js (enhance event handling)
- backend/controllers/driverController.js (emit events)
- backend/webhooks/gpsWebhook.js (integrate ETA check)
- backend/server.js (initialize jobs, add routes)

**Estimated Effort:**
- Database migrations: 2-3 hours
- Backend jobs: 8-10 hours
- Service updates: 4-5 hours
- Testing: 6-8 hours
- **Total: 20-26 hours**

---

## Next Steps After Phase 16

Phase 17 will focus on:
- AWS S3 integration for file storage
- Google Maps API for route optimization
- SMS gateway integration
- Payment gateway enhancements
- Advanced analytics and dashboards
