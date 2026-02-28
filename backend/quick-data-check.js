/**
 * Quick Data Check for Reports
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function quickCheck() {
  try {
    console.log('\n=== QUICK REPORT DATA CHECK ===\n');

    // Check orders
    const ordersRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        MIN(created_at)::date as oldest,
        MAX(created_at)::date as newest
      FROM orders WHERE deleted_at IS NULL
    `);
    console.log('ORDERS:', ordersRes.rows[0]);

    // Check payments
    const paymentsRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(amount) as total_amount,
        MIN(payment_date)::date as oldest,
        MAX(payment_date)::date as newest
      FROM payments WHERE deleted_at IS NULL AND status = 'success'
    `);
    console.log('PAYMENTS:', paymentsRes.rows[0]);

    // Check order items
    const itemsRes = await pool.query(`
      SELECT COUNT(*) as total
      FROM order_items
    `);
    console.log('ORDER ITEMS:', itemsRes.rows[0]);

    // Check by date range
    const rangeRes = await pool.query(`
      SELECT
        'Last 7 Days' as period,
        COUNT(*) as orders
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
      UNION ALL
      SELECT 'Last 30 Days', COUNT(*)
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      UNION ALL
      SELECT 'All Time', COUNT(*)
      FROM orders WHERE deleted_at IS NULL
    `);
    console.log('\nORDERS BY DATE RANGE:');
    rangeRes.rows.forEach(row => console.log(`  ${row.period}: ${row.orders}`));

    console.log('\n=== RECOMMENDATION ===');
    const total = parseInt(ordersRes.rows[0].total);
    if (total === 0) {
      console.log('❌ NO DATA - Charts will be empty!');
      console.log('   Run: node seed-sample-data.js');
    } else if (total < 10) {
      console.log('⚠️  Limited data (' + total + ' orders)');
      console.log('   Consider adding more sample data');
    } else {
      console.log('✓ Data exists (' + total + ' orders)');
      console.log('  Check browser console for API errors');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

quickCheck();
