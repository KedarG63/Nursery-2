require('dotenv').config();
const axios = require('axios');

// Use the token from earlier successful login
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwNzViMTAxYi0zOTZiLTQyZjQtOWUzNS04ZjJjOTljMzkxNjQiLCJlbWFpbCI6InRlc3QucGF5bWVudEBudXJzZXJ5LmNvbSIsImlhdCI6MTc2MTI0NDgzMSwiZXhwIjoxNzYxMzMxMjMxfQ.q9yaPPe6W88zlZc0vl45Rm1YHLtWt1iYkdtJEQPy8SI';

async function testDirectPayment() {
  try {
    console.log('=== Testing Direct Payment Recording ===\n');

    // Step 1: Get an order with balance
    console.log('1. Fetching orders...');
    const pool = require('./config/database');

    const orderResult = await pool.query(`
      SELECT id, order_number, customer_id, balance_amount
      FROM orders
      WHERE balance_amount > 0 AND deleted_at IS NULL
      LIMIT 1
    `);

    if (orderResult.rows.length === 0) {
      console.log('No orders with balance found');
      return;
    }

    const order = orderResult.rows[0];
    console.log('✓ Found order:', order.order_number || order.id);
    console.log('  Balance:', order.balance_amount);
    console.log('');

    // Step 2: Record payment via API
    console.log('2. Recording payment via API...');
    const paymentData = {
      order_id: order.id,
      amount: 100,
      payment_method: 'cash',
      receipt_number: 'TEST-DIRECT-' + Date.now(),
      notes: 'Test payment via direct API call'
    };

    console.log('Payment data:');
    console.log(JSON.stringify(paymentData, null, 2));
    console.log('');

    const response = await axios.post(
      'http://localhost:5000/api/payments/record',
      paymentData,
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✓ SUCCESS!');
    console.log('Payment ID:', response.data.data.id);
    console.log('Amount:', response.data.data.amount);
    console.log('Status:', response.data.data.status);
    console.log('');
    console.log('=== PAYMENT RECORDING WORKS ===');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('=== ERROR ===');

    if (error.response) {
      console.error('HTTP Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));

      // Check if it's a server error with stack trace
      if (error.response.data.error?.stack) {
        console.error('\nServer Stack Trace:');
        console.error(error.response.data.error.stack);
      }
    } else if (error.request) {
      console.error('No response received from server');
      console.error('Request was:', error.config?.url);
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  }
}

testDirectPayment();
