/**
 * Inventory Service
 * Comprehensive inventory management for seeds and saplings
 * Integrates seed_purchases and lots tables for unified stock tracking
 */

const pool = require('../config/database');

/**
 * Get seed inventory summary grouped by product/SKU
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Seed inventory summary
 */
const getSeedInventorySummary = async (filters = {}) => {
  const { product_id, sku_id, inventory_status, vendor_id, expiring_days } = filters;

  let conditions = ['sp.deleted_at IS NULL'];
  let params = [];
  let paramCount = 0;

  if (product_id) {
    paramCount++;
    conditions.push(`sp.product_id = $${paramCount}`);
    params.push(product_id);
  }

  if (sku_id) {
    paramCount++;
    conditions.push(`sp.sku_id = $${paramCount}`);
    params.push(sku_id);
  }

  if (inventory_status) {
    paramCount++;
    conditions.push(`sp.inventory_status = $${paramCount}`);
    params.push(inventory_status);
  }

  if (vendor_id) {
    paramCount++;
    conditions.push(`sp.vendor_id = $${paramCount}`);
    params.push(vendor_id);
  }

  if (expiring_days) {
    paramCount++;
    conditions.push(`sp.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $${paramCount}`);
    params.push(expiring_days);
  }

  const whereClause = conditions.join(' AND ');

  const query = `
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.category as product_category,
      s.id as sku_id,
      s.sku_code,
      s.variety,
      COUNT(sp.id) as purchase_count,
      SUM(sp.total_seeds) as total_seeds_purchased,
      SUM(sp.seeds_used) as total_seeds_used,
      SUM(sp.seeds_remaining) as total_seeds_remaining,
      SUM(sp.grand_total) as total_cost,
      MIN(sp.expiry_date) as earliest_expiry_date,
      MAX(sp.expiry_date) as latest_expiry_date,
      ARRAY_AGG(DISTINCT v.vendor_name) FILTER (WHERE v.vendor_name IS NOT NULL) as vendors,
      COUNT(CASE WHEN sp.inventory_status = 'available' THEN 1 END) as available_purchases,
      COUNT(CASE WHEN sp.inventory_status = 'low_stock' THEN 1 END) as low_stock_purchases,
      COUNT(CASE WHEN sp.inventory_status = 'expired' THEN 1 END) as expired_purchases,
      COUNT(CASE WHEN sp.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
                 AND sp.expiry_date > CURRENT_DATE THEN 1 END) as expiring_soon_count
    FROM seed_purchases sp
    JOIN products p ON sp.product_id = p.id
    LEFT JOIN skus s ON sp.sku_id = s.id
    LEFT JOIN vendors v ON sp.vendor_id = v.id
    WHERE ${whereClause}
    GROUP BY p.id, p.name, p.category, s.id, s.sku_code, s.variety
    ORDER BY p.name, s.sku_code
  `;

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    productCategory: row.product_category,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    skuVariety: row.variety || null,
    purchaseCount: parseInt(row.purchase_count),
    totalSeedsPurchased: parseInt(row.total_seeds_purchased),
    totalSeedsUsed: parseInt(row.total_seeds_used),
    totalSeedsRemaining: parseInt(row.total_seeds_remaining),
    totalCost: parseFloat(row.total_cost),
    earliestExpiryDate: row.earliest_expiry_date,
    latestExpiryDate: row.latest_expiry_date,
    vendors: row.vendors || [],
    availablePurchases: parseInt(row.available_purchases),
    lowStockPurchases: parseInt(row.low_stock_purchases),
    expiredPurchases: parseInt(row.expired_purchases),
    expiringSoonCount: parseInt(row.expiring_soon_count)
  }));
};

/**
 * Get sapling (lots) inventory summary grouped by product/SKU/stage
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Sapling inventory summary
 */
const getSaplingInventorySummary = async (filters = {}) => {
  const { product_id, sku_id, growth_stage, location } = filters;

  let conditions = ['l.deleted_at IS NULL'];
  let params = [];
  let paramCount = 0;

  if (product_id) {
    paramCount++;
    conditions.push(`p.id = $${paramCount}`);
    params.push(product_id);
  }

  if (sku_id) {
    paramCount++;
    conditions.push(`s.id = $${paramCount}`);
    params.push(sku_id);
  }

  if (growth_stage) {
    paramCount++;
    conditions.push(`l.growth_stage = $${paramCount}`);
    params.push(growth_stage);
  }

  if (location) {
    paramCount++;
    conditions.push(`l.current_location = $${paramCount}`);
    params.push(location);
  }

  const whereClause = conditions.join(' AND ');

  const query = `
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.category as product_category,
      p.growth_period_days,
      s.id as sku_id,
      s.sku_code,
      l.growth_stage,
      COUNT(l.id) as lot_count,
      SUM(l.quantity) as total_quantity,
      SUM(l.allocated_quantity) as total_allocated,
      SUM(l.available_quantity) as total_available,
      MIN(l.expected_ready_date) as earliest_ready_date,
      MAX(l.expected_ready_date) as latest_ready_date,
      COUNT(CASE WHEN l.allocated_quantity > 0 THEN 1 END) as lots_with_orders,
      COUNT(CASE WHEN l.allocated_quantity = 0 THEN 1 END) as lots_available_walkin,
      ARRAY_AGG(DISTINCT l.current_location) as locations
    FROM lots l
    JOIN skus s ON l.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    WHERE ${whereClause}
    GROUP BY p.id, p.name, p.category, p.growth_period_days, s.id, s.sku_code, l.growth_stage
    ORDER BY p.name, s.sku_code, l.growth_stage
  `;

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    productCategory: row.product_category,
    growthPeriodDays: parseInt(row.growth_period_days),
    skuId: row.sku_id,
    skuCode: row.sku_code,
    growthStage: row.growth_stage,
    lotCount: parseInt(row.lot_count),
    totalQuantity: parseInt(row.total_quantity),
    totalAllocated: parseInt(row.total_allocated),
    totalAvailable: parseInt(row.total_available),
    earliestReadyDate: row.earliest_ready_date,
    latestReadyDate: row.latest_ready_date,
    lotsWithOrders: parseInt(row.lots_with_orders),
    lotsAvailableWalkin: parseInt(row.lots_available_walkin),
    locations: row.locations || []
  }));
};

/**
 * Get combined inventory summary (seeds + saplings)
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Combined inventory data
 */
const getCombinedInventorySummary = async (filters = {}) => {
  const { product_id, sku_id } = filters;

  const seedInventory = await getSeedInventorySummary({ product_id, sku_id });
  const saplingInventory = await getSaplingInventorySummary({ product_id, sku_id });

  // Merge by product and SKU
  const combined = {};

  // Add seed data
  seedInventory.forEach(seed => {
    const key = `${seed.productId}_${seed.skuId || 'null'}`;
    if (!combined[key]) {
      combined[key] = {
        productId: seed.productId,
        productName: seed.productName,
        productCategory: seed.productCategory,
        skuId: seed.skuId,
        skuCode: seed.skuCode,
        seeds: {},
        saplings: {}
      };
    }
    combined[key].seeds = {
      totalRemaining: seed.totalSeedsRemaining,
      purchaseCount: seed.purchaseCount,
      totalCost: seed.totalCost,
      expiringSoon: seed.expiringSoonCount > 0,
      earliestExpiry: seed.earliestExpiryDate
    };
  });

  // Add sapling data
  saplingInventory.forEach(sapling => {
    const key = `${sapling.productId}_${sapling.skuId || 'null'}`;
    if (!combined[key]) {
      combined[key] = {
        productId: sapling.productId,
        productName: sapling.productName,
        productCategory: sapling.productCategory,
        skuId: sapling.skuId,
        skuCode: sapling.skuCode,
        seeds: {},
        saplings: {}
      };
    }

    if (!combined[key].saplings[sapling.growthStage]) {
      combined[key].saplings[sapling.growthStage] = {
        lotCount: 0,
        totalAvailable: 0
      };
    }

    combined[key].saplings[sapling.growthStage] = {
      lotCount: sapling.lotCount,
      totalAvailable: sapling.totalAvailable,
      totalAllocated: sapling.totalAllocated,
      earliestReadyDate: sapling.earliestReadyDate
    };
  });

  return Object.values(combined);
};

/**
 * Get seed inventory details for a specific product
 * @param {String} product_id - Product UUID
 * @returns {Promise<Array>} Detailed seed purchase list
 */
const getSeedInventoryByProduct = async (product_id) => {
  const query = `
    SELECT
      sp.*,
      p.name as product_name,
      s.sku_code,
      v.vendor_name,
      v.contact_person as vendor_contact,
      CASE
        WHEN sp.expiry_date < CURRENT_DATE THEN 'Expired'
        WHEN sp.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'Expiring Soon'
        WHEN sp.seeds_remaining <= 0 THEN 'Exhausted'
        WHEN sp.seeds_remaining::DECIMAL / sp.total_seeds < 0.1 THEN 'Low Stock'
        ELSE 'Available'
      END as status_label,
      (sp.expiry_date - CURRENT_DATE) as days_until_expiry
    FROM seed_purchases sp
    JOIN products p ON sp.product_id = p.id
    LEFT JOIN skus s ON sp.sku_id = s.id
    LEFT JOIN vendors v ON sp.vendor_id = v.id
    WHERE sp.product_id = $1
      AND sp.deleted_at IS NULL
    ORDER BY sp.expiry_date ASC, sp.purchase_date DESC
  `;

  const result = await pool.query(query, [product_id]);
  return result.rows;
};

/**
 * Get sapling inventory details for a specific product
 * @param {String} product_id - Product UUID
 * @returns {Promise<Array>} Detailed lot list
 */
const getSaplingInventoryByProduct = async (product_id) => {
  const query = `
    SELECT
      l.*,
      s.sku_code,
      p.name as product_name,
      p.growth_period_days,
      EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready,
      CASE
        WHEN l.allocated_quantity > 0 THEN 'Reserved'
        ELSE 'Available'
      END as allocation_status
    FROM lots l
    JOIN skus s ON l.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    WHERE p.id = $1
      AND l.deleted_at IS NULL
    ORDER BY l.growth_stage, l.expected_ready_date
  `;

  const result = await pool.query(query, [product_id]);
  return result.rows;
};

/**
 * Get available seeds for lot creation
 * Check which seed purchases have remaining seeds
 * @param {String} product_id - Product UUID
 * @param {String} sku_id - SKU UUID (optional)
 * @returns {Promise<Array>} Available seed purchases
 */
const getAvailableSeedsForLotCreation = async (product_id, sku_id = null) => {
  let conditions = [
    'sp.deleted_at IS NULL',
    'sp.seeds_remaining > 0',
    'sp.expiry_date > CURRENT_DATE',
    "sp.inventory_status IN ('available', 'low_stock')"
  ];

  let params = [product_id];
  conditions.push('sp.product_id = $1');

  if (sku_id) {
    params.push(sku_id);
    conditions.push(`sp.sku_id = $${params.length}`);
  }

  const query = `
    SELECT
      sp.id,
      sp.purchase_number,
      sp.seed_lot_number,
      sp.seeds_remaining,
      sp.expiry_date,
      sp.cost_per_seed,
      sp.germination_rate,
      sp.purity_percentage,
      v.vendor_name,
      p.name as product_name,
      s.sku_code,
      (sp.expiry_date - CURRENT_DATE) as days_until_expiry
    FROM seed_purchases sp
    JOIN products p ON sp.product_id = p.id
    LEFT JOIN skus s ON sp.sku_id = s.id
    LEFT JOIN vendors v ON sp.vendor_id = v.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY sp.expiry_date ASC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

/**
 * Get overall inventory statistics
 * @returns {Promise<Object>} Statistics
 */
const getInventoryStatistics = async () => {
  // Seed statistics
  const seedStatsQuery = `
    SELECT
      COUNT(*) as total_purchases,
      SUM(total_seeds) as total_seeds_purchased,
      SUM(seeds_remaining) as total_seeds_remaining,
      SUM(grand_total) as total_investment,
      COUNT(CASE WHEN inventory_status = 'available' THEN 1 END) as available_count,
      COUNT(CASE WHEN inventory_status = 'low_stock' THEN 1 END) as low_stock_count,
      COUNT(CASE WHEN inventory_status = 'expired' THEN 1 END) as expired_count,
      COUNT(CASE WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days'
                 AND expiry_date > CURRENT_DATE THEN 1 END) as expiring_soon_count
    FROM seed_purchases
    WHERE deleted_at IS NULL
  `;

  // Sapling statistics
  const saplingStatsQuery = `
    SELECT
      COUNT(*) as total_lots,
      SUM(quantity) as total_quantity,
      SUM(available_quantity) as total_available,
      SUM(allocated_quantity) as total_allocated,
      COUNT(CASE WHEN expected_ready_date <= CURRENT_DATE AND growth_stage != 'sold' THEN 1 END) as ready_count,
      COUNT(CASE WHEN expected_ready_date <= CURRENT_DATE AND growth_stage != 'sold' AND available_quantity > 0 THEN 1 END) as ready_available_count
    FROM lots
    WHERE deleted_at IS NULL
  `;

  const [seedStats, saplingStats] = await Promise.all([
    pool.query(seedStatsQuery),
    pool.query(saplingStatsQuery)
  ]);

  return {
    seeds: {
      totalPurchases: parseInt(seedStats.rows[0].total_purchases),
      totalSeedsPurchased: parseInt(seedStats.rows[0].total_seeds_purchased || 0),
      totalSeedsRemaining: parseInt(seedStats.rows[0].total_seeds_remaining || 0),
      totalInvestment: parseFloat(seedStats.rows[0].total_investment || 0),
      availableCount: parseInt(seedStats.rows[0].available_count),
      lowStockCount: parseInt(seedStats.rows[0].low_stock_count),
      expiredCount: parseInt(seedStats.rows[0].expired_count),
      expiringSoonCount: parseInt(seedStats.rows[0].expiring_soon_count)
    },
    saplings: {
      totalLots: parseInt(saplingStats.rows[0].total_lots),
      totalQuantity: parseInt(saplingStats.rows[0].total_quantity || 0),
      totalAvailable: parseInt(saplingStats.rows[0].total_available || 0),
      totalAllocated: parseInt(saplingStats.rows[0].total_allocated || 0),
      readyCount: parseInt(saplingStats.rows[0].ready_count),
      readyAvailableCount: parseInt(saplingStats.rows[0].ready_available_count)
    }
  };
};

module.exports = {
  getSeedInventorySummary,
  getSaplingInventorySummary,
  getCombinedInventorySummary,
  getSeedInventoryByProduct,
  getSaplingInventoryByProduct,
  getAvailableSeedsForLotCreation,
  getInventoryStatistics
};
