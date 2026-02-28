require('dotenv').config();
const axios = require('axios');

async function testPaymentAPI() {
  try {
    console.log('=== Testing Payment API ===\n');

    // Step 1: Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'test.payment@nursery.com',
      password: 'Test@1234'
    });

    const token = loginResponse.data.tokens?.accessToken || loginResponse.data.data?.accessToken || loginResponse.data.accessToken;
    console.log('✓ Login successful');
    console.log('Token:', token ? 'Received' : 'Missing');
    console.log('User:', loginResponse.data.user.email, 'Roles:', loginResponse.data.user.roles.join(', '));
    console.log('');

    // Step 2: Get orders
    console.log('2. Fetching orders with balance...');
    const ordersResponse = await axios.get('http://localhost:5000/api/orders?status=confirmed', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const orders = ordersResponse.data.data || [];
    console.log(`✓ Found ${orders.length} orders`);

    const orderWithBalance = orders.find(o => parseFloat(o.balance_amount) > 0);

    if (!orderWithBalance) {
      console.log('✗ No orders with balance found');
      return;
    }

    console.log('');
    console.log('Order to pay:');
    console.log('- ID:', orderWithBalance.id);
    console.log('- Number:', orderWithBalance.order_number);
    console.log('- Balance:', orderWithBalance.balance_amount);
    console.log('');

    // Step 3: Record payment
    console.log('3. Recording payment...');
    const paymentData = {
      order_id: orderWithBalance.id,
      amount: Math.min(500, parseFloat(orderWithBalance.balance_amount)),
      payment_method: 'cash',
      receipt_number: 'TEST-' + Date.now(),
      notes: 'Test payment from API test script'
    };

    console.log('Payment data:', JSON.stringify(paymentData, null, 2));

    const paymentResponse = await axios.post(
      'http://localhost:5000/api/payments/record',
      paymentData,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    console.log('');
    console.log('✓ Payment recorded successfully!');
    console.log('Payment ID:', paymentResponse.data.data.id);
    console.log('');
    console.log('=== SUCCESS ===');

  } catch (error) {
    console.error('');
    console.error('=== ERROR ===');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

testPaymentAPI();
