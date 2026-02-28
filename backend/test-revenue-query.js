/**
 * Test script to check why revenue is showing 0 in Dashboard and Reports
 */

const pool = require('./config/database');

async function testRevenueQueries() {
  console.log('\n=== TESTING REVENUE QUERIES ===\n');

  try {
    // 1. Check payments table data
    console.log('1. Checking payments table:');
    const paymentsQuery = await pool.query(`
      SELECT
        payment_date::date,
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payments
      WHERE deleted_at IS NULL
      GROUP BY payment_date::date, status
      ORDER BY payment_date DESC
      LIMIT 10
    `);
    console.log('Payments data:', paymentsQuery.rows);

    // 2. Check total successful payments
    console.log('\n2. Total successful payments:');
    const successfulPayments = await pool.query(`
      SELECT
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payments
      WHERE status = 'success'
      AND deleted_at IS NULL
    `);
    console.log('Successful payments:', successfulPayments.rows[0]);

    // 3. Test Dashboard KPI query (revenue this month)
    console.log('\n3. Dashboard KPI query (current month revenue):');
    const currentMonth = new Date();
    const dashboardRevenue = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(paid_amount), 0) as collected_revenue,
        COALESCE(SUM(balance_amount), 0) as pending_revenue,
        COUNT(*) as order_count
      FROM orders
      WHERE status IN ('delivered', 'dispatched', 'ready')
      AND EXTRACT(MONTH FROM order_date) = $1
      AND EXTRACT(YEAR FROM order_date) = $2
      AND deleted_at IS NULL
    `, [currentMonth.getMonth() + 1, currentMonth.getFullYear()]);
    console.log('Dashboard revenue (from orders):', dashboardRevenue.rows[0]);

    // 4. Test Sales Report query (last 30 days from payments)
    console.log('\n4. Sales Report query (last 30 days from payments):');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const salesReport = await pool.query(`
      SELECT
        COALESCE(COUNT(DISTINCT p.order_id), 0) as order_count,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(AVG(p.amount), 0) as avg_payment_value,
        COALESCE(COUNT(p.id), 0) as payment_count
      FROM payments p
      WHERE p.payment_date >= $1 AND p.payment_date <= $2
        AND p.status = 'success'
        AND p.deleted_at IS NULL
    `, [startDate.toISOString(), endDate.toISOString()]);
    console.log('Sales report (from payments):', salesReport.rows[0]);

    // 5. Check Financial Report query
    console.log('\n5. Financial Report query (last 30 days):');
    const financialReport = await pool.query(`
      SELECT
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(SUM(o.paid_amount), 0) as total_collected,
        COALESCE(SUM(o.total_amount - o.paid_amount), 0) as outstanding
      FROM orders o
      WHERE o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('cancelled')
    `, [startDate.toISOString(), endDate.toISOString()]);
    console.log('Financial report (from orders):', financialReport.rows[0]);

    // 6. Check if payments have payment_date set
    console.log('\n6. Check payment_date distribution:');
    const paymentDates = await pool.query(`
      SELECT
        payment_date IS NULL as has_null_date,
        COUNT(*) as count
      FROM payments
      WHERE deleted_at IS NULL
      GROUP BY payment_date IS NULL
    `);
    console.log('Payment date distribution:', paymentDates.rows);

    // 7. Check orders table for comparison
    console.log('\n7. Orders summary:');
    const ordersSummary = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_amount,
        SUM(paid_amount) as paid_amount,
        SUM(balance_amount) as balance_amount
      FROM orders
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY count DESC
    `);
    console.log('Orders summary:', ordersSummary.rows);

    console.log('\n=== TEST COMPLETE ===\n');

  } catch (error) {
    console.error('Error running test queries:', error);
  } finally {
    await pool.end();
  }
}

testRevenueQueries();
