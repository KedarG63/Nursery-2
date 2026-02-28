/**
 * Email Service
 * Handles email notifications
 * Issue #76: Payment reminder escalation
 * Issue #80: Low stock alerts
 */

class EmailService {
  /**
   * Send overdue payment escalation email to managers
   * @param {string} managerEmail - Manager's email address
   * @param {string} managerName - Manager's name
   * @param {Array} overduePayments - Array of overdue payment objects
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
   * @param {string} managerEmail - Manager's email address
   * @param {string} managerName - Manager's name
   * @param {Array} lowStockItems - Array of low stock SKU objects
   */
  async sendLowStockAlert(managerEmail, managerName, lowStockItems) {
    console.log(`📧 [EMAIL] To: ${managerEmail}`);
    console.log(`Subject: Low Stock Alert - ${lowStockItems.length} SKUs Below Minimum`);
    console.log(`Body:
Dear ${managerName},

The following SKUs are below minimum stock level:

${lowStockItems.map((item, i) => `
${i + 1}. ${item.productName} - ${item.variantName}
   SKU Code: ${item.skuCode || 'N/A'}
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

  /**
   * Send general notification email
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   */
  async sendEmail(to, subject, body) {
    console.log(`📧 [EMAIL] To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);

    return { success: true, provider: 'mock' };
  }
}

module.exports = EmailService;
