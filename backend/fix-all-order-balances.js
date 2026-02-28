require('dotenv').config();
const pool = require('./config/database');

async function fixAllOrderBalances() {
  try {
    console.log('=== Checking All Order Balances ===\n');

    // Get all orders
    const ordersResult = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.balance_amount
      FROM orders o
      WHERE o.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `);

    console.log(`Found ${ordersResult.rows.length} orders to check\n`);

    let fixedCount = 0;
    let issueCount = 0;

    for (const order of ordersResult.rows) {
      // Get all successful payments for this order
      const paymentsResult = await pool.query(
        `SELECT SUM(amount) as total_paid
         FROM payments
         WHERE order_id = $1
         AND status = 'success'
         AND deleted_at IS NULL`,
        [order.id]
      );

      const totalPaid = parseFloat(paymentsResult.rows[0].total_paid || 0);
      const expectedPaid = parseFloat(order.paid_amount);
      const expectedBalance = parseFloat(order.total_amount) - totalPaid;
      const actualBalance = parseFloat(order.balance_amount);

      // Check for mismatches
      if (Math.abs(expectedPaid - totalPaid) > 0.01 || Math.abs(expectedBalance - actualBalance) > 0.01) {
        issueCount++;
        console.log(`⚠️  Order ${order.order_number || order.id}:`);
        console.log(`   Total: ₹${order.total_amount}`);
        console.log(`   Expected Paid: ₹${totalPaid.toFixed(2)} | Actual: ₹${expectedPaid.toFixed(2)}`);
        console.log(`   Expected Balance: ₹${expectedBalance.toFixed(2)} | Actual: ₹${actualBalance.toFixed(2)}`);

        // Fix it
        await pool.query(
          `UPDATE orders
           SET paid_amount = $1,
               balance_amount = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [totalPaid, expectedBalance, order.id]
        );

        console.log(`   ✓ Fixed\n`);
        fixedCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total orders checked: ${ordersResult.rows.length}`);
    console.log(`Orders with issues: ${issueCount}`);
    console.log(`Orders fixed: ${fixedCount}`);
    console.log(`Orders correct: ${ordersResult.rows.length - issueCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixAllOrderBalances();
