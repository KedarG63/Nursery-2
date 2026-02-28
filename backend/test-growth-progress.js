/**
 * Test Script: Growth Progress Job
 * Tests Issue #77 - Weekly photo notifications for growing lots
 */

require('dotenv').config();
const db = require('./utils/db');

async function testGrowthProgress() {
  console.log('\n🧪 Testing Growth Progress Job (Issue #77)\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Check for active orders with growing lots
    console.log('\n📋 Step 1: Checking active orders with growing lots...\n');

    const ordersQuery = `
      SELECT DISTINCT
        o.id as order_id,
        o.order_number,
        o.status,
        c.name as customer_name,
        c.phone,
        COUNT(DISTINCT l.id) as lot_count
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN lots l ON oi.lot_id = l.id
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status IN ('confirmed', 'preparing')
        AND l.growth_stage IN ('seed', 'germination', 'seedling', 'transplant')
      GROUP BY o.id, o.order_number, o.status, c.name, c.phone
      ORDER BY o.order_number;
    `;

    const orders = await db.query(ordersQuery);

    console.log(`Found ${orders.rows.length} active orders with growing lots:\n`);
    orders.rows.forEach((order) => {
      console.log(`   Order: ${order.order_number} (${order.status})`);
      console.log(`   Customer: ${order.customer_name} (${order.phone})`);
      console.log(`   Growing Lots: ${order.lot_count}`);
      console.log('');
    });

    // Step 2: Check lot photos
    console.log('\n📋 Step 2: Checking lot photos...\n');

    const photosQuery = `
      SELECT
        lp.id,
        lp.lot_id,
        l.lot_number,
        lp.photo_url,
        lp.growth_stage,
        lp.captured_at,
        lp.notes
      FROM lot_photos lp
      JOIN lots l ON lp.lot_id = l.id
      ORDER BY lp.captured_at DESC
      LIMIT 10;
    `;

    const photos = await db.query(photosQuery);

    if (photos.rows.length === 0) {
      console.log('   ℹ️  No lot photos found in database\n');
      console.log('   Note: Creating sample photo for testing...\n');

      // Create a sample photo for testing
      const sampleLot = await db.query('SELECT id FROM lots LIMIT 1');
      if (sampleLot.rows.length > 0) {
        await db.query(
          `INSERT INTO lot_photos (lot_id, photo_url, growth_stage, captured_at, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sampleLot.rows[0].id,
            'https://example.com/photos/test-lot-growth.jpg',
            'ready',
            new Date(),
            'Test growth photo for Phase 16 testing'
          ]
        );
        console.log('   ✅ Sample photo created\n');
      }
    } else {
      console.log(`Found ${photos.rows.length} lot photos:\n`);
      photos.rows.forEach((photo) => {
        console.log(`   Photo ID: ${photo.id}`);
        console.log(`   Lot: ${photo.lot_number}`);
        console.log(`   Growth Stage: ${photo.growth_stage}`);
        console.log(`   Captured: ${photo.captured_at}`);
        console.log(`   URL: ${photo.photo_url}`);
        console.log('');
      });
    }

    // Step 3: Check weekly notification tracking
    console.log('\n📋 Step 3: Checking weekly photo notification history...\n');

    const weeklyQuery = `
      SELECT
        wpn.id,
        wpn.order_id,
        o.order_number,
        wpn.week_number,
        wpn.year,
        wpn.sent_at
      FROM weekly_photo_notifications wpn
      JOIN orders o ON wpn.order_id = o.id
      ORDER BY wpn.year DESC, wpn.week_number DESC
      LIMIT 10;
    `;

    const weekly = await db.query(weeklyQuery);

    if (weekly.rows.length === 0) {
      console.log('   ℹ️  No weekly photo notifications sent yet\n');
    } else {
      console.log(`Found ${weekly.rows.length} weekly notification records:\n`);
      weekly.rows.forEach((record) => {
        console.log(`   Order: ${record.order_number}`);
        console.log(`   Week: ${record.year}-W${record.week_number}`);
        console.log(`   Sent At: ${record.sent_at}`);
        console.log('');
      });
    }

    // Step 4: Run the growth progress job
    console.log('\n📋 Step 4: Running Growth Progress Job...\n');

    const GrowthProgressJob = require('./jobs/growthProgressJob');
    await GrowthProgressJob.sendGrowthProgressPhotos();

    // Step 5: Verify results
    console.log('\n📋 Step 5: Verifying results...\n');

    const verifyWeekly = await db.query(weeklyQuery);

    if (verifyWeekly.rows.length > weekly.rows.length) {
      console.log('✅ New weekly notification records created:\n');
      verifyWeekly.rows.slice(0, verifyWeekly.rows.length - weekly.rows.length).forEach((record) => {
        console.log(`   Order: ${record.order_number}`);
        console.log(`   Week: ${record.year}-W${record.week_number}`);
        console.log(`   Sent At: ${record.sent_at}`);
        console.log('');
      });
    } else {
      console.log('ℹ️  No new notifications sent (may have already been sent this week)\n');
    }

    // Check notification logs
    const logsQuery = `
      SELECT COUNT(*) as count
      FROM notification_logs
      WHERE notification_type = 'growth_progress'
        AND created_at > NOW() - INTERVAL '5 minutes';
    `;

    const logs = await db.query(logsQuery);

    console.log('\n═'.repeat(60));
    console.log('\n✅ TEST RESULTS:\n');
    console.log(`   📊 Active orders with growing lots: ${orders.rows.length}`);
    console.log(`   📸 Total lot photos in database: ${photos.rows.length}`);
    console.log(`   📅 Weekly notifications tracked: ${verifyWeekly.rows.length}`);
    console.log(`   📨 Notifications sent (last 5 min): ${logs.rows[0].count}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('\n✅ Growth Progress Job test completed!\n');

    await db.closePool();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await db.closePool();
    process.exit(1);
  }
}

testGrowthProgress();
