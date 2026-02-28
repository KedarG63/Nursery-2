/**
 * Payment Gateway Factory
 * Selects payment provider based on environment configuration
 */

const MockPaymentProvider = require('./providers/mockPaymentProvider');
const RazorpayProvider = require('./providers/razorpayProvider');

class PaymentGatewayFactory {
  static getProvider() {
    const provider = process.env.PAYMENT_PROVIDER || 'mock';

    console.log(`[PAYMENT FACTORY] Using provider: ${provider}`);

    switch (provider.toLowerCase()) {
      case 'mock':
        return new MockPaymentProvider({
          // Mock doesn't need real config
        });

      case 'razorpay':
        return new RazorpayProvider({
          keyId: process.env.RAZORPAY_KEY_ID,
          keySecret: process.env.RAZORPAY_KEY_SECRET,
          webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
        });

      default:
        console.warn(
          `[PAYMENT FACTORY] Unknown provider: ${provider}, falling back to mock`
        );
        return new MockPaymentProvider({});
    }
  }

  /**
   * Get provider name (useful for logging)
   */
  static getProviderName() {
    return process.env.PAYMENT_PROVIDER || 'mock';
  }
}

module.exports = PaymentGatewayFactory;
