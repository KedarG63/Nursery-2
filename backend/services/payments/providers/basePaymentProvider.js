/**
 * Base Payment Provider Interface
 * All payment providers must implement these methods
 */

class BasePaymentProvider {
  constructor(config) {
    this.config = config;
    this.providerName = 'base';
  }

  /**
   * Create a payment order
   * @param {Object} orderData - {orderId, amount, currency, customerId}
   * @returns {Promise<Object>} {gatewayOrderId, status, metadata}
   */
  async createPaymentOrder(orderData) {
    throw new Error('createPaymentOrder() must be implemented');
  }

  /**
   * Verify payment after completion
   * @param {Object} paymentData - Gateway-specific payment data
   * @returns {Promise<Object>} {success, transactionId, metadata}
   */
  async verifyPayment(paymentData) {
    throw new Error('verifyPayment() must be implemented');
  }

  /**
   * Process refund
   * @param {Object} refundData - {paymentId, amount, reason}
   * @returns {Promise<Object>} {success, refundId, metadata}
   */
  async processRefund(refundData) {
    throw new Error('processRefund() must be implemented');
  }

  /**
   * Verify webhook signature
   * @param {Object} webhookData - Raw webhook payload
   * @param {String} signature - Webhook signature
   * @returns {Boolean} Valid or not
   */
  verifyWebhookSignature(webhookData, signature) {
    throw new Error('verifyWebhookSignature() must be implemented');
  }

  /**
   * Get payment status
   * @param {String} gatewayTransactionId
   * @returns {Promise<Object>} Payment status details
   */
  async getPaymentStatus(gatewayTransactionId) {
    throw new Error('getPaymentStatus() must be implemented');
  }
}

module.exports = BasePaymentProvider;
