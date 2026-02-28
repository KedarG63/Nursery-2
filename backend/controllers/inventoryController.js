/**
 * Inventory Controller
 * Phase 21 - Part 1: Inventory Management Enhancements
 * Enhanced with Seeds & Saplings tracking integration
 * Provides comprehensive inventory summary and analytics
 */

const pool = require('../config/database');
const inventoryService = require('../services/inventoryService');

/**
 * Get inventory summary grouped by product/SKU/stage
 * GET /api/inventory/summary
 */
const getInventorySummary = async (req, res) => {
  try {
    const { product_id, growth_stage } = req.query;

    let conditions = ['l.deleted_at IS NULL'];
    let params = [];
    let paramCount = 0;

    if (product_id) {
      paramCount++;
      conditions.push(`p.id = $${paramCount}`);
      params.push(product_id);
    }

    if (growth_stage) {
      paramCount++;
      conditions.push(`l.growth_stage = $${paramCount}`);
      params.push(growth_stage);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT
        p.id as product_id,
        p.name as product_name,
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
        COUNT(CASE WHEN l.allocated_quantity = 0 THEN 1 END) as lots_available_walkin
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE ${whereClause}
       GROUP BY p.id, p.name, p.growth_period_days, s.id, s.sku_code, l.growth_stage
       ORDER BY p.name, s.sku_code, l.growth_stage`,
      params
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        productId: row.product_id,
        productName: row.product_name,
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
        lotsAvailableWalkin: parseInt(row.lots_available_walkin)
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get inventory summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory summary',
      message: error.message
    });
  }
};

/**
 * Get product inventory breakdown with lot details
 * GET /api/inventory/product/:product_id/breakdown
 */
const getProductInventoryBreakdown = async (req, res) => {
  try {
    const { product_id } = req.params;

    const result = await pool.query(
      `SELECT
        l.*,
        s.sku_code,
        s.price,
        p.name as product_name,
        p.growth_period_days,
        o.order_number,
        CASE
          WHEN l.allocated_quantity > 0 THEN 'Reserved for Order'
          ELSE 'Available for Walk-in'
        END as allocation_status,
        EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready,
        ROUND(
          (EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date))::float / p.growth_period_days) * 100,
          2
        ) as growth_percentage
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN order_items oi ON oi.lot_id = l.id
       LEFT JOIN orders o ON oi.order_id = o.id AND o.deleted_at IS NULL
       WHERE p.id = $1 AND l.deleted_at IS NULL
       ORDER BY l.expected_ready_date, l.growth_stage`,
      [product_id]
    );

    // Group by SKU for better organization
    const groupedBySku = {};

    result.rows.forEach(row => {
      const skuCode = row.sku_code;

      if (!groupedBySku[skuCode]) {
        groupedBySku[skuCode] = {
          skuId: row.sku_id,
          skuCode: row.sku_code,
          price: parseFloat(row.price),
          lots: [],
          summary: {
            totalLots: 0,
            totalQuantity: 0,
            allocatedQuantity: 0,
            availableQuantity: 0
          }
        };
      }

      groupedBySku[skuCode].lots.push({
        lotId: row.id,
        lotNumber: row.lot_number,
        quantity: parseInt(row.quantity),
        allocatedQuantity: parseInt(row.allocated_quantity),
        availableQuantity: parseInt(row.available_quantity),
        growthStage: row.growth_stage,
        currentLocation: row.current_location,
        plantedDate: row.planted_date,
        expectedReadyDate: row.expected_ready_date,
        daysUntilReady: parseInt(row.days_until_ready || 0),
        growthPercentage: parseFloat(row.growth_percentage || 0),
        allocationStatus: row.allocation_status,
        orderNumber: row.order_number || null,
        qrCodeUrl: row.qr_code_url
      });

      // Update summary
      groupedBySku[skuCode].summary.totalLots++;
      groupedBySku[skuCode].summary.totalQuantity += parseInt(row.quantity);
      groupedBySku[skuCode].summary.allocatedQuantity += parseInt(row.allocated_quantity);
      groupedBySku[skuCode].summary.availableQuantity += parseInt(row.available_quantity);
    });

    res.json({
      success: true,
      data: {
        productId: product_id,
        productName: result.rows[0]?.product_name || null,
        growthPeriodDays: result.rows[0]?.growth_period_days || null,
        skus: Object.values(groupedBySku)
      }
    });
  } catch (error) {
    console.error('Get product inventory breakdown error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product inventory breakdown',
      message: error.message
    });
  }
};

/**
 * Get overall inventory statistics (enhanced with seeds + saplings)
 * GET /api/inventory/stats
 */
const getInventoryStats = async (req, res) => {
  try {
    // Get comprehensive stats using inventory service
    const comprehensiveStats = await inventoryService.getInventoryStatistics();

    // Overall stats (legacy saplings)
    const statsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT s.id) as total_skus,
        COUNT(l.id) as total_lots,
        COALESCE(SUM(l.quantity), 0) as total_units,
        COALESCE(SUM(l.available_quantity), 0) as available_units,
        COALESCE(SUM(l.allocated_quantity), 0) as allocated_units,
        COUNT(CASE WHEN l.growth_stage = 'ready' THEN 1 END) as ready_lots,
        COUNT(CASE WHEN l.growth_stage = 'ready' AND l.available_quantity > 0 THEN 1 END) as ready_available_lots
      FROM products p
      LEFT JOIN skus s ON s.product_id = p.id AND s.deleted_at IS NULL
      LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
    `);

    // Low stock SKUs
    const lowStockResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM (
        SELECT s.id
        FROM skus s
        LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL AND l.growth_stage = 'ready'
        WHERE s.deleted_at IS NULL
        GROUP BY s.id, s.min_stock_level
        HAVING COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level
      ) as low_stock_skus
    `);

    // Lots by growth stage
    const stageDistributionResult = await pool.query(`
      SELECT
        growth_stage,
        COUNT(*) as lot_count,
        SUM(quantity) as total_quantity,
        SUM(available_quantity) as available_quantity
      FROM lots
      WHERE deleted_at IS NULL
      GROUP BY growth_stage
      ORDER BY
        CASE growth_stage
          WHEN 'seed' THEN 1
          WHEN 'germination' THEN 2
          WHEN 'seedling' THEN 3
          WHEN 'transplant' THEN 4
          WHEN 'ready' THEN 5
          WHEN 'sold' THEN 6
        END
    `);

    const stats = statsResult.rows[0];
    const utilizationRate = stats.total_units > 0
      ? ((stats.allocated_units / stats.total_units) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalProducts: parseInt(stats.total_products),
          totalSkus: parseInt(stats.total_skus),
          totalLots: parseInt(stats.total_lots),
          totalUnits: parseInt(stats.total_units),
          availableUnits: parseInt(stats.available_units),
          allocatedUnits: parseInt(stats.allocated_units),
          readyLots: parseInt(stats.ready_lots),
          readyAvailableLots: parseInt(stats.ready_available_lots),
          utilizationRate: parseFloat(utilizationRate),
          lowStockSkus: parseInt(lowStockResult.rows[0].count)
        },
        stageDistribution: stageDistributionResult.rows.map(row => ({
          growthStage: row.growth_stage,
          lotCount: parseInt(row.lot_count),
          totalQuantity: parseInt(row.total_quantity),
          availableQuantity: parseInt(row.available_quantity)
        })),
        // Enhanced statistics
        seeds: comprehensiveStats.seeds,
        saplings: comprehensiveStats.saplings
      }
    });
  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory statistics',
      message: error.message
    });
  }
};

/**
 * Get seed inventory summary
 * GET /api/inventory/seeds
 */
const getSeedInventory = async (req, res) => {
  try {
    const { product_id, sku_id, inventory_status, vendor_id, expiring_days } = req.query;

    const filters = {
      product_id,
      sku_id,
      inventory_status,
      vendor_id,
      expiring_days: expiring_days ? parseInt(expiring_days) : null
    };

    const data = await inventoryService.getSeedInventorySummary(filters);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get seed inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch seed inventory',
      message: error.message
    });
  }
};

/**
 * Get sapling inventory summary
 * GET /api/inventory/saplings
 */
const getSaplingInventory = async (req, res) => {
  try {
    const { product_id, sku_id, growth_stage, location } = req.query;

    const filters = {
      product_id,
      sku_id,
      growth_stage,
      location
    };

    const data = await inventoryService.getSaplingInventorySummary(filters);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get sapling inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sapling inventory',
      message: error.message
    });
  }
};

/**
 * Get combined inventory (seeds + saplings)
 * GET /api/inventory/combined
 */
const getCombinedInventory = async (req, res) => {
  try {
    const { product_id, sku_id } = req.query;

    const filters = {
      product_id,
      sku_id
    };

    const data = await inventoryService.getCombinedInventorySummary(filters);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get combined inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch combined inventory',
      message: error.message
    });
  }
};

/**
 * Get seed inventory by product
 * GET /api/inventory/seeds/:product_id
 */
const getSeedsByProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await inventoryService.getSeedInventoryByProduct(product_id);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get seeds by product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch seed inventory for product',
      message: error.message
    });
  }
};

/**
 * Get sapling inventory by product
 * GET /api/inventory/saplings/:product_id
 */
const getSaplingsByProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await inventoryService.getSaplingInventoryByProduct(product_id);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get saplings by product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sapling inventory for product',
      message: error.message
    });
  }
};

/**
 * Get available seeds for lot creation
 * GET /api/inventory/seeds/available-for-lot
 */
const getAvailableSeeds = async (req, res) => {
  try {
    const { product_id, sku_id } = req.query;

    if (!product_id) {
      return res.status(400).json({
        success: false,
        error: 'product_id is required'
      });
    }

    const data = await inventoryService.getAvailableSeedsForLotCreation(product_id, sku_id);

    res.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Get available seeds error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available seeds',
      message: error.message
    });
  }
};

module.exports = {
  getInventorySummary,
  getProductInventoryBreakdown,
  getInventoryStats,
  getSeedInventory,
  getSaplingInventory,
  getCombinedInventory,
  getSeedsByProduct,
  getSaplingsByProduct,
  getAvailableSeeds
};
