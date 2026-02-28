require('dotenv').config();
const pool = require('./config/database');

async function fixOrderBalance() {
  const orderId = '7ca78136-122f-4ee8-b915-7c0b7a884a1b';

  try {
    console.log('=== Investigating Order Balance Issue ===\n');

    // Get order details
    const orderResult = await pool.query(
      `SELECT id, order_number, total_amount, paid_amount, balance_amount
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0];
    console.log('Order Details:');
    console.log('- Number:', order.order_number);
    console.log('- Total Amount:', order.total_amount);
    console.log('- Paid Amount:', order.paid_amount);
    console.log('- Balance Amount:', order.balance_amount);
    console.log('');

    // Get all payments
    const paymentsResult = await pool.query(
      `SELECT id, amount, payment_method, payment_date, status, receipt_number
       FROM payments
       WHERE order_id = $1 AND deleted_at IS NULL
       ORDER BY payment_date`,
      [orderId]
    );

    console.log('Payments:');
    let totalPaid = 0;
    paymentsResult.rows.forEach((p, i) => {
      console.log(`${i + 1}. ₹${p.amount} - ${p.payment_method} - ${p.payment_date} - ${p.status} - ${p.receipt_number || 'N/A'}`);
      if (p.status === 'success') {
        totalPaid += parseFloat(p.amount);
      }
    });
    console.log('');
    console.log('Total Payments (success only):', totalPaid);
    console.log('Expected Balance:', parseFloat(order.total_amount) - totalPaid);
    console.log('Actual Balance:', parseFloat(order.balance_amount));
    console.log('');

    // Calculate correct values
    const correctBalance = parseFloat(order.total_amount) - totalPaid;

    if (parseFloat(order.paid_amount) !== totalPaid || parseFloat(order.balance_amount) !== correctBalance) {
      console.log('⚠️  MISMATCH DETECTED!');
      console.log('');
      console.log('Fixing order balance...');

      const updateResult = await pool.query(
        `UPDATE orders
         SET paid_amount = $1,
             balance_amount = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING order_number, total_amount, paid_amount, balance_amount`,
        [totalPaid, correctBalance, orderId]
      );

      console.log('✓ Order updated:');
      console.log('- Total:', updateResult.rows[0].total_amount);
      console.log('- Paid:', updateResult.rows[0].paid_amount);
      console.log('- Balance:', updateResult.rows[0].balance_amount);
    } else {
      console.log('✓ Order balance is correct!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixOrderBalance();
