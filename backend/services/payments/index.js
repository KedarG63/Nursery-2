/**
 * Payment Service Entry Point
 */

const PaymentGatewayFactory = require('./paymentGatewayFactory');

// Export factory as default
module.exports = PaymentGatewayFactory;

// Also export for convenience
module.exports.getPaymentProvider = () => PaymentGatewayFactory.getProvider();
module.exports.getProviderName = () => PaymentGatewayFactory.getProviderName();
