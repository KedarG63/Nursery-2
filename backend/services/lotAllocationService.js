/**
 * Lot Allocation Service
 * Issue #26: Implement lot allocation algorithm
 * Issue #80: Integrate stock alert checking after allocation
 * Handles intelligent allocation of lots to order items based on availability and readiness
 */

const pool = require('../config/database');
const StockAlertService = require('./stockAlertService');

const stockAlertService = new StockAlertService();

/**
 * Allocate lots to an entire order
 * @param {string} orderId - Order UUID
 * @param {object} options - Allocation options
 * @returns {Promise<object>} Allocation summary
 */
const allocateLotsToOrder = async (orderId, options = {}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch order details
    const orderResult = await client.query(
      `SELECT id, delivery_date, status
       FROM orders
       WHERE id = $1 AND deleted_at IS NULL`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderResult.rows[0];

    // Check if order status allows allocation
    const allowedStatuses = ['pending', 'confirmed', 'preparing'];
    if (!allowedStatuses.includes(order.status)) {
      throw new Error(
        `Cannot allocate lots for order with status: ${order.status}`
      );
    }

    // Fetch unallocated order items
    const itemsResult = await client.query(
      `SELECT oi.id, oi.sku_id, oi.quantity, oi.status,
              s.sku_code, s.name as sku_name
       FROM order_items oi
       JOIN skus s ON oi.sku_id = s.id
       WHERE oi.order_id = $1
         AND (oi.lot_id IS NULL OR oi.status = 'pending')
       ORDER BY oi.created_at`,
      [orderId]
    );

    if (itemsResult.rows.length === 0) {
      return {
        success: true,
        message: 'No items to allocate',
        allocated: [],
        failed: [],
      };
    }

    const allocationResults = {
      allocated: [],
      failed: [],
      partiallyAllocated: [],
    };

    // Allocate lots for each item
    for (const item of itemsResult.rows) {
      try {
        const allocation = await allocateSingleItem(
          client,
          item,
          order.delivery_date,
          options
        );

        if (allocation.fullyAllocated) {
          allocationResults.allocated.push(allocation);
        } else if (allocation.partiallyAllocated) {
          allocationResults.partiallyAllocated.push(allocation);
        } else {
          allocationResults.failed.push({
            item_id: item.id,
            sku_id: item.sku_id,
            sku_code: item.sku_code,
            requested_quantity: item.quantity,
            reason: allocation.reason || 'Insufficient inventory',
          });
        }
      } catch (error) {
        allocationResults.failed.push({
          item_id: item.id,
          sku_id: item.sku_id,
          sku_code: item.sku_code,
          requested_quantity: item.quantity,
          reason: error.message,
        });
      }
    }

    // Calculate and update order expected_ready_date
    const readyDateResult = await client.query(
      `SELECT MAX(ready_date) as max_ready_date
       FROM order_items
       WHERE order_id = $1 AND ready_date IS NOT NULL`,
      [orderId]
    );

    if (readyDateResult.rows[0].max_ready_date) {
      await client.query(
        `UPDATE orders
         SET expected_ready_date = $1, updated_at = NOW()
         WHERE id = $2`,
        [readyDateResult.rows[0].max_ready_date, orderId]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Allocation completed',
      ...allocationResults,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Allocate lots for a single order item
 * @param {object} client - Database client
 * @param {object} item - Order item
 * @param {Date} deliveryDate - Order delivery date
 * @param {object} options - Allocation options
 * @returns {Promise<object>} Allocation result
 */
const allocateSingleItem = async (client, item, deliveryDate, options = {}) => {
  let remainingQuantity = item.quantity;
  const allocatedLots = [];

  // Use expected_ready_date as the gate instead of growth_stage.
  // For orders with a delivery date: include lots ready by that date.
  // For walk-in / no delivery date: include lots already ready (by today).
  // Only exclude 'sold' lots — all other stages are eligible if the date qualifies.
  const lotsQuery = `
    SELECT id, lot_number, quantity, allocated_quantity, available_quantity,
           growth_stage, expected_ready_date, current_location
    FROM lots
    WHERE sku_id = $1
      AND growth_stage != 'sold'
      AND available_quantity > 0
      AND deleted_at IS NULL
      AND (
        expected_ready_date IS NULL
        OR expected_ready_date <= COALESCE($2::date, CURRENT_DATE)
      )
    ORDER BY
      expected_ready_date ASC NULLS LAST,
      available_quantity DESC
    FOR UPDATE
  `;

  const lotsResult = await client.query(lotsQuery, [item.sku_id, deliveryDate || null]);

  if (lotsResult.rows.length === 0) {
    return {
      fullyAllocated: false,
      partiallyAllocated: false,
      reason: 'No lots ready by the required date. Check expected_ready_date or push delivery date further out.',
    };
  }

  // Allocate from available lots using FIFO
  for (const lot of lotsResult.rows) {
    if (remainingQuantity <= 0) break;

    const quantityToAllocate = Math.min(remainingQuantity, lot.available_quantity);

    // Update lot quantities (Phase 21 - Part 4)
    await client.query(
      `UPDATE lots
       SET allocated_quantity = allocated_quantity + $1,
           available_quantity = available_quantity - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [quantityToAllocate, lot.id]
    );

    // For first lot, update existing order item
    if (allocatedLots.length === 0) {
      await client.query(
        `UPDATE order_items
         SET lot_id = $1,
             status = 'allocated',
             allocated_at = NOW(),
             ready_date = $2,
             quantity = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [lot.id, lot.expected_ready_date, quantityToAllocate, item.id]
      );
    } else {
      // For additional lots, create new order item entries
      const newItemResult = await client.query(
        `INSERT INTO order_items (
           order_id, sku_id, lot_id, quantity, unit_price, status,
           allocated_at, ready_date
         )
         SELECT order_id, sku_id, $1, $2, unit_price, 'allocated', NOW(), $3
         FROM order_items
         WHERE id = $4
         RETURNING id`,
        [lot.id, quantityToAllocate, lot.expected_ready_date, item.id]
      );
    }

    allocatedLots.push({
      lot_id: lot.id,
      lot_number: lot.lot_number,
      quantity: quantityToAllocate,
      growth_stage: lot.growth_stage,
      expected_ready_date: lot.expected_ready_date,
    });

    remainingQuantity -= quantityToAllocate;
  }

  // Check stock level after allocation (Issue #80)
  if (allocatedLots.length > 0) {
    try {
      await stockAlertService.checkStockLevel(item.sku_id, client);
    } catch (error) {
      // Log error but don't fail allocation
      console.error('Error checking stock level after allocation:', error.message);
    }
  }

  // Delete original item if it was split into multiple lots
  if (allocatedLots.length > 1) {
    // The first allocation updated the original item, so we keep it
    // Additional allocations created new items
  }

  return {
    fullyAllocated: remainingQuantity === 0,
    partiallyAllocated: remainingQuantity > 0 && allocatedLots.length > 0,
    item_id: item.id,
    sku_id: item.sku_id,
    sku_code: item.sku_code,
    requested_quantity: item.quantity,
    allocated_quantity: item.quantity - remainingQuantity,
    remaining_quantity: remainingQuantity,
    lots: allocatedLots,
  };
};

/**
 * Check lot availability for a SKU
 * @param {string} skuId - SKU UUID
 * @param {number} quantity - Required quantity
 * @returns {Promise<object>} Availability info
 */
const checkLotAvailability = async (skuId, quantity) => {
  const result = await pool.query(
    `SELECT
       SUM(available_quantity) as total_available,
       COUNT(*) as lot_count,
       MIN(expected_ready_date) as earliest_ready_date
     FROM lots
     WHERE sku_id = $1
       AND growth_stage != 'sold'
       AND available_quantity > 0
       AND deleted_at IS NULL`,
    [skuId]
  );

  const row = result.rows[0];
  const totalAvailable = parseInt(row.total_available) || 0;

  return {
    sku_id: skuId,
    available: totalAvailable >= quantity,
    total_available: totalAvailable,
    requested_quantity: quantity,
    shortage: Math.max(0, quantity - totalAvailable),
    lot_count: parseInt(row.lot_count) || 0,
    earliest_ready_date: row.earliest_ready_date,
  };
};

/**
 * Release allocated lots for an order (deallocate)
 * @param {string} orderId - Order UUID
 * @returns {Promise<object>} Deallocation result
 */
const releaseAllocatedLots = async (orderId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get all allocated order items
    const allocatedItemsResult = await client.query(
      `SELECT id, sku_id, lot_id, quantity
       FROM order_items
       WHERE order_id = $1 AND lot_id IS NOT NULL`,
      [orderId]
    );

    // Restore lot quantities for each allocated item (Phase 21 - Part 4)
    for (const item of allocatedItemsResult.rows) {
      await client.query(
        `UPDATE lots
         SET allocated_quantity = allocated_quantity - $1,
             available_quantity = available_quantity + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [item.quantity, item.lot_id]
      );
    }

    // Update all allocated order items to remove lot assignments
    const result = await client.query(
      `UPDATE order_items
       SET lot_id = NULL,
           status = 'pending',
           allocated_at = NULL,
           ready_date = NULL,
           updated_at = NOW()
       WHERE order_id = $1
         AND lot_id IS NOT NULL
       RETURNING id, sku_id, lot_id, quantity`,
      [orderId]
    );

    // Clear order expected_ready_date
    await client.query(
      `UPDATE orders
       SET expected_ready_date = NULL, updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Lots deallocated successfully',
      deallocated_items: result.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get optimal lots for a SKU and quantity
 * @param {string} skuId - SKU UUID
 * @param {number} quantity - Required quantity
 * @param {Date} deliveryDate - Delivery date
 * @returns {Promise<Array>} List of optimal lots
 */
const getOptimalLots = async (skuId, quantity, deliveryDate = null) => {
  let query = `
    SELECT id, lot_number, quantity, available_quantity,
           growth_stage, expected_ready_date, current_location
    FROM lots
    WHERE sku_id = $1
      AND growth_stage != 'sold'
      AND available_quantity > 0
      AND deleted_at IS NULL
  `;

  const params = [skuId];

  // If delivery date provided, filter lots that can be ready by then
  if (deliveryDate) {
    query += ` AND (expected_ready_date IS NULL OR expected_ready_date <= $2)`;
    params.push(deliveryDate);
  }

  query += `
    ORDER BY
      CASE
        WHEN growth_stage = 'ready' THEN 1
        WHEN growth_stage = 'transplant' THEN 2
        ELSE 3
      END,
      expected_ready_date ASC NULLS LAST,
      available_quantity DESC
    LIMIT 10
  `;

  const result = await pool.query(query, params);

  // Calculate cumulative quantity
  let cumulative = 0;
  const lots = result.rows.map((lot) => {
    cumulative += lot.available_quantity;
    return {
      ...lot,
      cumulative_quantity: cumulative,
      sufficient: cumulative >= quantity,
    };
  });

  return lots;
};

/**
 * Manual lot allocation (for specific lot assignments)
 * @param {string} orderId - Order UUID
 * @param {Array} allocations - Array of {item_id, lot_id, quantity}
 * @returns {Promise<object>} Allocation result
 */
const manualAllocateLots = async (orderId, allocations) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];

    for (const allocation of allocations) {
      const { item_id, lot_id, quantity } = allocation;

      // Verify order item exists and belongs to this order
      const itemResult = await client.query(
        `SELECT oi.id, oi.sku_id, oi.quantity, oi.order_id
         FROM order_items oi
         WHERE oi.id = $1 AND oi.order_id = $2`,
        [item_id, orderId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error(`Order item ${item_id} not found or does not belong to order`);
      }

      const item = itemResult.rows[0];

      // Verify lot exists and has sufficient quantity
      const lotResult = await client.query(
        `SELECT id, sku_id, available_quantity, expected_ready_date, growth_stage
         FROM lots
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [lot_id]
      );

      if (lotResult.rows.length === 0) {
        throw new Error(`Lot ${lot_id} not found`);
      }

      const lot = lotResult.rows[0];

      // Verify SKU matches
      if (lot.sku_id !== item.sku_id) {
        throw new Error(`Lot SKU does not match order item SKU`);
      }

      // Verify sufficient quantity
      if (lot.available_quantity < quantity) {
        throw new Error(
          `Insufficient quantity in lot. Available: ${lot.available_quantity}, Requested: ${quantity}`
        );
      }

      // Update order item with lot allocation
      await client.query(
        `UPDATE order_items
         SET lot_id = $1,
             quantity = $2,
             status = 'allocated',
             allocated_at = NOW(),
             ready_date = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [lot_id, quantity, lot.expected_ready_date, item_id]
      );

      results.push({
        item_id,
        lot_id,
        quantity,
        status: 'allocated',
      });
    }

    // Update order expected_ready_date
    const readyDateResult = await client.query(
      `SELECT MAX(ready_date) as max_ready_date
       FROM order_items
       WHERE order_id = $1 AND ready_date IS NOT NULL`,
      [orderId]
    );

    if (readyDateResult.rows[0].max_ready_date) {
      await client.query(
        `UPDATE orders
         SET expected_ready_date = $1, updated_at = NOW()
         WHERE id = $2`,
        [readyDateResult.rows[0].max_ready_date, orderId]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Manual allocation completed',
      allocations: results,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  allocateLotsToOrder,
  checkLotAvailability,
  releaseAllocatedLots,
  getOptimalLots,
  manualAllocateLots,
  // Export internal functions for testing
  __testExports: process.env.NODE_ENV === 'test' ? {
    allocateSingleItem
  } : undefined
};
