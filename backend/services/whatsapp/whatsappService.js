/**
 * WhatsApp Service (Provider Abstraction)
 * Supports mock, Twilio, Gupshup providers
 * Issue #42: Implement Notification Service
 */

const pool = require('../../config/database');
const whatsappConfig = require('../../config/whatsapp');
const MockWhatsAppService = require('./mockWhatsappService');
const MetaWhatsAppService = require('./metaWhatsappService');

class WhatsAppService {
  constructor() {
    this.provider = this.initializeProvider();
  }

  /**
   * Initialize provider based on configuration
   */
  initializeProvider() {
    const providerType = whatsappConfig.provider;

    switch (providerType) {
      case 'mock':
        return new MockWhatsAppService();

      case 'twilio':
        // For future: return new TwilioWhatsAppService();
        console.warn('Twilio not implemented, falling back to mock');
        return new MockWhatsAppService();

      case 'meta':
        return new MetaWhatsAppService();

      case 'gupshup':
        // For future: return new GupshupWhatsAppService();
        console.warn('Gupshup not implemented, falling back to mock');
        return new MockWhatsAppService();

      default:
        return new MockWhatsAppService();
    }
  }

  /**
   * Send message and log to database
   */
  async sendMessage(phoneNumber, message, options = {}) {
    const {
      templateName = null,
      variables = null,
      customerId = null,
      orderId = null,
      routeId = null,
      paymentId = null,
      category = null
    } = options;

    try {
      // Check opt-out status
      if (await this.isOptedOut(phoneNumber, category)) {
        console.log(`Customer ${phoneNumber} has opted out`);
        return {
          success: false,
          reason: 'opted_out'
        };
      }

      // Send via provider
      let result;
      if (templateName && variables) {
        result = await this.provider.sendTemplateMessage(
          phoneNumber,
          templateName,
          variables
        );
      } else {
        result = await this.provider.sendMessage(phoneNumber, message);
      }

      // Log to database
      await this.logMessage({
        messageId: result.messageId,
        recipientNumber: phoneNumber,
        customerId,
        templateName,
        content: message || '',
        variables,
        status: 'sent',
        sentAt: new Date(),
        orderId,
        routeId,
        paymentId,
        provider: result.provider,
        providerResponse: result
      });

      return result;

    } catch (error) {
      console.error('Error sending WhatsApp message:', error);

      // Log failed message
      await this.logMessage({
        messageId: null,
        recipientNumber: phoneNumber,
        customerId,
        templateName,
        content: message || '',
        variables,
        status: 'failed',
        errorMessage: error.message,
        orderId,
        routeId,
        paymentId
      });

      throw error;
    }
  }

  /**
   * Log message to database
   */
  async logMessage(messageData) {
    const query = `
      INSERT INTO whatsapp_messages (
        message_id, recipient_number, customer_id,
        template_name, content, variables,
        status, sent_at, failed_at,
        error_message, order_id, route_id, payment_id,
        provider, provider_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      messageData.messageId,
      messageData.recipientNumber,
      messageData.customerId,
      messageData.templateName,
      messageData.content,
      messageData.variables ? JSON.stringify(messageData.variables) : null,
      messageData.status,
      messageData.sentAt || null,
      messageData.status === 'failed' ? new Date() : null,
      messageData.errorMessage || null,
      messageData.orderId || null,
      messageData.routeId || null,
      messageData.paymentId || null,
      messageData.provider || 'mock',
      messageData.providerResponse ? JSON.stringify(messageData.providerResponse) : null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Check if customer has opted out
   */
  async isOptedOut(phoneNumber, category = null) {
    // If category specified, check if it's a valid column
    const validCategories = ['marketing', 'order', 'delivery', 'payment'];

    let query = `
      SELECT * FROM whatsapp_opt_outs
      WHERE phone_number = $1
        AND opted_out_all = TRUE
      LIMIT 1
    `;

    // If category specified and valid, also check category-specific opt-out
    if (category && validCategories.includes(category)) {
      query = `
        SELECT * FROM whatsapp_opt_outs
        WHERE phone_number = $1
          AND (opted_out_all = TRUE OR opted_out_${category} = TRUE)
        LIMIT 1
      `;
    }

    try {
      const result = await pool.query(query, [phoneNumber]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking opt-out status:', error.message);
      return false; // Default to not opted out if error
    }
  }

  /**
   * Handle opt-out request
   */
  async handleOptOut(phoneNumber, customerId, category = 'all', reason = null) {
    const query = `
      INSERT INTO whatsapp_opt_outs (
        customer_id, phone_number,
        opted_out_all, opted_out_reason
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (customer_id, phone_number)
      DO UPDATE SET
        opted_out_all = CASE WHEN $5 = 'all' THEN TRUE ELSE whatsapp_opt_outs.opted_out_all END,
        opted_out_marketing = CASE WHEN $5 = 'marketing' THEN TRUE ELSE whatsapp_opt_outs.opted_out_marketing END,
        opted_out_order = CASE WHEN $5 = 'order' THEN TRUE ELSE whatsapp_opt_outs.opted_out_order END,
        opted_out_delivery = CASE WHEN $5 = 'delivery' THEN TRUE ELSE whatsapp_opt_outs.opted_out_delivery END,
        opted_out_payment = CASE WHEN $5 = 'payment' THEN TRUE ELSE whatsapp_opt_outs.opted_out_payment END,
        opted_out_reason = $4,
        opted_out_at = NOW(),
        updated_at = NOW()
    `;

    const values = [customerId, phoneNumber, category === 'all', reason, category];
    await pool.query(query, values);
  }
}

module.exports = WhatsAppService;
