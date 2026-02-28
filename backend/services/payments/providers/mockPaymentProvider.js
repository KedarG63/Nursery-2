/**
 * Mock Payment Provider for Development/Testing
 * Simulates payment gateway without real API calls
 */

const BasePaymentProvider = require('./basePaymentProvider');
const crypto = require('crypto');

class MockPaymentProvider extends BasePaymentProvider {
  constructor(config) {
    super(config);
    this.providerName = 'mock';
  }

  /**
   * Create a mock payment order
   * Instantly returns a fake order ID
   */
  async createPaymentOrder(orderData) {
    const { orderId, amount, currency = 'INR' } = orderData;

    // Generate fake gateway order ID
    const gatewayOrderId = `mock_order_${crypto.randomBytes(8).toString('hex')}`;

    console.log('[MOCK PAYMENT] Order created:', {
      orderId,
      gatewayOrderId,
      amount,
      currency,
    });

    return {
      success: true,
      gatewayOrderId,
      amount,
      currency,
      status: 'created',
      metadata: {
        provider: 'mock',
        created_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Verify mock payment
   * Simulates success/failure based on amount (for testing)
   */
  async verifyPayment(paymentData) {
    const { gatewayOrderId, gatewayPaymentId, amount } = paymentData;

    // Simulate payment failure for amounts ending in 13 (for testing)
    const shouldFail = amount % 100 === 13;

    if (shouldFail) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'MOCK_PAYMENT_FAILED',
        errorMessage: 'Mock payment failed (amount ends in 13)',
        metadata: {
          provider: 'mock',
          verified_at: new Date().toISOString(),
        },
      };
    }

    // Generate fake transaction ID
    const transactionId =
      gatewayPaymentId || `mock_pay_${crypto.randomBytes(8).toString('hex')}`;

    console.log('[MOCK PAYMENT] Payment verified:', {
      gatewayOrderId,
      transactionId,
      amount,
      status: 'success',
    });

    return {
      success: true,
      status: 'success',
      transactionId,
      gatewayTransactionId: transactionId,
      amount,
      metadata: {
        provider: 'mock',
        verified_at: new Date().toISOString(),
        method: 'mock_upi',
      },
    };
  }

  /**
   * Process mock refund
   */
  async processRefund(refundData) {
    const { paymentId, amount, reason } = refundData;

    const refundId = `mock_rfnd_${crypto.randomBytes(8).toString('hex')}`;

    console.log('[MOCK PAYMENT] Refund processed:', {
      paymentId,
      refundId,
      amount,
      reason,
    });

    return {
      success: true,
      refundId,
      amount,
      status: 'refunded',
      metadata: {
        provider: 'mock',
        refunded_at: new Date().toISOString(),
        reason,
      },
    };
  }

  /**
   * Mock webhook signature verification
   * Always returns true in mock mode
   */
  verifyWebhookSignature(webhookData, signature) {
    console.log('[MOCK PAYMENT] Webhook signature verified (mock)');
    return true;
  }

  /**
   * Get mock payment status
   */
  async getPaymentStatus(gatewayTransactionId) {
    console.log('[MOCK PAYMENT] Fetching payment status:', gatewayTransactionId);

    return {
      success: true,
      transactionId: gatewayTransactionId,
      status: 'success',
      amount: 1000.0,
      metadata: {
        provider: 'mock',
        method: 'mock_upi',
      },
    };
  }
}

module.exports = MockPaymentProvider;
