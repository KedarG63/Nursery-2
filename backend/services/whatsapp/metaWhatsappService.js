/**
 * Meta WhatsApp Business API Service
 * Implements the same interface as MockWhatsAppService
 * Uses Meta Graph API v21.0
 */

const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com';

class MetaWhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion    = process.env.WHATSAPP_API_VERSION || 'v21.0';
    this.apiUrl        = `${BASE_URL}/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Send a free-form text message
   * Only works within the 24-hour customer reply window
   */
  async sendMessage(phoneNumber, message) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(phoneNumber),
      type: 'text',
      text: { body: message }
    };

    return await this._post(payload);
  }

  /**
   * Send a pre-approved template message
   * templateName must exactly match the name approved in Meta Business Manager
   */
  async sendTemplateMessage(phoneNumber, templateName, variables) {
    const components = variables && variables.length > 0
      ? [{
          type: 'body',
          parameters: variables.map(v => ({ type: 'text', text: String(v) }))
        }]
      : [];

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(phoneNumber),
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components
      }
    };

    return await this._post(payload);
  }

  /**
   * POST request to Meta Graph API
   * Throws on HTTP errors so whatsappService.js can catch and log them
   */
  async _post(payload) {
    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = response.data;
      // Meta response shape:
      // { messaging_product, contacts: [{input, wa_id}], messages: [{id, message_status}] }
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
        provider: 'meta',
        status: data.messages?.[0]?.message_status || 'accepted',
        raw: data
      };

    } catch (error) {
      // Unwrap Meta API error details for better logging
      const metaError = error.response?.data?.error;
      if (metaError) {
        const err = new Error(`Meta API Error ${metaError.code}: ${metaError.message}`);
        err.metaCode    = metaError.code;
        err.metaSubcode = metaError.error_subcode;
        err.metaData    = metaError.error_data;
        throw err;
      }
      throw error;
    }
  }

  /**
   * Normalize phone number to E.164 format (digits only, no +)
   * Meta accepts numbers without the leading +
   * Examples:
   *   "9876543210"    → "919876543210"
   *   "+919876543210" → "919876543210"
   *   "919876543210"  → "919876543210"
   */
  normalizePhone(phone) {
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
      digits = '91' + digits; // Prepend India country code
    }
    return digits;
  }
}

module.exports = MetaWhatsAppService;
