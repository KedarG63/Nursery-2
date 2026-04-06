/**
 * Trash Purge Job
 * Runs daily at midnight — hard-deletes records soft-deleted more than 30 days ago.
 * Purge order respects FK constraints: order_items → orders, lots, purchases, customers
 */

const cron = require('node-cron');
const pool = require('../config/database');

const RETENTION_DAYS = 30;

async function purgeTrash() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Running trash purge job...');
    await client.query('BEGIN');

    const cutoff = `NOW() - INTERVAL '${RETENTION_DAYS} days'`;

    // 1. order_items (FK child of orders)
    const oi = await client.query(
      `DELETE FROM order_items
       WHERE order_id IN (
         SELECT id FROM orders WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}
       )`
    );

    // 2. orders
    const o = await client.query(
      `DELETE FROM orders WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`
    );

    // 3. lots
    const l = await client.query(
      `DELETE FROM lots WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`
    );

    // 4. seed_purchases
    const sp = await client.query(
      `DELETE FROM seed_purchases WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`
    );

    // 5. customers (last — orders FK may reference them)
    const c = await client.query(
      `DELETE FROM customers WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`
    );

    await client.query('COMMIT');

    const total = (oi.rowCount || 0) + (o.rowCount || 0) + (l.rowCount || 0) +
                  (sp.rowCount || 0) + (c.rowCount || 0);
    console.log(`✅ Trash purge complete: ${total} records permanently deleted`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Trash purge job failed:', error.message);
  } finally {
    client.release();
  }
}

function initTrashPurgeJob() {
  // Run daily at midnight
  cron.schedule('0 0 * * *', purgeTrash);
  console.log('🗑️  Trash purge job scheduled (daily at midnight)');
}

module.exports = { initTrashPurgeJob, purgeTrash };
