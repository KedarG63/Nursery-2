require('dotenv').config();
const pool = require('./utils/db');

async function getTestDataIds() {
  try {
    // Get order IDs
    const orders = await pool.query(`
      SELECT id, order_number, customer_id FROM orders
      WHERE status = 'confirmed'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    console.log('\n=== Test Data IDs ===\n');
    console.log('Order IDs (for route creation):');
    console.log(JSON.stringify(orders.rows.map(o => o.id), null, 2));

    console.log('\nOrder Details:');
    orders.rows.forEach(order => {
      console.log(`- ${order.order_number}: ${order.id}`);
    });

    // Get vehicle IDs
    const vehicles = await pool.query(`
      SELECT id, registration_number, vehicle_type FROM vehicles
      WHERE status = 'available'
      ORDER BY registration_number
    `);

    console.log('\nVehicle IDs:');
    vehicles.rows.forEach(v => {
      console.log(`- ${v.registration_number} (${v.vehicle_type}): ${v.id}`);
    });

    await pool.closePool();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.closePool();
    process.exit(1);
  }
}

getTestDataIds();
