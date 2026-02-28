/**
 * Mock WhatsApp Service
 * Simulates WhatsApp API without external dependencies
 * Issue #42: Implement Notification Service
 */

const pool = require('../../config/database');
const whatsappConfig = require('../../config/whatsapp');

class MockWhatsAppService {
  constructor() {
    this.config = whatsappConfig.mock;
    this.sentMessages = new Map(); // In-memory storage
  }

  /**
   * Send WhatsApp message (mock)
   */
  async sendMessage(phoneNumber, message, templateName = null) {
    // Simulate delay
    await this.simulateDelay();

    // Simulate random failures (if configured)
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock WhatsApp: Simulated failure');
    }

    // Generate mock message ID
    const messageId = this.generateMessageId();

    // Log to console
    if (this.config.logToConsole) {
      console.log('\n📱 MOCK WHATSAPP MESSAGE');
      console.log('To:', phoneNumber);
      console.log('Template:', templateName || 'N/A');
      console.log('Message:', message);
      console.log('Message ID:', messageId);
      console.log('---\n');
    }

    // Store message
    this.sentMessages.set(messageId, {
      phoneNumber,
      message,
      templateName,
      sentAt: new Date(),
      status: 'sent'
    });

    // Simulate delivery status updates after delay
    setTimeout(() => {
      this.simulateStatusUpdate(messageId, 'delivered');
    }, 2000);

    setTimeout(() => {
      this.simulateStatusUpdate(messageId, 'read');
    }, 5000);

    return {
      success: true,
      messageId,
      provider: 'mock',
      status: 'sent'
    };
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(phoneNumber, templateName, variables) {
    const template = await this.getTemplate(templateName);

    let message;
    if (!template) {
      // Fallback for missing templates in mock mode
      console.log(`⚠️  Template not found in database: ${templateName}, using fallback`);
      message = `[MOCK] ${templateName}: ${variables.join(', ')}`;
    } else {
      // Replace variables in template
      message = this.replaceVariables(template.content, variables);
    }

    return await this.sendMessage(phoneNumber, message, templateName);
  }

  /**
   * Get template from database
   */
  async getTemplate(templateName) {
    const query = `
      SELECT * FROM whatsapp_templates
      WHERE template_name = $1 AND is_active = TRUE
      LIMIT 1
    `;

    const result = await pool.query(query, [templateName]);
    return result.rows[0] || null;
  }

  /**
   * Replace variables in template
   */
  replaceVariables(content, variables) {
    let message = content;

    if (Array.isArray(variables)) {
      variables.forEach((value, index) => {
        const placeholder = new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g');
        message = message.replace(placeholder, value);
      });
    }

    return message;
  }

  /**
   * Simulate status update
   */
  simulateStatusUpdate(messageId, status) {
    const message = this.sentMessages.get(messageId);
    if (message) {
      message.status = status;

      if (this.config.logToConsole) {
        console.log(`📱 MOCK WHATSAPP: Message ${messageId} status: ${status}`);
      }

      // Trigger webhook simulation
      this.triggerWebhookSimulation(messageId, status);
    }
  }

  /**
   * Trigger webhook simulation (for testing)
   */
  async triggerWebhookSimulation(messageId, status) {
    const statusField = {
      'sent': 'sent_at',
      'delivered': 'delivered_at',
      'read': 'read_at',
      'failed': 'failed_at'
    }[status];

    if (!statusField) return;

    const query = `
      UPDATE whatsapp_messages
      SET status = $1,
          ${statusField} = NOW()
      WHERE message_id = $2
    `;

    try {
      await pool.query(query, [status, messageId]);
    } catch (error) {
      console.error('Error updating message status:', error.message);
    }
  }

  /**
   * Simulate delay
   */
  async simulateDelay() {
    if (this.config.simulateDelay > 0) {
      await new Promise(resolve =>
        setTimeout(resolve, this.config.simulateDelay)
      );
    }
  }

  /**
   * Should simulate failure
   */
  shouldSimulateFailure() {
    return Math.random() < this.config.simulateFailureRate;
  }

  /**
   * Generate mock message ID
   */
  generateMessageId() {
    return `mock_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get sent messages (for testing)
   */
  getSentMessages() {
    return Array.from(this.sentMessages.values());
  }

  /**
   * Clear sent messages
   */
  clearSentMessages() {
    this.sentMessages.clear();
  }
}

module.exports = MockWhatsAppService;
