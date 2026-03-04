/**
 * Drop the chk_gateway_transaction_for_online constraint from payments table.
 *
 * This constraint required gateway_transaction_id IS NOT NULL for any payment
 * method other than 'cash' or 'credit'. But the recordOfflinePayment endpoint
 * records bank_transfer / upi / card payments without a gateway_transaction_id
 * (offline/manual), causing a constraint violation and a 500 error.
 */
exports.up = (pgm) => {
  pgm.dropConstraint('payments', 'chk_gateway_transaction_for_online', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.addConstraint('payments', 'chk_gateway_transaction_for_online', {
    check: "payment_method IN ('cash', 'credit') OR gateway_transaction_id IS NOT NULL",
  });
};
