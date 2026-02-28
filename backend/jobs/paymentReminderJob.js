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
        c.phone as phone_number,
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
        (CURRENT_DATE - pi.due_date) as days_overdue,
        p.id as payment_id,
        o.id as order_id,
        o.order_number,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as phone_number,
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
        (CURRENT_DATE - pi.due_date) as days_overdue,
        o.id as order_id,
        o.order_number,
        o.total_amount as order_total,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as phone_number,
        c.email
      FROM payment_installments pi
      JOIN orders o ON pi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.status IN ('pending', 'overdue')
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
      SELECT DISTINCT u.email, u.full_name as name, u.id
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
