/**
 * Payment Webhook Handler
 * Handles webhook events from payment gateways
 */

const pool = require('../config/database');
const PaymentGateway = require('../services/payments');

/**
 * Handle payment webhook
 * POST /webhooks/payment
 */
const handlePaymentWebhook = async (req, res) => {
  try {
    const webhookBody = req.body;
    const signature =
      req.headers['x-razorpay-signature'] ||
      req.headers['x-webhook-signature'];

    // Get payment provider
    const paymentProvider = PaymentGateway.getPaymentProvider();

    // Verify webhook signature
    const isValid = paymentProvider.verifyWebhookSignature(
      webhookBody,
      signature
    );

    if (!isValid) {
      console.error('[WEBHOOK] Invalid signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    console.log('[WEBHOOK] Received event:', webhookBody.event);

    // Process webhook event
    await processWebhookEvent(webhookBody);

    res.json({
      success: true,
      message: 'Webhook processed',
    });
  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message,
    });
  }
};

/**
 * Process webhook event based on type
 */
const processWebhookEvent = async (webhookData) => {
  const { event, payload } = webhookData;

  switch (event) {
    case 'payment.authorized':
    case 'payment.captured':
      await handlePaymentSuccess(payload.payment.entity);
      break;

    case 'payment.failed':
      await handlePaymentFailed(payload.payment.entity);
      break;

    case 'refund.processed':
      await handleRefundProcessed(payload.refund.entity);
      break;

    default:
      console.log('[WEBHOOK] Unhandled event:', event);
  }
};

/**
 * Handle successful payment
 */
const handlePaymentSuccess = async (paymentEntity) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find payment by gateway transaction ID
    const result = await client.query(
      `UPDATE payments
       SET status = 'success',
           payment_date = NOW(),
           gateway_response = $1,
           updated_at = NOW()
       WHERE gateway_transaction_id = $2
       RETURNING *`,
      [JSON.stringify(paymentEntity), paymentEntity.id]
    );

    if (result.rows.length > 0) {
      console.log('[WEBHOOK] Payment marked as success:', paymentEntity.id);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[WEBHOOK] Error handling payment success:', error);
  } finally {
    client.release();
  }
};

/**
 * Handle failed payment
 */
const handlePaymentFailed = async (paymentEntity) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments
       SET status = 'failed',
           gateway_error_code = $1,
           gateway_error_message = $2,
           gateway_response = $3,
           updated_at = NOW()
       WHERE gateway_transaction_id = $4`,
      [
        paymentEntity.error_code,
        paymentEntity.error_description,
        JSON.stringify(paymentEntity),
        paymentEntity.id,
      ]
    );

    console.log('[WEBHOOK] Payment marked as failed:', paymentEntity.id);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[WEBHOOK] Error handling payment failure:', error);
  } finally {
    client.release();
  }
};

/**
 * Handle refund processed
 */
const handleRefundProcessed = async (refundEntity) => {
  console.log('[WEBHOOK] Refund processed:', refundEntity.id);
  // Additional refund processing logic if needed
};

module.exports = {
  handlePaymentWebhook,
};
