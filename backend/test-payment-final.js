require('dotenv').config();
const pool = require('./config/database');

async function testPaymentRecording() {
  try {
    console.log('=== Final Payment Recording Test ===\n');

    // Get the problematic order
    const orderId = '7ca78136-122f-4ee8-b915-7c0b7a884a1b';

    const orderResult = await pool.query(
      `SELECT id, order_number, total_amount, paid_amount, balance_amount
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0];
    console.log('Order Before Payment:');
    console.log('- Number:', order.order_number);
    console.log('- Total:', order.total_amount);
    console.log('- Paid:', order.paid_amount);
    console.log('- Balance:', order.balance_amount);
    console.log('');

    // Simulate the payment controller logic
    const paymentAmount = 1000.00;
    const orderBalance = parseFloat(order.balance_amount);
    const newBalance = orderBalance - paymentAmount;
    const finalBalance = Math.abs(newBalance) < 0.01 ? 0 : newBalance;

    console.log('Payment Validation:');
    console.log('- Payment Amount:', paymentAmount);
    console.log('- Current Balance:', orderBalance);
    console.log('- Calculated New Balance:', newBalance);
    console.log('- Final Balance (rounded):', finalBalance);
    console.log('- Is Valid:', newBalance >= -0.01);
    console.log('');

    if (paymentAmount > orderBalance) {
      console.error('✗ VALIDATION FAILED: Payment exceeds balance');
      console.error(`  Payment: ₹${paymentAmount.toFixed(2)}, Balance: ₹${orderBalance.toFixed(2)}`);
      process.exit(0);
    }

    if (newBalance < -0.01) {
      console.error('✗ VALIDATION FAILED: Would create negative balance');
      process.exit(0);
    }

    console.log('✓ Validation Passed!\n');

    // Ask user if they want to record the payment
    console.log('This test will record a payment of ₹1,000.00 to the order.');
    console.log('The order balance will change from ₹' + orderBalance.toFixed(2) + ' to ₹' + finalBalance.toFixed(2));
    console.log('');
    console.log('To proceed with actual payment recording, run:');
    console.log('  cd backend');
    console.log('  node -e "require(\'./test-payment-final.js\').recordPayment()"');
    console.log('');
    console.log('=== Test Complete ===');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function recordPayment() {
  const client = await pool.connect();

  try {
    console.log('=== Recording Test Payment ===\n');

    const orderId = '7ca78136-122f-4ee8-b915-7c0b7a884a1b';
    const paymentAmount = 1000.00;

    await client.query('BEGIN');

    // Get order with lock
    const orderResult = await client.query(
      `SELECT id, customer_id, balance_amount FROM orders
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [orderId]
    );

    const order = orderResult.rows[0];
    const orderBalance = parseFloat(order.balance_amount);
    const newBalance = orderBalance - paymentAmount;
    const finalBalance = Math.abs(newBalance) < 0.01 ? 0 : newBalance;

    // Validation
    if (paymentAmount > orderBalance) {
      throw new Error(`Payment exceeds balance: ${paymentAmount} > ${orderBalance}`);
    }

    // Get a user
    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    const userId = userResult.rows[0].id;

    // Create payment
    const paymentResult = await client.query(
      `INSERT INTO payments (
         order_id, customer_id, payment_method, payment_gateway,
         amount, status, payment_date, receipt_number, received_by,
         notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
       RETURNING *`,
      [
        orderId,
        order.customer_id,
        'cash',
        'manual',
        paymentAmount,
        'success',
        'FINAL-TEST-001',
        userId,
        'Final validation test payment',
        userId,
      ]
    );

    console.log('✓ Payment record created:', paymentResult.rows[0].id);

    // Update order
    await client.query(
      `UPDATE orders
       SET paid_amount = paid_amount + $1,
           balance_amount = $2,
           updated_at = NOW(),
           updated_by = $3
       WHERE id = $4`,
      [paymentAmount, finalBalance, userId, orderId]
    );

    console.log('✓ Order updated');

    await client.query('COMMIT');

    // Verify
    const verifyResult = await pool.query(
      `SELECT order_number, total_amount, paid_amount, balance_amount
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const updated = verifyResult.rows[0];
    console.log('\nOrder After Payment:');
    console.log('- Total:', updated.total_amount);
    console.log('- Paid:', updated.paid_amount);
    console.log('- Balance:', updated.balance_amount);

    console.log('\n✓ SUCCESS!');
    process.exit(0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  testPaymentRecording();
}

module.exports = { recordPayment };
