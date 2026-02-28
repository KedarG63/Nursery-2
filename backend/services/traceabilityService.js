/**
 * Traceability Service
 * Phase 22: Purchase & Seeds Management
 * Provides complete seed-to-plant lineage tracking
 */

const pool = require('../config/database');

/**
 * Get complete plant lineage from order item
 * Traces back from delivered plant to original seed purchase
 */
const getPlantLineage = async (orderItemId) => {
  try {
    const query = `
      SELECT
        -- Order Information
        oi.id as order_item_id,
        oi.quantity as plants_delivered,
        o.order_number,
        o.order_date,
        o.status as order_status,

        -- Customer Information
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,

        -- Product Information
        p.name as product_name,
        p.category as product_category,
        s.sku_code,

        -- Lot Information
        l.lot_number,
        l.planted_date,
        l.growth_stage,
        l.expected_ready_date,
        l.current_location,
        l.seeds_used_count,
        l.seed_cost_per_unit,
        l.total_seed_cost,

        -- Seed Purchase Information
        sp.purchase_number,
        sp.seed_lot_number as vendor_seed_lot,
        sp.purchase_date as seed_purchase_date,
        sp.cost_per_seed,
        sp.germination_rate,
        sp.purity_percentage,
        sp.expiry_date as seed_expiry_date,

        -- Vendor Information
        v.vendor_name,
        v.vendor_code,
        v.contact_person as vendor_contact,
        v.phone as vendor_phone,

        -- Usage History
        suh.seeds_allocated,
        suh.total_cost as seed_cost_for_lot,
        suh.allocated_at as seed_allocated_date,
        suh.notes as usage_notes

      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      JOIN lots l ON oi.lot_id = l.id
      JOIN skus s ON l.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      LEFT JOIN seed_usage_history suh ON suh.lot_id = l.id
      LEFT JOIN seed_purchases sp ON suh.seed_purchase_id = sp.id
      LEFT JOIN vendors v ON sp.vendor_id = v.id
      WHERE oi.id = $1
    `;

    const result = await pool.query(query, [orderItemId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting plant lineage:', error);
    throw error;
  }
};

/**
 * Get lot lineage - trace lot back to seed purchase
 */
const getLotLineage = async (lotId) => {
  try {
    const query = `
      SELECT
        -- Lot Information
        l.lot_number,
        l.sku_id,
        l.quantity as lot_quantity,
        l.growth_stage,
        l.planted_date,
        l.expected_ready_date,
        l.seeds_used_count,
        l.seed_cost_per_unit,
        l.total_seed_cost,

        -- Product/SKU Information
        p.name as product_name,
        p.category as product_category,
        p.growth_period_days,
        s.sku_code,
        s.size,
        s.container_type,

        -- Seed Purchase Information
        sp.purchase_number,
        sp.seed_lot_number,
        sp.purchase_date,
        sp.cost_per_seed,
        sp.germination_rate,
        sp.purity_percentage,

        -- Vendor Information
        v.vendor_name,
        v.vendor_code,

        -- Usage Details
        suh.seeds_allocated,
        suh.total_cost as seed_cost,
        suh.allocated_at,
        suh.allocated_by,
        u.email as allocated_by_email

      FROM lots l
      JOIN skus s ON l.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      LEFT JOIN seed_usage_history suh ON suh.lot_id = l.id
      LEFT JOIN seed_purchases sp ON suh.seed_purchase_id = sp.id
      LEFT JOIN vendors v ON sp.vendor_id = v.id
      LEFT JOIN users u ON suh.allocated_by = u.id
      WHERE l.id = $1
    `;

    const result = await pool.query(query, [lotId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting lot lineage:', error);
    throw error;
  }
};

/**
 * Get all lots created from a specific seed purchase
 */
const getSeedPurchaseLineage = async (seedPurchaseId) => {
  try {
    const query = `
      SELECT
        -- Seed Purchase Info
        sp.purchase_number,
        sp.seed_lot_number,
        sp.total_seeds,
        sp.seeds_used,
        sp.seeds_remaining,

        -- Lot Info
        l.lot_number,
        l.planted_date,
        l.growth_stage,
        l.quantity as lot_quantity,

        -- Product Info
        p.name as product_name,
        s.sku_code,

        -- Usage Info
        suh.seeds_allocated,
        suh.allocated_at,

        -- Order Info (if lot is allocated)
        COUNT(oi.id) as order_count,
        SUM(oi.quantity) as total_plants_sold

      FROM seed_purchases sp
      LEFT JOIN seed_usage_history suh ON suh.seed_purchase_id = sp.id
      LEFT JOIN lots l ON suh.lot_id = l.id
      LEFT JOIN skus s ON l.sku_id = s.id
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN order_items oi ON oi.lot_id = l.id
      WHERE sp.id = $1
      GROUP BY sp.id, sp.purchase_number, sp.seed_lot_number, sp.total_seeds,
               sp.seeds_used, sp.seeds_remaining, l.id, l.lot_number, l.planted_date,
               l.growth_stage, l.quantity, p.name, s.sku_code, suh.seeds_allocated,
               suh.allocated_at
      ORDER BY suh.allocated_at DESC
    `;

    const result = await pool.query(query, [seedPurchaseId]);

    return result.rows;
  } catch (error) {
    console.error('Error getting seed purchase lineage:', error);
    throw error;
  }
};

/**
 * Check seed availability and allocate for lot creation
 * This is the core function used when creating lots
 */
const checkAndAllocateSeed = async (productId, skuId, seedsNeeded, client) => {
  try {
    // Find available seed purchase (FIFO by expiry date)
    const query = `
      SELECT
        sp.*,
        v.vendor_name
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      WHERE sp.product_id = $1
        AND ($2::uuid IS NULL OR sp.sku_id = $2)
        AND sp.inventory_status = 'available'
        AND sp.expiry_date > CURRENT_DATE
        AND sp.seeds_remaining >= $3
        AND sp.deleted_at IS NULL
      ORDER BY sp.expiry_date ASC, sp.purchase_date ASC
      LIMIT 1
      FOR UPDATE  -- Lock the row for update
    `;

    const result = await client.query(query, [productId, skuId || null, seedsNeeded]);

    if (result.rows.length === 0) {
      return {
        available: false,
        message: 'Insufficient seeds available for this product/SKU',
        required: seedsNeeded,
      };
    }

    const seedPurchase = result.rows[0];

    return {
      available: true,
      seedPurchase,
      seeds_allocated: seedsNeeded,
      cost_per_seed: parseFloat(seedPurchase.cost_per_seed),
      total_seed_cost: seedsNeeded * parseFloat(seedPurchase.cost_per_seed),
    };
  } catch (error) {
    console.error('Error checking and allocating seed:', error);
    throw error;
  }
};

/**
 * Create seed usage history record
 * Called after lot creation to track seed allocation
 */
const recordSeedUsage = async (seedPurchaseId, lotId, seedsAllocated, costPerSeed, userId, client, notes = null) => {
  try {
    const result = await client.query(
      `INSERT INTO seed_usage_history (
        seed_purchase_id, lot_id, seeds_allocated, cost_per_seed,
        allocated_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [seedPurchaseId, lotId, seedsAllocated, costPerSeed, userId, notes]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error recording seed usage:', error);
    throw error;
  }
};

/**
 * Get profit/loss breakdown for an order
 * Includes seed costs in the calculation
 */
const getOrderProfitLoss = async (orderId) => {
  try {
    const query = `
      SELECT
        o.order_number,
        o.total_amount as revenue,

        -- Sum of seed costs from all order items
        COALESCE(SUM(l.total_seed_cost), 0) as total_seed_cost,

        -- Calculate profit (simplified - only seed cost included)
        o.total_amount - COALESCE(SUM(l.total_seed_cost), 0) as gross_profit,

        -- Profit margin percentage
        CASE
          WHEN o.total_amount > 0 THEN
            ((o.total_amount - COALESCE(SUM(l.total_seed_cost), 0)) / o.total_amount * 100)
          ELSE 0
        END as profit_margin_percentage,

        -- Item breakdown
        json_agg(
          json_build_object(
            'product_name', p.name,
            'sku_code', s.sku_code,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.quantity * oi.unit_price,
            'seed_cost', l.total_seed_cost,
            'line_profit', (oi.quantity * oi.unit_price) - COALESCE(l.total_seed_cost, 0)
          )
        ) as items

      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN lots l ON oi.lot_id = l.id
      LEFT JOIN skus s ON l.sku_id = s.id
      LEFT JOIN products p ON s.product_id = p.id
      WHERE o.id = $1
      GROUP BY o.id, o.order_number, o.total_amount
    `;

    const result = await pool.query(query, [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting order P&L:', error);
    throw error;
  }
};

/**
 * Get monthly P&L report with seed costs
 */
const getMonthlyProfitLoss = async (startDate, endDate) => {
  try {
    const query = `
      SELECT
        DATE_TRUNC('month', o.order_date) as month,
        COUNT(DISTINCT o.id) as total_orders,
        SUM(o.total_amount) as total_revenue,
        COALESCE(SUM(l.total_seed_cost), 0) as total_seed_costs,
        SUM(o.total_amount) - COALESCE(SUM(l.total_seed_cost), 0) as gross_profit,
        CASE
          WHEN SUM(o.total_amount) > 0 THEN
            AVG((o.total_amount - COALESCE(l.total_seed_cost, 0)) / NULLIF(o.total_amount, 0) * 100)
          ELSE 0
        END as avg_profit_margin

      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN lots l ON oi.lot_id = l.id
      WHERE o.order_date BETWEEN $1 AND $2
        AND o.status != 'cancelled'
      GROUP BY DATE_TRUNC('month', o.order_date)
      ORDER BY month DESC
    `;

    const result = await pool.query(query, [startDate, endDate]);

    return result.rows;
  } catch (error) {
    console.error('Error getting monthly P&L:', error);
    throw error;
  }
};

module.exports = {
  getPlantLineage,
  getLotLineage,
  getSeedPurchaseLineage,
  checkAndAllocateSeed,
  recordSeedUsage,
  getOrderProfitLoss,
  getMonthlyProfitLoss,
};
