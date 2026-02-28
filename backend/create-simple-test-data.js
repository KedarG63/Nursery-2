require('dotenv').config();
const pool = require('./utils/db');

async function createSimpleTestData() {
  try {
    console.log('\n=== Creating Simple Test Data ===\n');

    // 1. Create test customers
    console.log('1. Creating test customers...');
    const customerResult = await pool.query(`
      INSERT INTO customers (
        customer_code, name, phone, email, gst_number,
        credit_limit, credit_days, status, customer_type
      )
      VALUES
        ('CUST001', 'Green Gardens Resort', '+919123456789', 'contact@greengardens.com', '29ABCDE1234F1Z5', 100000, 30, 'active', 'institutional'),
        ('CUST002', 'Urban Farms Ltd', '+919123456790', 'orders@urbanfarms.com', '29FGHIJ5678K2Y6', 150000, 45, 'active', 'farmer'),
        ('CUST003', 'Paradise Landscapes', '+919123456791', 'info@paradiseland.com', '29KLMNO9012M3X7', 80000, 15, 'active', 'retailer')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id, name
    `);
    console.log(`   ✓ Created/Found ${customerResult.rowCount || 0} customers`);

    // Get all customer IDs
    const customers = await pool.query(`
      SELECT id, name FROM customers
      WHERE phone IN ('+919123456789', '+919123456790', '+919123456791')
      ORDER BY name
    `);
    console.log(`   ✓ Total customers: ${customers.rows.length}`);

    // 2. Create addresses with coordinates (Delhi NCR area)
    console.log('\n2. Creating customer addresses with coordinates...');
    const addresses = [
      { lat: 28.4595, lng: 77.0266, area: 'Gurgaon, Sector 14', city: 'Gurgaon', state: 'Haryana', pincode: '122001' },
      { lat: 28.5355, lng: 77.3910, area: 'Noida, Sector 62', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' },
      { lat: 28.6139, lng: 77.2090, area: 'Connaught Place', city: 'New Delhi', state: 'Delhi', pincode: '110001' }
    ];

    for (let i = 0; i < customers.rows.length; i++) {
      const customer = customers.rows[i];
      const address = addresses[i];

      // Check if address exists
      const existingAddress = await pool.query(`
        SELECT id FROM customer_addresses
        WHERE customer_id = $1 AND address_line1 = $2
      `, [customer.id, address.area]);

      if (existingAddress.rows.length === 0) {
        await pool.query(`
          INSERT INTO customer_addresses (
            customer_id, address_type, address_line1, city, state,
            pincode, gps_latitude, gps_longitude, is_default
          )
          VALUES ($1, 'delivery', $2, $3, $4, $5, $6, $7, true)
        `, [customer.id, address.area, address.city, address.state, address.pincode, address.lat, address.lng]);
      }

      console.log(`   ✓ Address for ${customer.name}: ${address.area}`);
    }

    // 3. Create test orders
    console.log('\n3. Creating test orders...');
    for (const customer of customers.rows) {
      const address = await pool.query(`
        SELECT id FROM customer_addresses WHERE customer_id = $1 LIMIT 1
      `, [customer.id]);

      if (address.rows.length > 0) {
        const orderResult = await pool.query(`
          INSERT INTO orders (
            customer_id, delivery_address_id, delivery_date, status, payment_type,
            subtotal_amount, tax_amount, total_amount, paid_amount, balance_amount, notes
          )
          VALUES ($1, $2, CURRENT_DATE + INTERVAL '1 day', 'confirmed', 'advance', 4500, 500, 5000, 5000, 0, 'Test order for Phase 8 delivery routing')
          RETURNING id, order_number
        `, [customer.id, address.rows[0].id]);

        if (orderResult.rows.length > 0) {
          console.log(`   ✓ Order ${orderResult.rows[0].order_number} for ${customer.name}`);
        }
      }
    }

    console.log('\n=== Test Data Summary ===');
    console.log(`✓ Vehicles: 3 (DL-01-AB-1234, DL-02-CD-5678, DL-03-EF-9012)`);
    console.log(`✓ Customers: ${customers.rows.length}`);
    console.log(`✓ Addresses: ${customers.rows.length} (with GPS coordinates)`);
    console.log(`✓ Orders: ${customers.rows.length} (confirmed & paid)\n`);

    console.log('Ready to test Phase 8 delivery routing API!\n');

    await pool.closePool();
  } catch (error) {
    console.error('\nError:', error.message);
    console.error('\nStack:', error.stack);
    await pool.closePool();
    process.exit(1);
  }
}

createSimpleTestData();
