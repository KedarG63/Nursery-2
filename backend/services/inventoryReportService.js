/**
 * Inventory Report Service
 * Issue #71: Inventory analytics with stock levels, lot distribution, and low stock alerts
 */

const db = require('../utils/db');
const NodeCache = require('node-cache');

// Cache with 1-hour TTL
const reportCache = new NodeCache({ stdTTL: 3600 });

class InventoryReportService {
  /**
   * Get complete inventory analytics
   * @returns {Promise<Object>} Complete inventory report
   */
  async getInventoryAnalytics() {
    const cacheKey = 'inventory_analytics';
    const cached = reportCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached inventory report');
      return cached;
    }

    const [stockLevels, lotsByStage, upcomingReady, locationBreakdown] = await Promise.all([
      this.getStockLevelsBySKU(),
      this.getLotsByGrowthStage(),
      this.getUpcomingReadyLots(30),
      this.getStockByLocation()
    ]);

    // Filter low stock alerts from stock levels
    const lowStockAlerts = stockLevels.filter(item => item.isLowStock);

    const result = {
      stockLevels,
      lotsByStage,
      lowStockAlerts,
      upcomingReady,
      locationBreakdown
    };

    reportCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get current stock levels by SKU
   * @returns {Promise<Array>} Stock levels for all SKUs
   */
  async getStockLevelsBySKU() {
    const query = `
      SELECT
        s.id as sku_id,
        s.name as sku_name,
        p.name as product_name,
        COALESCE(s.min_stock_level, 0) as min_level,
        COALESCE(SUM(l.available_quantity), 0) as current_stock,
        CASE
          WHEN COALESCE(SUM(l.available_quantity), 0) < COALESCE(s.min_stock_level, 0)
          THEN true ELSE false
        END as is_low_stock
      FROM skus s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN lots l ON s.id = l.sku_id AND l.deleted_at IS NULL
      GROUP BY s.id, s.name, p.name, s.min_stock_level
      ORDER BY current_stock ASC
    `;

    const result = await db.query(query);

    return result.rows.map(row => ({
      skuId: row.sku_id,
      skuName: row.sku_name,
      productName: row.product_name,
      currentStock: parseInt(row.current_stock),
      minLevel: parseInt(row.min_level),
      isLowStock: row.is_low_stock
    }));
  }

  /**
   * Get lot distribution by growth stage
   * @returns {Promise<Array>} Lot counts and quantities by stage
   */
  async getLotsByGrowthStage() {
    const query = `
      SELECT
        growth_stage,
        COUNT(*) as lot_count,
        COALESCE(SUM(total_quantity), 0) as total_quantity,
        COALESCE(SUM(available_quantity), 0) as available_quantity
      FROM lots
      WHERE deleted_at IS NULL
      GROUP BY growth_stage
      ORDER BY growth_stage
    `;

    const result = await db.query(query);

    return result.rows.map(row => ({
      stage: row.growth_stage,
      lotCount: parseInt(row.lot_count),
      totalQuantity: parseInt(row.total_quantity),
      availableQuantity: parseInt(row.available_quantity)
    }));
  }

  /**
   * Get lots ready in next N days
   * @param {number} days - Number of days to look ahead
   * @returns {Promise<Array>} Upcoming ready lots
   */
  async getUpcomingReadyLots(days = 30) {
    const query = `
      SELECT
        l.id,
        l.lot_number,
        l.expected_ready_date,
        p.name as product_name,
        s.name as sku_name,
        l.available_quantity
      FROM lots l
      JOIN skus s ON l.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE l.expected_ready_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * $1
        AND l.status = 'active'
      ORDER BY l.expected_ready_date
    `;

    const result = await db.query(query, [days]);

    return result.rows.map(row => ({
      lotId: row.id,
      lotNumber: row.lot_number,
      expectedReadyDate: row.expected_ready_date,
      productName: row.product_name,
      skuName: row.sku_name,
      availableQuantity: parseInt(row.available_quantity)
    }));
  }

  /**
   * Get stock breakdown by location
   * @returns {Promise<Array>} Stock by warehouse/greenhouse/field
   */
  async getStockByLocation() {
    const query = `
      SELECT
        current_location,
        COUNT(*) as lot_count,
        COALESCE(SUM(available_quantity), 0) as total_quantity
      FROM lots
      WHERE deleted_at IS NULL
      GROUP BY current_location
      ORDER BY total_quantity DESC
    `;

    const result = await db.query(query);

    return result.rows.map(row => ({
      location: row.current_location,
      lotCount: parseInt(row.lot_count),
      quantity: parseInt(row.total_quantity)
    }));
  }

  /**
   * Get low stock alerts (SKUs below minimum threshold)
   * @returns {Promise<Array>} SKUs with low stock
   */
  async getLowStockAlerts() {
    const stockLevels = await this.getStockLevelsBySKU();
    return stockLevels.filter(item => item.isLowStock);
  }
}

module.exports = new InventoryReportService();
