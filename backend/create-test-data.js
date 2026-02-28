require('dotenv').config();
const pool = require('./utils/db');

async function createTestData() {
  try {
    console.log('\n=== Creating Test Data for Phase 8 ===\n');

    // 1. Create test vehicles
    console.log('1. Creating test vehicles...');
    const vehicleResult = await pool.query(`
      INSERT INTO vehicles (registration_number, vehicle_type, capacity_units, status, gps_device_id, make_model)
      VALUES
        ('DL-01-AB-1234', 'van', 500, 'available', 'GPS001', 'Tata Winger'),
        ('DL-02-CD-5678', 'truck', 1000, 'available', 'GPS002', 'Tata 407'),
        ('DL-03-EF-9012', 'tempo', 300, 'available', 'GPS003', 'Mahindra Pickup')
      ON CONFLICT (registration_number) DO NOTHING
      RETURNING id, registration_number, vehicle_type
    `);
    console.log(`   ✓ Created ${vehicleResult.rows.length} vehicles`);
    vehicleResult.rows.forEach(v => {
      console.log(`     - ${v.registration_number} (${v.vehicle_type})`);
    });

    // 2. Get or create test driver users
    console.log('\n2. Checking driver users...');
    const driverCheck = await pool.query(`
      SELECT id, name, email FROM users WHERE role = 'Delivery' LIMIT 2
    `);

    if (driverCheck.rows.length === 0) {
      console.log('   ⚠ No drivers found. Creating test drivers...');
      const driverResult = await pool.query(`
        INSERT INTO users (name, email, password_hash, role, phone, status)
        VALUES
          ('Rajesh Kumar', 'rajesh.driver@nursery.com', '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', 'Delivery', '+919876543210', 'active'),
          ('Amit Singh', 'amit.driver@nursery.com', '$2b$10$abcdefghijklmnopqrstuvwxyz123456789', 'Delivery', '+919876543211', 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email
      `);
      console.log(`   ✓ Created ${driverResult.rows.length} drivers`);
    } else {
      console.log(`   ✓ Found ${driverCheck.rows.length} existing drivers`);
    }

    // 3. Check/create test customers with addresses
    console.log('\n3. Creating test customers with delivery addresses...');

    const customerResult = await pool.query(`
      INSERT INTO customers (name, phone, email, gst_number, credit_limit, status)
      VALUES
        ('Green Gardens Resort', '+919123456789', 'contact@greengardens.com', '29ABCDE1234F1Z5', 100000, 'active'),
        ('Urban Farms Ltd', '+919123456790', 'orders@urbanfarms.com', '29FGHIJ5678K2Y6', 150000, 'active'),
        ('Paradise Landscapes', '+919123456791', 'info@paradiseland.com', '29KLMNO9012M3X7', 80000, 'active')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id, name, phone
    `);
    console.log(`   ✓ Created ${customerResult.rows.length} customers`);

    // Get customer IDs
    const customers = await pool.query(`
      SELECT id, name FROM customers WHERE phone IN ('+919123456789', '+919123456790', '+919123456791')
    `);

    // Create addresses with coordinates (Delhi NCR area)
    for (const customer of customers.rows) {
      const addressResult = await pool.query(`
        INSERT INTO customer_addresses (
          customer_id, address_type, address_line1, city, state, postal_code,
          latitude, longitude, is_default
        )
        VALUES
          ($1, 'delivery', '123 MG Road, Sector 14', 'Gurgaon', 'Haryana', '122001', 28.4595, 77.0266, true)
        ON CONFLICT (customer_id, address_line1) DO NOTHING
        RETURNING id
      `, [customer.id]);

      if (addressResult.rows.length > 0) {
        console.log(`     - Address for ${customer.name}: Gurgaon`);
      }
    }

    // 4. Create test orders
    console.log('\n4. Creating test orders...');

    for (const customer of customers.rows) {
      const address = await pool.query(`
        SELECT id FROM customer_addresses WHERE customer_id = $1 LIMIT 1
      `, [customer.id]);

      if (address.rows.length > 0) {
        const orderResult = await pool.query(`
          INSERT INTO orders (
            customer_id, delivery_address_id, order_status, payment_status,
            total_amount, payment_method, notes
          )
          VALUES
            ($1, $2, 'confirmed', 'paid', 5000, 'UPI', 'Test order for delivery routing')
          RETURNING id, order_number
        `, [customer.id, address.rows[0].id]);

        if (orderResult.rows.length > 0) {
          console.log(`     - Order ${orderResult.rows[0].order_number} for ${customer.name}`);
        }
      }
    }

    console.log('\n=== Test Data Creation Complete ===\n');
    console.log('You can now test the delivery routing endpoints!\n');

    await pool.closePool();
  } catch (error) {
    console.error('Error creating test data:', error);
    await pool.closePool();
    process.exit(1);
  }
}

createTestData();
