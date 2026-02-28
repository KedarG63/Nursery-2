/**
 * Delete All Test Data
 * Removes all Phase 16 test data for clean recreation
 */

require('dotenv').config();
const pool = require('./config/database');

async function deleteAllTestData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n🗑️  Deleting all test data...\n');

    // Delete in reverse dependency order
    await client.query(`DELETE FROM route_stops WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'ORD-%')`);
    console.log('   ✓ Deleted route_stops');

    await client.query(`DELETE FROM delivery_routes WHERE route_number LIKE 'RT-TEST-%'`);
    console.log('   ✓ Deleted delivery_routes');

    await client.query(`DELETE FROM payment_installments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'ORD-%')`);
    console.log('   ✓ Deleted payment_installments');

    await client.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'ORD-%')`);
    console.log('   ✓ Deleted order_items');

    await client.query(`DELETE FROM orders WHERE order_number LIKE 'ORD-%'`);
    console.log('   ✓ Deleted orders');

    await client.query(`DELETE FROM lots WHERE lot_number LIKE 'LOT-%'`);
    console.log('   ✓ Deleted lots');

    await client.query(`DELETE FROM skus WHERE sku_code LIKE 'SKU-TEST-%'`);
    console.log('   ✓ Deleted skus');

    await client.query(`DELETE FROM products WHERE name LIKE 'Tomato Plant' OR name LIKE 'Lettuce'`);
    console.log('   ✓ Deleted products');

    await client.query(`DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'Test Customer%')`);
    console.log('   ✓ Deleted customer_addresses');

    await client.query(`DELETE FROM customers WHERE name LIKE 'Test Customer%'`);
    console.log('   ✓ Deleted customers');

    await client.query('COMMIT');

    console.log('\n✅ All test data deleted successfully!\n');

    client.release();
    await pool.end();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('❌ Error during deletion:', error);
    await pool.end();
    process.exit(1);
  }
}

deleteAllTestData();
