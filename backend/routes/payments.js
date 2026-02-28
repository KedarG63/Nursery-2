/**
 * Payment Routes
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const {
  validateInitiatePayment,
  validateRecordPayment,
  validateRefund,
} = require('../validators/paymentValidator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/payments
 * Get all payments with filters and pagination
 * Access: All authenticated users
 */
router.get('/', paymentController.getAllPayments);

/**
 * POST /api/payments/initiate
 * Initiate online payment
 * Access: All authenticated users
 */
router.post(
  '/initiate',
  validateInitiatePayment,
  paymentController.initiatePayment
);

/**
 * POST /api/payments/verify
 * Verify payment callback from gateway
 * Access: All authenticated users
 */
router.post('/verify', paymentController.verifyPayment);

/**
 * POST /api/payments/record
 * Record offline payment (cash, bank transfer)
 * Access: Admin, Manager, Sales
 */
router.post(
  '/record',
  authorize(['Admin', 'Manager', 'Sales']),
  validateRecordPayment,
  paymentController.recordOfflinePayment
);

/**
 * GET /api/payments/order/:orderId
 * Get all payments for an order
 * Access: All authenticated users
 */
router.get('/order/:orderId', paymentController.getOrderPayments);

/**
 * GET /api/payments/customer/:customerId
 * Get customer payment history
 * Access: All authenticated users
 */
router.get('/customer/:customerId', paymentController.getCustomerPayments);

/**
 * POST /api/payments/refund
 * Process refund
 * Access: Admin, Manager
 */
router.post(
  '/refund',
  authorize(['Admin', 'Manager']),
  validateRefund,
  paymentController.processRefund
);

/**
 * GET /api/payments/summary
 * Get payment summary for dashboard
 * Access: All authenticated users
 */
router.get('/summary', paymentController.getPaymentSummary);

/**
 * GET /api/payments/upcoming
 * Get upcoming payment reminders
 * Access: All authenticated users
 */
router.get('/upcoming', paymentController.getUpcomingPayments);

/**
 * GET /api/payments/installments/:orderId
 * Get payment installments for an order
 * Access: All authenticated users
 */
router.get('/installments/:orderId', paymentController.getOrderInstallments);

/**
 * GET /api/payments/:id/receipt
 * Generate payment receipt
 * Access: All authenticated users
 */
router.get('/:id/receipt', paymentController.generateReceipt);

module.exports = router;
