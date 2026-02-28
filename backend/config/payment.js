/**
 * Payment Configuration
 */

module.exports = {
  // Provider selection
  provider: process.env.PAYMENT_PROVIDER || 'mock',

  // Razorpay configuration
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  // Payment settings
  currency: 'INR',

  // Tax configuration
  taxRate: 0.18, // 18% GST

  // Installment settings
  installment: {
    minAmount: 5000, // Minimum order amount for installments
    maxInstallments: 12,
    penaltyRate: 0.02, // 2% penalty per month for overdue
  },

  // Refund settings
  refund: {
    allowedDaysAfterDelivery: 7,
    autoProcessRefunds: false,
  },
};
