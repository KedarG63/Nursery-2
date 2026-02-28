require('dotenv').config();
const axios = require('axios');

async function testPaymentValidation() {
  try {
    console.log('=== Testing Payment Validation and Recording ===\n');

    // Step 1: Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'test.payment@nursery.com',
      password: 'Test@1234'
    });

    const token = loginResponse.data.tokens.accessToken;
    console.log('✓ Login successful\n');

    // Step 2: Get an order with balance
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
    console.log('2. Testing with order:', order.order_number || order.id);
    console.log('   Balance:', order.balance_amount);
    console.log('');

    // Test Case 1: Valid payment with receipt_number
    console.log('Test Case 1: Valid cash payment with receipt_number');
    try {
      const response1 = await axios.post(
        'http://localhost:5000/api/payments/record',
        {
          order_id: order.id,
          amount: 50,
          payment_method: 'cash',
          receipt_number: 'TEST-RECEIPT-001',
          notes: 'Test payment case 1'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✓ SUCCESS - Payment recorded with receipt_number');
      console.log('  Payment ID:', response1.data.data.id);
    } catch (error) {
      console.error('✗ FAILED');
      console.error('  Status:', error.response?.status);
      console.error('  Error:', error.response?.data?.message);
      console.error('  Errors:', error.response?.data?.errors);
    }
    console.log('');

    // Test Case 2: Cash payment without receipt_number (should fail validation)
    console.log('Test Case 2: Cash payment WITHOUT receipt_number (should fail)');
    try {
      await axios.post(
        'http://localhost:5000/api/payments/record',
        {
          order_id: order.id,
          amount: 50,
          payment_method: 'cash',
          notes: 'Test payment case 2 - missing receipt'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.error('✗ UNEXPECTED SUCCESS - Should have failed validation');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✓ EXPECTED FAILURE - Validation error caught');
        console.log('  Error:', error.response.data.message);
        console.log('  Errors:', error.response.data.errors);
      } else {
        console.error('✗ UNEXPECTED ERROR');
        console.error('  Status:', error.response?.status);
        console.error('  Error:', error.response?.data);
      }
    }
    console.log('');

    // Test Case 3: UPI payment with receipt_number
    console.log('Test Case 3: UPI payment with transaction reference');
    try {
      const response3 = await axios.post(
        'http://localhost:5000/api/payments/record',
        {
          order_id: order.id,
          amount: 75,
          payment_method: 'upi',
          receipt_number: 'UPI-TXN-12345',
          notes: 'Test UPI payment'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✓ SUCCESS - UPI payment recorded');
      console.log('  Payment ID:', response3.data.data.id);
    } catch (error) {
      console.error('✗ FAILED');
      console.error('  Status:', error.response?.status);
      console.error('  Error:', error.response?.data?.message);
      console.error('  Errors:', error.response?.data?.errors);
    }
    console.log('');

    // Test Case 4: Card payment (no receipt_number required)
    console.log('Test Case 4: Card payment (no receipt required)');
    try {
      const response4 = await axios.post(
        'http://localhost:5000/api/payments/record',
        {
          order_id: order.id,
          amount: 100,
          payment_method: 'card',
          notes: 'Test card payment'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✓ SUCCESS - Card payment recorded without receipt');
      console.log('  Payment ID:', response4.data.data.id);
    } catch (error) {
      console.error('✗ FAILED');
      console.error('  Status:', error.response?.status);
      console.error('  Error:', error.response?.data?.message);
      console.error('  Errors:', error.response?.data?.errors);
    }
    console.log('');

    // Test Case 5: Invalid amount (should fail)
    console.log('Test Case 5: Invalid amount type (string instead of number)');
    try {
      await axios.post(
        'http://localhost:5000/api/payments/record',
        {
          order_id: order.id,
          amount: "invalid",
          payment_method: 'cash',
          receipt_number: 'TEST-RECEIPT-005'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.error('✗ UNEXPECTED SUCCESS - Should have failed validation');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✓ EXPECTED FAILURE - Validation error caught');
        console.log('  Errors:', error.response.data.errors);
      } else {
        console.error('✗ UNEXPECTED ERROR');
        console.error('  Status:', error.response?.status);
      }
    }
    console.log('');

    console.log('=== All Tests Complete ===');
    process.exit(0);

  } catch (error) {
    console.error('\n=== FATAL ERROR ===');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testPaymentValidation();
