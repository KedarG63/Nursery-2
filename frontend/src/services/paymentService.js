/**
 * Payment Service
 * API calls for payment management
 */

import api from '../utils/api';

/**
 * Get all payments with filters
 * @param {Object} filters - payment_method, status, start_date, end_date, search, page, limit
 * @returns {Promise} Payment list with pagination
 */
export const getPayments = async (filters = {}) => {
  const response = await api.get('/api/payments', { params: filters });
  return response.data;
};

/**
 * Get payment by ID
 * @param {string} paymentId - Payment ID
 * @returns {Promise} Payment details
 */
export const getPaymentById = async (paymentId) => {
  const response = await api.get(`/api/payments/${paymentId}`);
  return response.data;
};

/**
 * Get payments for a specific order
 * @param {string} orderId - Order ID
 * @returns {Promise} Order payments
 */
export const getOrderPayments = async (orderId) => {
  const response = await api.get(`/api/payments/order/${orderId}`);
  return response.data;
};

/**
 * Get customer payment history
 * @param {string} customerId - Customer ID
 * @returns {Promise} Customer payment history
 */
export const getCustomerPayments = async (customerId) => {
  const response = await api.get(`/api/payments/customer/${customerId}`);
  return response.data;
};

/**
 * Get customer outstanding orders
 * @param {string} customerId - Customer ID
 * @returns {Promise} Outstanding orders
 */
export const getCustomerOutstanding = async (customerId) => {
  const response = await api.get(`/api/customers/${customerId}/outstanding`);
  return response.data;
};

/**
 * Record offline payment (cash, bank transfer, etc.)
 * @param {Object} paymentData - Payment information
 * @returns {Promise} Created payment
 */
export const recordPayment = async (paymentData) => {
  const response = await api.post('/api/payments/record', paymentData);
  return response.data;
};

/**
 * Initiate online payment
 * @param {Object} paymentData - Order ID and amount
 * @returns {Promise} Payment gateway details
 */
export const initiatePayment = async (paymentData) => {
  const response = await api.post('/api/payments/initiate', paymentData);
  return response.data;
};

/**
 * Verify payment callback
 * @param {Object} verificationData - Payment gateway response
 * @returns {Promise} Verification result
 */
export const verifyPayment = async (verificationData) => {
  const response = await api.post('/api/payments/verify', verificationData);
  return response.data;
};

/**
 * Process refund
 * @param {Object} refundData - Payment ID and refund details
 * @returns {Promise} Refund result
 */
export const processRefund = async (refundData) => {
  const response = await api.post('/api/payments/refund', refundData);
  return response.data;
};

/**
 * Generate payment receipt PDF
 * @param {string} paymentId - Payment ID
 * @returns {Promise} PDF blob
 */
export const generateReceipt = async (paymentId) => {
  const response = await api.get(`/api/payments/${paymentId}/receipt`, {
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Generate customer payment statement PDF
 * @param {string} customerId - Customer ID
 * @param {Object} filters - start_date, end_date
 * @returns {Promise} PDF blob
 */
export const generateStatement = async (customerId, filters = {}) => {
  const response = await api.get(
    `/api/payments/customer/${customerId}/statement`,
    {
      params: filters,
      responseType: 'blob'
    }
  );
  return response.data;
};

/**
 * Export payments to Excel
 * @param {Object} filters - Export filters
 * @returns {Promise} Excel blob
 */
export const exportPayments = async (filters = {}) => {
  const response = await api.get('/api/payments/export', {
    params: filters,
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Get payment summary (Phase 21)
 * @param {string} period - 'day', 'week', 'month'
 * @returns {Promise} Payment summary
 */
export const getPaymentSummary = async (period = 'month') => {
  const response = await api.get('/api/payments/summary', {
    params: { period }
  });
  return response.data;
};

/**
 * Get upcoming payments (Phase 21)
 * @param {number} days - Number of days to look ahead
 * @returns {Promise} Upcoming payments
 */
export const getUpcomingPayments = async (days = 7) => {
  const response = await api.get('/api/payments/upcoming', {
    params: { days }
  });
  return response.data;
};

/**
 * Get payment installments for order (Phase 21)
 * @param {string} orderId - Order ID
 * @returns {Promise} Installment schedule
 */
export const getPaymentInstallments = async (orderId) => {
  const response = await api.get(`/api/payments/installments/${orderId}`);
  return response.data;
};

export default {
  getPayments,
  getPaymentById,
  getOrderPayments,
  getCustomerPayments,
  getCustomerOutstanding,
  recordPayment,
  initiatePayment,
  verifyPayment,
  processRefund,
  generateReceipt,
  generateStatement,
  exportPayments,
  getPaymentSummary,
  getUpcomingPayments,
  getPaymentInstallments,
};
