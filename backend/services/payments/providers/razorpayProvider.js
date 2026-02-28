/**
 * Razorpay Payment Provider
 * Real integration with Razorpay payment gateway
 */

const BasePaymentProvider = require('./basePaymentProvider');
const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayProvider extends BasePaymentProvider {
  constructor(config) {
    super(config);
    this.providerName = 'razorpay';

    // Initialize Razorpay instance
    this.razorpay = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });

    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create Razorpay order
   */
  async createPaymentOrder(orderData) {
    const { orderId, amount, currency = 'INR', customerId } = orderData;

    try {
      const razorpayOrder = await this.razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency,
        receipt: orderId,
        notes: {
          order_id: orderId,
          customer_id: customerId,
        },
      });

      console.log('[RAZORPAY] Order created:', razorpayOrder.id);

      return {
        success: true,
        gatewayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount / 100,
        currency: razorpayOrder.currency,
        status: razorpayOrder.status,
        metadata: {
          provider: 'razorpay',
          receipt: razorpayOrder.receipt,
          created_at: new Date(razorpayOrder.created_at * 1000).toISOString(),
        },
      };
    } catch (error) {
      console.error('[RAZORPAY] Order creation failed:', error);
      throw new Error(`Razorpay order creation failed: ${error.message}`);
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  async verifyPayment(paymentData) {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = paymentData;

    try {
      // Verify signature
      const isValid = this.verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValid) {
        return {
          success: false,
          status: 'failed',
          errorCode: 'SIGNATURE_VERIFICATION_FAILED',
          errorMessage: 'Payment signature verification failed',
        };
      }

      // Fetch payment details from Razorpay
      const payment = await this.razorpay.payments.fetch(razorpay_payment_id);

      console.log('[RAZORPAY] Payment verified:', payment.id);

      return {
        success: true,
        status: payment.status === 'captured' ? 'success' : payment.status,
        transactionId: payment.id,
        gatewayTransactionId: payment.id,
        amount: payment.amount / 100,
        metadata: {
          provider: 'razorpay',
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          captured: payment.captured,
          created_at: new Date(payment.created_at * 1000).toISOString(),
        },
      };
    } catch (error) {
      console.error('[RAZORPAY] Payment verification failed:', error);
      return {
        success: false,
        status: 'failed',
        errorCode: error.error?.code || 'VERIFICATION_ERROR',
        errorMessage: error.error?.description || error.message,
      };
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(orderId, paymentId, signature) {
    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', this.razorpay.key_secret)
      .update(text)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Process Razorpay refund
   */
  async processRefund(refundData) {
    const { paymentId, amount, reason } = refundData;

    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: Math.round(amount * 100), // Convert to paise
        notes: {
          reason,
        },
      });

      console.log('[RAZORPAY] Refund processed:', refund.id);

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        metadata: {
          provider: 'razorpay',
          payment_id: refund.payment_id,
          created_at: new Date(refund.created_at * 1000).toISOString(),
        },
      };
    } catch (error) {
      console.error('[RAZORPAY] Refund failed:', error);
      throw new Error(`Razorpay refund failed: ${error.message}`);
    }
  }

  /**
   * Verify Razorpay webhook signature
   */
  verifyWebhookSignature(webhookBody, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(webhookBody))
      .digest('hex');

    return expectedSignature === signature;
  }

  /**
   * Get Razorpay payment status
   */
  async getPaymentStatus(gatewayTransactionId) {
    try {
      const payment = await this.razorpay.payments.fetch(gatewayTransactionId);

      return {
        success: true,
        transactionId: payment.id,
        status: payment.status,
        amount: payment.amount / 100,
        metadata: {
          provider: 'razorpay',
          method: payment.method,
          captured: payment.captured,
        },
      };
    } catch (error) {
      console.error('[RAZORPAY] Failed to fetch payment:', error);
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }
  }
}

module.exports = RazorpayProvider;
