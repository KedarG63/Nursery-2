/**
 * Quick script to check actual payment dates
 */

const pool = require('./config/database');

async function checkPaymentDates() {
  try {
    console.log('\n=== CHECKING PAYMENT DATES ===\n');

    // Get all successful payments with dates
    const result = await pool.query(`
      SELECT
        id,
        order_id,
        amount,
        payment_date,
        created_at,
        status
      FROM payments
      WHERE deleted_at IS NULL
      AND status = 'success'
      ORDER BY payment_date DESC
      LIMIT 30
    `);

    console.log(`Found ${result.rows.length} successful payments:\n`);

    result.rows.forEach((payment, index) => {
      console.log(`${index + 1}. Payment ID: ${payment.id}`);
      console.log(`   Amount: ₹${payment.amount}`);
      console.log(`   Payment Date: ${payment.payment_date}`);
      console.log(`   Created At: ${payment.created_at}`);
      console.log('');
    });

    // Summary
    const summary = await pool.query(`
      SELECT
        DATE(payment_date) as date,
        COUNT(*) as count,
        SUM(amount) as total
      FROM payments
      WHERE deleted_at IS NULL
      AND status = 'success'
      GROUP BY DATE(payment_date)
      ORDER BY date DESC
      LIMIT 10
    `);

    console.log('\n=== SUMMARY BY DATE ===\n');
    summary.rows.forEach(row => {
      console.log(`${row.date}: ${row.count} payments, ₹${row.total}`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPaymentDates();
