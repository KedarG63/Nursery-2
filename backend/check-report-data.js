/**
 * Check Report Data
 * Script to verify what data exists in the database for reports
 */

require('dotenv').config();
const pool = require('./config/database');

async function checkReportData() {
  const client = await pool.connect();

  try {
    console.log('\n=== CHECKING DATABASE FOR REPORT DATA ===\n');

    // 1. Check Orders
    console.log('1. ORDERS DATA:');
    const ordersQuery = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        MIN(created_at)::date as oldest_order,
        MAX(created_at)::date as newest_order
      FROM orders
      WHERE deleted_at IS NULL
    `;
    const ordersResult = await client.query(ordersQuery);
    console.log(ordersResult.rows[0]);

    // 2. Check Payments
    console.log('\n2. PAYMENTS DATA:');
    const paymentsQuery = `
      SELECT
        COUNT(*) as total_payments,
        COUNT(DISTINCT order_id) as orders_with_payments,
        COALESCE(SUM(amount), 0) as total_collected,
        MIN(payment_date)::date as oldest_payment,
        MAX(payment_date)::date as newest_payment,
        json_object_agg(
          COALESCE(payment_method, 'unknown'),
          count_by_method
        ) as payment_methods
      FROM payments
      CROSS JOIN LATERAL (
        SELECT COUNT(*) as count_by_method
        FROM payments p2
        WHERE p2.payment_method = payments.payment_method
      ) counts
      WHERE deleted_at IS NULL
      GROUP BY payment_method
    `;
    const paymentsResult = await client.query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(DISTINCT order_id) as orders_with_payments,
        COALESCE(SUM(amount), 0) as total_collected,
        MIN(payment_date)::date as oldest_payment,
        MAX(payment_date)::date as newest_payment
      FROM payments
      WHERE deleted_at IS NULL
    `);
    console.log(paymentsResult.rows[0]);

    const paymentMethodsResult = await client.query(`
      SELECT
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments
      WHERE deleted_at IS NULL
      GROUP BY payment_method
    `);
    console.log('Payment Methods:', paymentMethodsResult.rows);

    // 3. Check Order Items (for product data)
    console.log('\n3. ORDER ITEMS DATA:');
    const itemsQuery = `
      SELECT
        COUNT(*) as total_items,
        COUNT(DISTINCT order_id) as orders_with_items,
        COUNT(DISTINCT sku_id) as unique_skus
      FROM order_items
      WHERE deleted_at IS NULL
    `;
    const itemsResult = await client.query(itemsQuery);
    console.log(itemsResult.rows[0]);

    // 4. Check Top Products
    console.log('\n4. TOP PRODUCTS (by revenue):');
    const topProductsQuery = `
      SELECT
        s.name as sku_name,
        COUNT(oi.id) as times_ordered,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.subtotal) as total_revenue
      FROM order_items oi
      JOIN skus s ON s.id = oi.sku_id
      WHERE oi.deleted_at IS NULL
      GROUP BY s.id, s.name
      ORDER BY total_revenue DESC
      LIMIT 5
    `;
    const topProductsResult = await client.query(topProductsQuery);
    console.log(topProductsResult.rows);

    // 5. Check Customers
    console.log('\n5. CUSTOMERS DATA:');
    const customersQuery = `
      SELECT
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE customer_type = 'retail') as retail_customers,
        COUNT(*) FILTER (WHERE customer_type = 'wholesale') as wholesale_customers
      FROM customers
      WHERE deleted_at IS NULL
    `;
    const customersResult = await client.query(customersQuery);
    console.log(customersResult.rows[0]);

    // 6. Check Deliveries
    console.log('\n6. DELIVERIES DATA:');
    const deliveriesQuery = `
      SELECT
        COUNT(*) as total_deliveries,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_deliveries,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_deliveries,
        MIN(created_at)::date as oldest_delivery,
        MAX(created_at)::date as newest_delivery
      FROM deliveries
      WHERE deleted_at IS NULL
    `;
    const deliveriesResult = await client.query(deliveriesQuery);
    console.log(deliveriesResult.rows[0]);

    // 7. Check Inventory/Lots
    console.log('\n7. INVENTORY (LOTS) DATA:');
    const lotsQuery = `
      SELECT
        COUNT(*) as total_lots,
        COUNT(DISTINCT sku_id) as unique_skus,
        SUM(current_quantity) as total_quantity,
        COUNT(*) FILTER (WHERE growth_stage = 'ready') as ready_lots,
        COUNT(*) FILTER (WHERE growth_stage = 'flowering') as flowering_lots
      FROM lots
      WHERE deleted_at IS NULL
    `;
    const lotsResult = await client.query(lotsQuery);
    console.log(lotsResult.rows[0]);

    // 8. Test Sales Report Query for Last 30 Days
    console.log('\n8. SALES REPORT DATA (Last 30 Days):');
    const salesReportQuery = `
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    `;
    const salesReportResult = await client.query(salesReportQuery);
    console.log(salesReportResult.rows[0]);

    // 9. Check if there's data in different date ranges
    console.log('\n9. ORDERS BY DATE RANGE:');
    const dateRangeQuery = `
      SELECT
        'Today' as period,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at::date = CURRENT_DATE

      UNION ALL

      SELECT
        'Last 7 Days',
        COUNT(*),
        COALESCE(SUM(total_amount), 0)
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'

      UNION ALL

      SELECT
        'Last 30 Days',
        COUNT(*),
        COALESCE(SUM(total_amount), 0)
      FROM orders
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'

      UNION ALL

      SELECT
        'All Time',
        COUNT(*),
        COALESCE(SUM(total_amount), 0)
      FROM orders
      WHERE deleted_at IS NULL
    `;
    const dateRangeResult = await client.query(dateRangeQuery);
    console.log(dateRangeResult.rows);

    console.log('\n=== SUMMARY ===');
    console.log('✓ Data check complete');
    console.log('\nRecommendations:');

    const totalOrders = parseInt(ordersResult.rows[0].total_orders);
    const totalPayments = parseInt(paymentsResult.rows[0].total_payments);

    if (totalOrders === 0) {
      console.log('⚠️  No orders found - Charts will be empty!');
      console.log('   → Need to seed sample orders');
    } else if (totalOrders < 5) {
      console.log('⚠️  Very few orders (' + totalOrders + ') - Charts may look sparse');
      console.log('   → Consider seeding more sample data');
    } else {
      console.log('✓ Sufficient order data (' + totalOrders + ' orders)');
    }

    if (totalPayments === 0) {
      console.log('⚠️  No payments found - Payment charts will be empty!');
      console.log('   → Need to seed sample payments');
    } else {
      console.log('✓ Payment data exists (' + totalPayments + ' payments)');
    }

  } catch (error) {
    console.error('Error checking data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the check
checkReportData();
