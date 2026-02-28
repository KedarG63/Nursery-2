require('dotenv').config();
const pool = require('./config/database');

async function testPaymentRecord() {
  const client = await pool.connect();

  try {
    console.log('=== Testing Payment Record ===\n');

    // Step 1: Find an order with balance
    const orderQuery = `
      SELECT id, order_number, customer_id, total_amount, paid_amount, balance_amount
      FROM orders
      WHERE balance_amount > 0 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const orderResult = await pool.query(orderQuery);

    if (orderResult.rows.length === 0) {
      console.log('No orders with balance found. Creating a test order...');

      // Get a customer
      const customerResult = await pool.query(
        `SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1`
      );

      if (customerResult.rows.length === 0) {
        console.error('No customers found. Cannot create test order.');
        return;
      }

      // Create a test order
      const createOrderResult = await pool.query(
        `INSERT INTO orders (customer_id, total_amount, paid_amount, balance_amount, status, order_date)
         VALUES ($1, 1000, 0, 1000, 'confirmed', NOW())
         RETURNING *`,
        [customerResult.rows[0].id]
      );

      console.log('Created test order:', createOrderResult.rows[0].order_number || createOrderResult.rows[0].id);
      console.log('');
    }

    const orderResult2 = await pool.query(orderQuery);
    const order = orderResult2.rows[0];

    console.log('Order Details:');
    console.log('- ID:', order.id);
    console.log('- Number:', order.order_number || 'N/A');
    console.log('- Total:', order.total_amount);
    console.log('- Paid:', order.paid_amount);
    console.log('- Balance:', order.balance_amount);
    console.log('');

    // Step 2: Get a user to act as the creator
    const userResult = await pool.query(
      `SELECT id, email FROM users LIMIT 1`
    );

    if (userResult.rows.length === 0) {
      console.error('No users found in database');
      return;
    }

    const userId = userResult.rows[0].id;
    console.log('User ID:', userId);
    console.log('User Email:', userResult.rows[0].email);
    console.log('');

    // Step 3: Simulate payment recording
    const paymentAmount = Math.min(500, parseFloat(order.balance_amount));
    console.log('Recording payment of:', paymentAmount);

    await client.query('BEGIN');

    // Lock the order
    const lockedOrder = await client.query(
      `SELECT id, customer_id, balance_amount FROM orders
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [order.id]
    );

    console.log('Order locked. Current balance:', lockedOrder.rows[0].balance_amount);

    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
         order_id, customer_id, payment_method, payment_gateway,
         amount, status, payment_date, receipt_number, received_by,
         notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
       RETURNING *`,
      [
        order.id,
        order.customer_id,
        'cash',
        'manual',
        paymentAmount,
        'success',
        'TEST-RECEIPT-001',
        userId,
        'Test payment from script',
        userId,
      ]
    );

    console.log('✓ Payment record created:', paymentResult.rows[0].id);

    // Update order
    await client.query(
      `UPDATE orders
       SET paid_amount = paid_amount + $1,
           balance_amount = balance_amount - $1,
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $3`,
      [paymentAmount, userId, order.id]
    );

    console.log('✓ Order updated');

    await client.query('COMMIT');
    console.log('✓ Transaction committed');
    console.log('');
    console.log('=== SUCCESS ===');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('=== ERROR ===');
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

testPaymentRecord();
