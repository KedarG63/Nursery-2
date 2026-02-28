/**
 * Test Script: Ready Notification Job
 * Tests Issue #75 - Scheduled job for ready notifications
 */

require('dotenv').config();
const db = require('./utils/db');

async function testReadyNotifications() {
  console.log('\n🧪 Testing Ready Notification Job (Issue #75)\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Check for lots that should trigger notifications
    console.log('\n📋 Step 1: Checking for lots with expected ready dates...\n');

    const lotsQuery = `
      SELECT
        l.id,
        l.lot_number,
        l.expected_ready_date,
        l.ready_notification_sent,
        l.ready_notification_sent_at,
        s.sku_code,
        p.name as product_name
      FROM lots l
      JOIN skus s ON l.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE l.expected_ready_date BETWEEN CURRENT_DATE - INTERVAL '1 day'
                                      AND CURRENT_DATE + INTERVAL '1 day'
      ORDER BY l.expected_ready_date;
    `;

    const lots = await db.query(lotsQuery);

    console.log(`Found ${lots.rows.length} lots with ready dates near today:\n`);
    lots.rows.forEach((lot) => {
      console.log(`   Lot: ${lot.lot_number}`);
      console.log(`   Product: ${lot.product_name} (${lot.sku_code})`);
      console.log(`   Expected Ready: ${lot.expected_ready_date.toDateString()}`);
      console.log(`   Notification Sent: ${lot.ready_notification_sent ? '✅ YES' : '❌ NO'}`);
      if (lot.ready_notification_sent_at) {
        console.log(`   Sent At: ${lot.ready_notification_sent_at}`);
      }
      console.log('');
    });

    // Step 2: Find orders associated with these lots
    console.log('\n📋 Step 2: Finding orders associated with these lots...\n');

    const ordersQuery = `
      SELECT DISTINCT
        o.id,
        o.order_number,
        o.status,
        c.name as customer_name,
        c.phone as customer_phone,
        l.lot_number
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN lots l ON oi.lot_id = l.id
      JOIN customers c ON o.customer_id = c.id
      WHERE l.expected_ready_date BETWEEN CURRENT_DATE - INTERVAL '1 day'
                                      AND CURRENT_DATE + INTERVAL '1 day'
        AND l.ready_notification_sent = FALSE
      ORDER BY o.order_number;
    `;

    const orders = await db.query(ordersQuery);

    console.log(`Found ${orders.rows.length} orders that should receive notifications:\n`);
    orders.rows.forEach((order) => {
      console.log(`   Order: ${order.order_number} (${order.status})`);
      console.log(`   Customer: ${order.customer_name}`);
      console.log(`   Phone: ${order.customer_phone}`);
      console.log(`   Lot: ${order.lot_number}`);
      console.log('');
    });

    // Step 3: Check notification_logs table
    console.log('\n📋 Step 3: Checking notification logs...\n');

    const logsQuery = `
      SELECT
        notification_type,
        entity_type,
        status,
        recipient_phone,
        template_name,
        sent_at,
        error_message
      FROM notification_logs
      WHERE notification_type = 'ready_notification'
      ORDER BY created_at DESC
      LIMIT 10;
    `;

    const logs = await db.query(logsQuery);

    if (logs.rows.length === 0) {
      console.log('   ℹ️  No notification logs found for ready_notification type\n');
    } else {
      console.log(`Found ${logs.rows.length} notification log entries:\n`);
      logs.rows.forEach((log, index) => {
        console.log(`   ${index + 1}. Type: ${log.notification_type}`);
        console.log(`      Status: ${log.status}`);
        console.log(`      Phone: ${log.recipient_phone}`);
        console.log(`      Template: ${log.template_name}`);
        console.log(`      Sent At: ${log.sent_at || 'Not sent yet'}`);
        if (log.error_message) {
          console.log(`      Error: ${log.error_message}`);
        }
        console.log('');
      });
    }

    // Step 4: Simulate running the job
    console.log('\n📋 Step 4: Running Ready Notification Job...\n');

    const ReadyNotificationJob = require('./jobs/readyNotificationJob');
    await ReadyNotificationJob.processReadyNotifications();

    // Step 5: Verify results
    console.log('\n📋 Step 5: Verifying notification results...\n');

    const verifyQuery = `
      SELECT
        l.lot_number,
        l.ready_notification_sent,
        l.ready_notification_sent_at
      FROM lots l
      WHERE l.expected_ready_date BETWEEN CURRENT_DATE - INTERVAL '1 day'
                                      AND CURRENT_DATE + INTERVAL '1 day';
    `;

    const verified = await db.query(verifyQuery);

    console.log('Updated lot notification status:\n');
    verified.rows.forEach((lot) => {
      console.log(`   ${lot.lot_number}:`);
      console.log(`   - Notification Sent: ${lot.ready_notification_sent ? '✅ YES' : '❌ NO'}`);
      if (lot.ready_notification_sent_at) {
        console.log(`   - Sent At: ${lot.ready_notification_sent_at}`);
      }
      console.log('');
    });

    // Final logs check
    const finalLogsQuery = `
      SELECT COUNT(*) as count
      FROM notification_logs
      WHERE notification_type = 'ready_notification'
        AND created_at > NOW() - INTERVAL '5 minutes';
    `;

    const finalLogs = await db.query(finalLogsQuery);
    const newLogsCount = finalLogs.rows[0].count;

    console.log('\n═'.repeat(60));
    console.log('\n✅ TEST RESULTS:\n');
    console.log(`   📊 Lots near ready date: ${lots.rows.length}`);
    console.log(`   📦 Orders to notify: ${orders.rows.length}`);
    console.log(`   📨 Notifications created (last 5 min): ${newLogsCount}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('\n✅ Ready Notification Job test completed!\n');

    await db.closePool();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await db.closePool();
    process.exit(1);
  }
}

testReadyNotifications();
