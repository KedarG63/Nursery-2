/**
 * Test Script: Payment Reminder Job
 * Tests Issue #76 - 3-tier payment reminder system
 */

require('dotenv').config();
const db = require('./utils/db');

async function testPaymentReminders() {
  console.log('\n🧪 Testing Payment Reminder Job (Issue #76)\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Check payment installments
    console.log('\n📋 Step 1: Checking payment installments...\n');

    const installmentsQuery = `
      SELECT
        pi.id,
        pi.installment_number,
        pi.total_installments,
        pi.amount,
        pi.due_date,
        pi.status,
        pi.last_reminder_sent_at,
        pi.reminder_count,
        pi.escalated,
        o.order_number,
        c.name as customer_name,
        c.phone,
        (CURRENT_DATE - pi.due_date) as days_overdue,
        (pi.due_date - CURRENT_DATE) as days_until_due
      FROM payment_installments pi
      JOIN orders o ON pi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE pi.status IN ('pending', 'overdue')
      ORDER BY pi.due_date;
    `;

    const installments = await db.query(installmentsQuery);

    console.log(`Found ${installments.rows.length} pending/overdue installments:\n`);
    installments.rows.forEach((inst) => {
      console.log(`   Installment ${inst.installment_number}/${inst.total_installments}:`);
      console.log(`   Order: ${inst.order_number}`);
      console.log(`   Customer: ${inst.customer_name} (${inst.phone})`);
      console.log(`   Amount: ₹${inst.amount}`);
      console.log(`   Due Date: ${inst.due_date.toDateString()}`);
      console.log(`   Status: ${inst.status}`);

      if (inst.days_overdue > 0) {
        console.log(`   Days Overdue: ${inst.days_overdue} days`);
      } else if (inst.days_until_due >= 0) {
        console.log(`   Days Until Due: ${inst.days_until_due} days`);
      }

      console.log(`   Reminder Count: ${inst.reminder_count || 0}`);
      console.log(`   Escalated: ${inst.escalated ? '✅ YES' : '❌ NO'}`);
      if (inst.last_reminder_sent_at) {
        console.log(`   Last Reminder: ${inst.last_reminder_sent_at}`);
      }
      console.log('');
    });

    // Step 2: Check notification logs
    console.log('\n📋 Step 2: Checking payment reminder notification logs...\n');

    const logsQuery = `
      SELECT
        notification_type,
        status,
        recipient_phone,
        template_name,
        sent_at,
        created_at
      FROM notification_logs
      WHERE notification_type LIKE '%payment%'
      ORDER BY created_at DESC
      LIMIT 10;
    `;

    const logs = await db.query(logsQuery);

    if (logs.rows.length === 0) {
      console.log('   ℹ️  No payment reminder logs found\n');
    } else {
      console.log(`Found ${logs.rows.length} payment reminder log entries:\n`);
      logs.rows.forEach((log, index) => {
        console.log(`   ${index + 1}. Type: ${log.notification_type}`);
        console.log(`      Status: ${log.status}`);
        console.log(`      Phone: ${log.recipient_phone}`);
        console.log(`      Template: ${log.template_name}`);
        console.log(`      Created: ${log.created_at}`);
        console.log('');
      });
    }

    // Step 3: Run the payment reminder job
    console.log('\n📋 Step 3: Running Payment Reminder Job...\n');

    const PaymentReminderJob = require('./jobs/paymentReminderJob');
    await PaymentReminderJob.processPaymentReminders();

    // Step 4: Verify results
    console.log('\n📋 Step 4: Verifying reminder results...\n');

    const verifyQuery = `
      SELECT
        pi.installment_number,
        pi.total_installments,
        pi.amount,
        pi.due_date,
        pi.status,
        pi.reminder_count,
        pi.escalated,
        pi.last_reminder_sent_at,
        o.order_number,
        (CURRENT_DATE - pi.due_date) as days_overdue
      FROM payment_installments pi
      JOIN orders o ON pi.order_id = o.id
      WHERE pi.status IN ('pending', 'overdue')
      ORDER BY pi.due_date;
    `;

    const verified = await db.query(verifyQuery);

    console.log('Updated installment status:\n');
    verified.rows.forEach((inst) => {
      console.log(`   ${inst.order_number} - Installment ${inst.installment_number}/${inst.total_installments}:`);
      console.log(`   Amount: ₹${inst.amount}`);
      console.log(`   Status: ${inst.status}`);
      console.log(`   Reminder Count: ${inst.reminder_count || 0}`);
      console.log(`   Escalated: ${inst.escalated ? '✅ YES' : '❌ NO'}`);
      if (inst.last_reminder_sent_at) {
        console.log(`   Last Reminder: ${inst.last_reminder_sent_at}`);
      }
      console.log('');
    });

    // Check final logs
    const finalLogsQuery = `
      SELECT COUNT(*) as count, notification_type
      FROM notification_logs
      WHERE notification_type LIKE '%payment%'
        AND created_at > NOW() - INTERVAL '5 minutes'
      GROUP BY notification_type;
    `;

    const finalLogs = await db.query(finalLogsQuery);

    console.log('\n═'.repeat(60));
    console.log('\n✅ TEST RESULTS:\n');
    console.log(`   📊 Pending/Overdue Installments: ${installments.rows.length}`);

    if (finalLogs.rows.length > 0) {
      console.log(`   📨 Notifications sent (last 5 min):`);
      finalLogs.rows.forEach((log) => {
        console.log(`      - ${log.notification_type}: ${log.count}`);
      });
    } else {
      console.log(`   📨 Notifications sent (last 5 min): 0`);
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('\n✅ Payment Reminder Job test completed!\n');

    await db.closePool();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await db.closePool();
    process.exit(1);
  }
}

testPaymentReminders();
