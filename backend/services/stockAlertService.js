/**
 * Stock Alert Service
 * Monitors stock levels and sends alerts
 * Issue #80: Create low stock alert system
 */

const pool = require('../config/database');
const EmailService = require('./emailService');

const emailService = new EmailService();

class StockAlertService {
  /**
   * Check stock level and trigger alert if below threshold
   * Called after lot allocation
   * @param {string} skuId - SKU ID to check
   * @param {object} client - Database client (for transactions)
   */
  async checkStockLevel(skuId, client) {
    const dbClient = client || pool;

    try {
      // Calculate available stock for SKU
      const stockQuery = `
        SELECT
          s.id,
          s.sku_code,
          s.sku_code as variant_name,
          s.min_stock_level,
          s.max_stock_level,
          s.reorder_point,
          s.last_stock_alert_sent_at,
          p.name as product_name,
          COALESCE(SUM(l.available_quantity), 0)::INTEGER as available_stock
        FROM skus s
        JOIN products p ON s.product_id = p.id
        LEFT JOIN lots l ON l.sku_id = s.id
          AND l.growth_stage IN ('ready', 'transplant', 'seedling')
          AND l.available_quantity > 0
        WHERE s.id = $1
        GROUP BY s.id, s.sku_code, s.min_stock_level,
                 s.max_stock_level, s.reorder_point, s.last_stock_alert_sent_at, p.name
      `;

      const result = await dbClient.query(stockQuery, [skuId]);

      if (result.rows.length === 0) {
        console.log(`⚠️ SKU ${skuId} not found`);
        return;
      }

      const sku = result.rows[0];

      // Check if below minimum level
      if (sku.available_stock < sku.min_stock_level) {
        // Check if alert already sent recently (within 7 days)
        if (sku.last_stock_alert_sent_at) {
          const daysSinceLastAlert = Math.floor(
            (Date.now() - new Date(sku.last_stock_alert_sent_at).getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceLastAlert < 7) {
            console.log(`ℹ️ Low stock alert for ${sku.sku_code} already sent ${daysSinceLastAlert} days ago`);
            return;
          }
        }

        // Trigger alert
        await this.sendLowStockAlert(sku, dbClient);

        // Update last alert timestamp
        await dbClient.query(
          `UPDATE skus
           SET last_stock_alert_sent_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [skuId]
        );

        console.log(`🚨 Low stock alert sent for ${sku.sku_code} (${sku.available_stock} < ${sku.min_stock_level})`);
      }

    } catch (error) {
      console.error('Error checking stock level:', error);
      throw error;
    }
  }

  /**
   * Send low stock alert to Inventory Managers
   * @param {object} sku - SKU details with stock information
   * @param {object} client - Database client
   */
  async sendLowStockAlert(sku, client) {
    const dbClient = client || pool;

    // Calculate reorder quantity
    const reorderQuantity = sku.max_stock_level - sku.available_stock;

    // Get Inventory Manager and Admin users
    const managersQuery = `
      SELECT DISTINCT u.id, u.email, u.full_name as name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name IN ('Admin', 'Manager')
        AND u.email IS NOT NULL
    `;

    const managers = await dbClient.query(managersQuery);

    // Create in-app notifications for Manager role
    await dbClient.query(
      `INSERT INTO notifications
       (role_name, notification_type, title, message, entity_type, entity_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'Manager',
        'low_stock',
        'Low Stock Alert',
        `${sku.product_name} - ${sku.variant_name} (${sku.sku_code}) is running low. Current: ${sku.available_stock}, Minimum: ${sku.min_stock_level}. Suggested reorder: ${reorderQuantity} units.`,
        'sku',
        sku.id,
        sku.available_stock < (sku.min_stock_level * 0.5) ? 'urgent' : 'high'
      ]
    );

    // Send email alerts
    const lowStockData = [{
      productName: sku.product_name,
      variantName: sku.variant_name,
      skuCode: sku.sku_code,
      currentStock: sku.available_stock,
      minStockLevel: sku.min_stock_level,
      reorderQuantity: reorderQuantity
    }];

    for (const manager of managers.rows) {
      try {
        await emailService.sendLowStockAlert(
          manager.email,
          manager.name,
          lowStockData
        );

        console.log(`📧 Low stock email sent to ${manager.email}`);

      } catch (error) {
        console.error(`Failed to send email to ${manager.email}:`, error.message);
      }
    }

    // Record in stock alert history
    await dbClient.query(
      `INSERT INTO stock_alert_history
       (sku_id, current_stock, min_stock_level, reorder_quantity)
       VALUES ($1, $2, $3, $4)`,
      [sku.id, sku.available_stock, sku.min_stock_level, reorderQuantity]
    );
  }

  /**
   * Mark stock alert as resolved
   * @param {string} skuId - SKU ID
   * @param {string} userId - User who resolved the alert
   */
  async resolveStockAlert(skuId, userId) {
    await pool.query(
      `UPDATE stock_alert_history
       SET resolved_at = CURRENT_TIMESTAMP,
           resolved_by = $2
       WHERE sku_id = $1
         AND resolved_at IS NULL`,
      [skuId, userId]
    );

    console.log(`✅ Stock alert resolved for SKU ${skuId} by user ${userId}`);
  }

  /**
   * Get unresolved stock alerts
   * @returns {Array} Array of unresolved alerts
   */
  async getUnresolvedAlerts() {
    const query = `
      SELECT
        sah.*,
        s.sku_code,
        s.sku_code as variant_name,
        p.name as product_name
      FROM stock_alert_history sah
      JOIN skus s ON sah.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE sah.resolved_at IS NULL
      ORDER BY sah.alert_sent_at DESC
    `;

    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = StockAlertService;
