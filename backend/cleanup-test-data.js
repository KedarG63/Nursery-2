/**
 * Cleanup Excess Test Data
 * Removes duplicate/excess test data from failed attempts
 */

require('dotenv').config();
const db = require('./utils/db');
const pool = require('./config/database');

async function cleanupTestData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n🧹 Cleaning up excess test data...\n');

    // Get all test orders (except the latest one which is ORD-001)
    const ordersToDelete = await client.query(
      `SELECT id, order_number FROM orders
       WHERE order_number LIKE 'ORD-%'
       AND order_number != 'ORD-001'
       ORDER BY created_at`
    );

    console.log(`Found ${ordersToDelete.rows.length} excess orders to delete:`);
    ordersToDelete.rows.forEach((o) => {
      console.log(`   - ${o.order_number}`);
    });

    if (ordersToDelete.rows.length > 0) {
      const orderIds = ordersToDelete.rows.map(o => o.id);

      // First, delete route_stops referencing these orders
      const deleteStops = await client.query(
        'DELETE FROM route_stops WHERE order_id = ANY($1) RETURNING id',
        [orderIds]
      );
      console.log(`   Deleted ${deleteStops.rowCount} route stops`);

      // Then delete the orders (CASCADE will handle order_items, installments, etc.)
      for (const orderId of orderIds) {
        await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
      }

      console.log(`\n✅ Deleted ${ordersToDelete.rows.length} excess orders`);
    } else {
      console.log('\n✅ No excess orders to delete');
    }

    await client.query('COMMIT');

    console.log('\n🎉 Cleanup complete!\n');

    // Verify cleanup
    const remainingOrders = await client.query(
      "SELECT order_number FROM orders WHERE order_number LIKE 'ORD-%'"
    );

    console.log(`📊 Remaining test orders: ${remainingOrders.rows.length}`);
    remainingOrders.rows.forEach((o) => {
      console.log(`   - ${o.order_number}`);
    });

    console.log();

    client.release();
    await db.closePool();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('❌ Error during cleanup:', error);
    await db.closePool();
    process.exit(1);
  }
}

cleanupTestData();
