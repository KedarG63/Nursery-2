/**
 * Test Script: Stock Alert Service
 * Tests Issue #78 - Low stock alerts for SKUs
 */

require('dotenv').config();
const db = require('./utils/db');

async function testStockAlerts() {
  console.log('\n🧪 Testing Stock Alert Service (Issue #78)\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Check SKUs with stock levels
    console.log('\n📋 Step 1: Checking SKUs and their stock levels...\n');

    const skusQuery = `
      SELECT
        s.id,
        s.sku_code,
        p.name as product_name,
        s.min_stock_level,
        s.max_stock_level,
        s.reorder_point,
        s.last_stock_alert_sent_at,
        COALESCE(SUM(l.available_quantity), 0) as current_stock
      FROM skus s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN lots l ON l.sku_id = s.id
        AND l.growth_stage IN ('ready', 'sold')
      WHERE s.sku_code LIKE 'SKU-TEST-%'
      GROUP BY s.id, s.sku_code, p.name, s.min_stock_level, s.max_stock_level, s.reorder_point, s.last_stock_alert_sent_at
      ORDER BY s.sku_code;
    `;

    const skus = await db.query(skusQuery);

    console.log(`Found ${skus.rows.length} test SKUs:\n`);
    skus.rows.forEach((sku) => {
      console.log(`   SKU: ${sku.sku_code}`);
      console.log(`   Product: ${sku.product_name}`);
      console.log(`   Current Stock: ${sku.current_stock}`);
      console.log(`   Min Level: ${sku.min_stock_level}`);
      console.log(`   Reorder Point: ${sku.reorder_point}`);
      console.log(`   Max Level: ${sku.max_stock_level}`);

      const stockPercentage = (sku.current_stock / sku.min_stock_level) * 100;
      if (sku.current_stock < sku.min_stock_level) {
        console.log(`   ⚠️  LOW STOCK ALERT! (${stockPercentage.toFixed(1)}% of minimum)`);
      } else {
        console.log(`   ✅ Stock OK (${stockPercentage.toFixed(1)}% of minimum)`);
      }

      if (sku.last_stock_alert_sent_at) {
        console.log(`   Last Alert: ${sku.last_stock_alert_sent_at}`);
      }
      console.log('');
    });

    // Step 2: Check stock alert history
    console.log('\n📋 Step 2: Checking stock alert history...\n');

    const historyQuery = `
      SELECT
        sah.id,
        sah.sku_id,
        s.sku_code,
        sah.current_stock,
        sah.min_stock_level,
        sah.reorder_quantity,
        sah.alert_sent_at
      FROM stock_alert_history sah
      JOIN skus s ON sah.sku_id = s.id
      ORDER BY sah.alert_sent_at DESC
      LIMIT 10;
    `;

    const history = await db.query(historyQuery);

    if (history.rows.length === 0) {
      console.log('   ℹ️  No stock alert history found\n');
    } else {
      console.log(`Found ${history.rows.length} stock alert records:\n`);
      history.rows.forEach((alert) => {
        console.log(`   SKU: ${alert.sku_code}`);
        console.log(`   Current: ${alert.current_stock} / Min: ${alert.min_stock_level}`);
        console.log(`   Reorder Qty: ${alert.reorder_quantity}`);
        console.log(`   Alert Sent: ${alert.alert_sent_at}`);
        console.log('');
      });
    }

    // Step 3: Check in-app notifications
    console.log('\n📋 Step 3: Checking in-app notifications for stock alerts...\n');

    const notificationsQuery = `
      SELECT
        n.id,
        n.title,
        n.message,
        n.notification_type,
        n.priority,
        n.read as is_read,
        n.created_at
      FROM notifications n
      WHERE n.notification_type = 'stock_alert'
      ORDER BY n.created_at DESC
      LIMIT 10;
    `;

    const notifications = await db.query(notificationsQuery);

    if (notifications.rows.length === 0) {
      console.log('   ℹ️  No stock alert notifications found\n');
    } else {
      console.log(`Found ${notifications.rows.length} stock alert notifications:\n`);
      notifications.rows.forEach((notif) => {
        console.log(`   Title: ${notif.title}`);
        console.log(`   Message: ${notif.message}`);
        console.log(`   Priority: ${notif.priority}`);
        console.log(`   Read: ${notif.is_read ? 'Yes' : 'No'}`);
        console.log(`   Created: ${notif.created_at}`);
        console.log('');
      });
    }

    // Step 4: Run stock alert check for low stock SKU
    console.log('\n📋 Step 4: Running Stock Alert Service...\n');

    const lowStockSku = skus.rows.find(sku => sku.current_stock < sku.min_stock_level);

    if (lowStockSku) {
      console.log(`Testing stock alert for SKU: ${lowStockSku.sku_code}\n`);

      const StockAlertService = require('./services/stockAlertService');
      const stockAlertService = new StockAlertService();
      await stockAlertService.checkStockLevel(lowStockSku.id);
    } else {
      console.log('ℹ️  No low stock SKUs found for testing\n');
    }

    // Step 5: Verify results
    console.log('\n📋 Step 5: Verifying results...\n');

    const verifyHistory = await db.query(historyQuery);
    const verifyNotifications = await db.query(notificationsQuery);

    if (verifyHistory.rows.length > history.rows.length) {
      console.log(`✅ New alert created in stock_alert_history\n`);
    }

    if (verifyNotifications.rows.length > notifications.rows.length) {
      console.log(`✅ New in-app notification created\n`);
    }

    // Check notification logs
    const logsQuery = `
      SELECT COUNT(*) as count
      FROM notification_logs
      WHERE notification_type = 'stock_alert'
        AND created_at > NOW() - INTERVAL '5 minutes';
    `;

    const logs = await db.query(logsQuery);

    console.log('═'.repeat(60));
    console.log('\n✅ TEST RESULTS:\n');
    console.log(`   📊 Total SKUs checked: ${skus.rows.length}`);
    console.log(`   ⚠️  Low stock SKUs: ${skus.rows.filter(s => s.current_stock < s.min_stock_level).length}`);
    console.log(`   📋 Alert history records: ${verifyHistory.rows.length}`);
    console.log(`   🔔 In-app notifications: ${verifyNotifications.rows.length}`);
    console.log(`   📨 Notification logs (last 5 min): ${logs.rows[0].count}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('\n✅ Stock Alert Service test completed!\n');

    await db.closePool();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await db.closePool();
    process.exit(1);
  }
}

testStockAlerts();
