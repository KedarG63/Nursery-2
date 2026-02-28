/**
 * Check Phase 16 Test Data
 * Verify test data and identify any duplicates
 */

require('dotenv').config();
const db = require('./utils/db');

async function checkTestData() {
  try {
    console.log('\n🔍 Checking Phase 16 Test Data...\n');

    // Check customers
    const customers = await db.query(
      "SELECT id, name, email, customer_type FROM customers WHERE email LIKE 'test%@example.com' ORDER BY created_at"
    );
    console.log(`📋 Test Customers: ${customers.rows.length}`);
    customers.rows.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.email}) - ${c.customer_type}`);
    });

    // Check products
    const products = await db.query(
      "SELECT id, name, category FROM products WHERE name IN ('Tomato Plant', 'Lettuce') ORDER BY created_at"
    );
    console.log(`\n🌱 Test Products: ${products.rows.length}`);
    products.rows.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (${p.category})`);
    });

    // Check SKUs
    const skus = await db.query(
      "SELECT id, sku_code, size, container_type FROM skus WHERE sku_code LIKE 'SKU-TEST-%' ORDER BY created_at"
    );
    console.log(`\n📦 Test SKUs: ${skus.rows.length}`);
    skus.rows.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.sku_code} (${s.size} ${s.container_type})`);
    });

    // Check lots
    const lots = await db.query(
      "SELECT id, lot_number, growth_stage, quantity, expected_ready_date FROM lots WHERE lot_number LIKE 'LOT-%' ORDER BY created_at"
    );
    console.log(`\n📦 Test Lots: ${lots.rows.length}`);
    lots.rows.forEach((l, i) => {
      const readyDate = l.expected_ready_date ? new Date(l.expected_ready_date).toLocaleDateString() : 'N/A';
      console.log(`   ${i + 1}. ${l.lot_number} (${l.growth_stage}, qty: ${l.quantity}, ready: ${readyDate})`);
    });

    // Check orders
    const orders = await db.query(
      "SELECT id, order_number, status, total_amount FROM orders WHERE order_number LIKE 'ORD-%' ORDER BY created_at"
    );
    console.log(`\n📝 Test Orders: ${orders.rows.length}`);
    orders.rows.forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.order_number} (${o.status}, ₹${o.total_amount})`);
    });

    // Check payment installments
    const installments = await db.query(
      `SELECT pi.id, pi.installment_number, pi.amount, pi.due_date, pi.status
       FROM payment_installments pi
       JOIN orders o ON pi.order_id = o.id
       WHERE o.order_number LIKE 'ORD-%'
       ORDER BY pi.installment_number`
    );
    console.log(`\n💰 Test Payment Installments: ${installments.rows.length}`);
    installments.rows.forEach((i, idx) => {
      const dueDate = new Date(i.due_date).toLocaleDateString();
      console.log(`   ${idx + 1}. Installment ${i.installment_number} (₹${i.amount}, due: ${dueDate}, ${i.status})`);
    });

    // Check delivery routes
    const routes = await db.query(
      "SELECT id, route_number, status, route_date FROM delivery_routes WHERE route_number LIKE 'RT-TEST-%' ORDER BY created_at"
    );
    console.log(`\n🚚 Test Delivery Routes: ${routes.rows.length}`);
    routes.rows.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.route_number} (${r.status})`);
    });

    // Check route stops
    const stops = await db.query(
      `SELECT rs.id, rs.stop_sequence, rs.delivery_address, rs.status
       FROM route_stops rs
       JOIN delivery_routes dr ON rs.route_id = dr.id
       WHERE dr.route_number LIKE 'RT-TEST-%'
       ORDER BY rs.stop_sequence`
    );
    console.log(`\n📍 Test Route Stops: ${stops.rows.length}`);
    stops.rows.forEach((s, i) => {
      console.log(`   ${i + 1}. Stop ${s.stop_sequence}: ${s.delivery_address} (${s.status})`);
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log('='.repeat(50));

    const hasExcessData =
      customers.rows.length > 2 ||
      products.rows.length > 2 ||
      skus.rows.length > 2 ||
      lots.rows.length > 3 ||
      orders.rows.length > 1 ||
      installments.rows.length > 3 ||
      routes.rows.length > 1 ||
      stops.rows.length > 1;

    if (hasExcessData) {
      console.log('⚠️  WARNING: Excess test data detected!');
      console.log('   Expected: 2 customers, 2 products, 2 SKUs, 3 lots, 1 order, 3 installments, 1 route, 1 stop');
      console.log(`   Actual: ${customers.rows.length} customers, ${products.rows.length} products, ${skus.rows.length} SKUs, ${lots.rows.length} lots, ${orders.rows.length} orders, ${installments.rows.length} installments, ${routes.rows.length} routes, ${stops.rows.length} stops`);
      console.log('\n💡 Run cleanup-test-data.js to remove duplicates');
    } else {
      console.log('✅ Test data is correct - no duplicates found!');
      console.log('   All counts match expected values');
    }

    console.log('='.repeat(50) + '\n');

    await db.closePool();
  } catch (error) {
    console.error('❌ Error checking test data:', error);
    await db.closePool();
    process.exit(1);
  }
}

checkTestData();
