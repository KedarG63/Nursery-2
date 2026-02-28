/**
 * WhatsApp Configuration
 * Supports multiple providers: mock, twilio, gupshup
 */

module.exports = {
  // Provider configuration (mock, twilio, gupshup, messagebird)
  provider: process.env.WHATSAPP_PROVIDER || 'mock',

  // Mock provider settings
  mock: {
    enabled: process.env.MOCK_WHATSAPP_ENABLED !== 'false',
    simulateDelay: parseInt(process.env.MOCK_WHATSAPP_DELAY || '1000'), // 1 second
    simulateFailureRate: parseFloat(process.env.MOCK_FAILURE_RATE || '0'), // 0% failures
    logToConsole: true,
    logToFile: false
  },

  // Twilio configuration (for future production use)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '',
    enabled: false
  },

  // Meta (WhatsApp Business API) configuration
  meta: {
    phoneNumberId:      process.env.WHATSAPP_PHONE_NUMBER_ID   || '',
    accessToken:        process.env.WHATSAPP_ACCESS_TOKEN       || '',
    apiVersion:         process.env.WHATSAPP_API_VERSION        || 'v21.0',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
    enabled:            !!process.env.WHATSAPP_PHONE_NUMBER_ID
  },

  // Gupshup configuration (for future production use)
  gupshup: {
    apiKey: process.env.GUPSHUP_API_KEY || '',
    appName: process.env.GUPSHUP_APP_NAME || '',
    sourceNumber: process.env.GUPSHUP_SOURCE_NUMBER || '',
    enabled: false
  },

  // General settings
  settings: {
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    rateLimitPerHour: 100, // Messages per customer per hour
    optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL'],
    businessName: 'Nursery Management',
    supportNumber: '+919876543210'
  },

  // Rate limiting
  rateLimit: {
    maxMessagesPerDay: 1000,
    maxMessagesPerCustomer: 10,
    windowMinutes: 60
  }
};
