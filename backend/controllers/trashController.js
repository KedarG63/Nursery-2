/**
 * Trash Controller
 * Recycle bin: list, restore, and permanently delete soft-deleted records.
 * Records stay in trash for 30 days before automatic purge.
 */

const pool = require('../config/database');

const TRASH_RETENTION_DAYS = 30;

// ─── Helpers ────────────────────────────────────────────────────────────────

const daysRemaining = (deletedAt) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  const expiry = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * msPerDay;
  return Math.max(0, Math.ceil((expiry - Date.now()) / msPerDay));
};

// ─── GET /api/trash ──────────────────────────────────────────────────────────

const listTrash = async (req, res) => {
  try {
    const { types = 'lots,orders,customers,purchases', page = 1, limit = 50 } = req.query;
    const requestedTypes = types.split(',').map((t) => t.trim());
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (Math.max(1, parseInt(page)) - 1) * limitNum;

    const cutoff = `NOW() - INTERVAL '${TRASH_RETENTION_DAYS} days'`;
    const rows = [];

    if (requestedTypes.includes('lots')) {
      const r = await pool.query(`
        SELECT
          'lot' AS entity_type,
          l.id  AS entity_id,
          l.lot_number AS entity_name,
          l.deleted_at,
          u.full_name AS deleted_by_name
        FROM lots l
        LEFT JOIN users u ON u.id = l.deleted_by
        WHERE l.deleted_at IS NOT NULL AND l.deleted_at > ${cutoff}
        ORDER BY l.deleted_at DESC
      `);
      rows.push(...r.rows);
    }

    if (requestedTypes.includes('orders')) {
      const r = await pool.query(`
        SELECT
          'order' AS entity_type,
          o.id    AS entity_id,
          o.order_number AS entity_name,
          o.deleted_at,
          u.full_name AS deleted_by_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.deleted_by
        WHERE o.deleted_at IS NOT NULL AND o.deleted_at > ${cutoff}
        ORDER BY o.deleted_at DESC
      `);
      rows.push(...r.rows);
    }

    if (requestedTypes.includes('customers')) {
      const r = await pool.query(`
        SELECT
          'customer' AS entity_type,
          c.id       AS entity_id,
          c.name     AS entity_name,
          c.deleted_at,
          u.full_name AS deleted_by_name
        FROM customers c
        LEFT JOIN users u ON u.id = c.deleted_by
        WHERE c.deleted_at IS NOT NULL AND c.deleted_at > ${cutoff}
        ORDER BY c.deleted_at DESC
      `);
      rows.push(...r.rows);
    }

    if (requestedTypes.includes('purchases')) {
      const r = await pool.query(`
        SELECT
          'purchase'     AS entity_type,
          sp.id          AS entity_id,
          sp.purchase_number AS entity_name,
          sp.deleted_at,
          u.full_name    AS deleted_by_name
        FROM seed_purchases sp
        LEFT JOIN users u ON u.id = sp.deleted_by
        WHERE sp.deleted_at IS NOT NULL AND sp.deleted_at > ${cutoff}
        ORDER BY sp.deleted_at DESC
      `);
      rows.push(...r.rows);
    }

    // Sort combined result by deleted_at desc, apply pagination
    rows.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    const total = rows.length;
    const paginated = rows.slice(offset, offset + limitNum).map((row) => ({
      ...row,
      days_remaining: daysRemaining(row.deleted_at),
    }));

    res.json({
      success: true,
      data: paginated,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List Trash Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trash' });
  }
};

// ─── GET /api/trash/count ────────────────────────────────────────────────────

const getTrashCount = async (req, res) => {
  try {
    const cutoff = `NOW() - INTERVAL '${TRASH_RETENTION_DAYS} days'`;
    const urgentCutoff = `NOW() - INTERVAL '${TRASH_RETENTION_DAYS - 7} days'`;

    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM lots         WHERE deleted_at IS NOT NULL AND deleted_at > ${cutoff}) +
        (SELECT COUNT(*) FROM orders       WHERE deleted_at IS NOT NULL AND deleted_at > ${cutoff}) +
        (SELECT COUNT(*) FROM customers    WHERE deleted_at IS NOT NULL AND deleted_at > ${cutoff}) +
        (SELECT COUNT(*) FROM seed_purchases WHERE deleted_at IS NOT NULL AND deleted_at > ${cutoff})
        AS total,
        (SELECT COUNT(*) FROM lots         WHERE deleted_at IS NOT NULL AND deleted_at <= ${urgentCutoff}) +
        (SELECT COUNT(*) FROM orders       WHERE deleted_at IS NOT NULL AND deleted_at <= ${urgentCutoff}) +
        (SELECT COUNT(*) FROM customers    WHERE deleted_at IS NOT NULL AND deleted_at <= ${urgentCutoff}) +
        (SELECT COUNT(*) FROM seed_purchases WHERE deleted_at IS NOT NULL AND deleted_at <= ${urgentCutoff})
        AS expiring_soon
    `);

    res.json({ success: true, data: r.rows[0] });
  } catch (error) {
    console.error('Trash Count Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trash count' });
  }
};

// ─── POST /api/trash/lots/:id/restore ───────────────────────────────────────

const restoreLot = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const lotResult = await client.query(
      `SELECT l.*, s.variety, p.name AS product_name
       FROM lots l
       JOIN skus s ON s.id = l.sku_id
       JOIN products p ON p.id = s.product_id
       WHERE l.id = $1 AND l.deleted_at IS NOT NULL`,
      [id]
    );

    if (lotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Lot not found in trash' });
    }

    const lot = lotResult.rows[0];

    // Restore lot
    await client.query(
      `UPDATE lots SET deleted_at = NULL, deleted_by = NULL, updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );

    // Reverse seed restoration: deduct seeds back from the linked purchase
    const seedsToDeduct = parseInt(lot.seeds_used_count || 0);
    if (lot.seed_purchase_id && seedsToDeduct > 0) {
      await client.query(
        `UPDATE seed_purchases
         SET seeds_used      = COALESCE(seeds_used, 0) + $1,
             seeds_remaining = GREATEST(0, COALESCE(seeds_remaining, 0) - $1),
             inventory_status = CASE
               WHEN (GREATEST(0, COALESCE(seeds_remaining, 0) - $1)) <= 0 THEN 'exhausted'::seed_inventory_status_enum
               WHEN (GREATEST(0, COALESCE(seeds_remaining, 0) - $1))::DECIMAL / NULLIF(total_seeds, 0) < 0.1 THEN 'low_stock'::seed_inventory_status_enum
               ELSE 'available'::seed_inventory_status_enum
             END,
             updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL`,
        [seedsToDeduct, lot.seed_purchase_id]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, message: `Lot ${lot.lot_number} restored successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restore Lot Error:', error);
    res.status(500).json({ success: false, error: 'Failed to restore lot' });
  } finally {
    client.release();
  }
};

// ─── POST /api/trash/orders/:id/restore ─────────────────────────────────────

const restoreOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Order not found in trash' });
    }

    const order = orderResult.rows[0];

    // Restore order and its items
    await client.query(
      `UPDATE orders SET deleted_at = NULL, deleted_by = NULL, updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );
    await client.query(
      `UPDATE order_items SET deleted_at = NULL, updated_at = NOW() WHERE order_id = $1`,
      [id]
    );

    // Recalculate customer credit used
    if (order.customer_id && order.total_amount) {
      await client.query(
        `UPDATE customer_credit
         SET credit_used = COALESCE(credit_used, 0) + $1,
             updated_at  = NOW()
         WHERE customer_id = $2`,
        [parseFloat(order.total_amount), order.customer_id]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, message: `Order ${order.order_number} restored successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restore Order Error:', error);
    res.status(500).json({ success: false, error: 'Failed to restore order' });
  } finally {
    client.release();
  }
};

// ─── POST /api/trash/customers/:id/restore ──────────────────────────────────

const restoreCustomer = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const custResult = await client.query(
      `SELECT * FROM customers WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    if (custResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Customer not found in trash' });
    }

    const customer = custResult.rows[0];

    // Check for conflicts with active customers
    const conflictCheck = await client.query(
      `SELECT id FROM customers
       WHERE deleted_at IS NULL AND id != $1
         AND (phone = $2 OR (email IS NOT NULL AND email = $3))`,
      [id, customer.phone, customer.email]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Cannot restore: another active customer with the same phone or email already exists',
      });
    }

    await client.query(
      `UPDATE customers SET deleted_at = NULL, deleted_by = NULL, updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: `Customer ${customer.name} restored successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restore Customer Error:', error);
    res.status(500).json({ success: false, error: 'Failed to restore customer' });
  } finally {
    client.release();
  }
};

// ─── POST /api/trash/purchases/:id/restore ──────────────────────────────────

const restorePurchase = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const purchaseResult = await client.query(
      `SELECT * FROM seed_purchases WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    if (purchaseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Purchase not found in trash' });
    }

    const purchase = purchaseResult.rows[0];

    await client.query(
      `UPDATE seed_purchases SET deleted_at = NULL, deleted_by = NULL, updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: `Purchase ${purchase.purchase_number} restored successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restore Purchase Error:', error);
    res.status(500).json({ success: false, error: 'Failed to restore purchase' });
  } finally {
    client.release();
  }
};

// ─── DELETE /api/trash/:type/:id/permanent ───────────────────────────────────

const permanentDelete = async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, id } = req.params;

    const tableMap = {
      lot: 'lots',
      order: 'orders',
      customer: 'customers',
      purchase: 'seed_purchases',
    };

    const table = tableMap[type];
    if (!table) {
      return res.status(400).json({ success: false, error: `Unknown entity type: ${type}` });
    }

    await client.query('BEGIN');

    // Verify it's in trash first
    const check = await client.query(
      `SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Record not found in trash' });
    }

    // For orders, delete items first (FK)
    if (type === 'order') {
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);
    }

    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Permanently deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Permanent Delete Error:', error);
    res.status(500).json({ success: false, error: 'Failed to permanently delete record' });
  } finally {
    client.release();
  }
};

module.exports = {
  listTrash,
  getTrashCount,
  restoreLot,
  restoreOrder,
  restoreCustomer,
  restorePurchase,
  permanentDelete,
};
