/**
 * Order Controller
 * Issue #25: Create order API endpoints
 * Handles order creation, updates, and lot allocation
 */

const pool = require('../config/database');
const lotAllocationService = require('../services/lotAllocationService');
const { isValidStatusTransition } = require('../validators/orderValidator');
const notificationEvents = require('../events/notificationEvents');

// Tax rate configuration (0% - GST exempt)
const TAX_RATE = 0.00;

/**
 * Create a new order
 * POST /api/orders
 */
const createOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id,
      delivery_address_id,
      delivery_date,
      delivery_slot,
      payment_type,
      items,
      discount_amount = 0,
      notes,
      auto_allocate = false,
    } = req.body;

    const userId = req.user?.id;

    await client.query('BEGIN');

    // 1. Validate customer exists and is active
    const customerResult = await client.query(
      `SELECT id, status, credit_limit
       FROM customers
       WHERE id = $1 AND deleted_at IS NULL`,
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const customer = customerResult.rows[0];

    if (customer.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Customer status is ${customer.status}`,
      });
    }

    // 2. Validate delivery address belongs to customer (optional for walk-in/counter orders)
    if (delivery_address_id) {
      const addressResult = await client.query(
        `SELECT id
         FROM customer_addresses
         WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL`,
        [delivery_address_id, customer_id]
      );

      if (addressResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Delivery address not found or does not belong to customer',
        });
      }
    }

    // 3. Fetch SKU details and calculate subtotal
    let subtotal = 0;
    const itemsWithPrices = [];

    for (const item of items) {
      const skuResult = await client.query(
        `SELECT s.id, s.sku_code, s.price, s.active, p.name
         FROM skus s
         JOIN products p ON s.product_id = p.id
         WHERE s.id = $1 AND s.deleted_at IS NULL`,
        [item.sku_id]
      );

      if (skuResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `SKU ${item.sku_id} not found`,
        });
      }

      const sku = skuResult.rows[0];

      if (!sku.active) {
        return res.status(400).json({
          success: false,
          message: `SKU ${sku.sku_code} is not active`,
        });
      }

      const unitPrice = item.unit_price || sku.price;
      const lineTotal = item.quantity * unitPrice;
      subtotal += lineTotal;

      itemsWithPrices.push({
        sku_id: item.sku_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    // 3.5 Check lot availability and maturity dates (Phase 21 - Part 1)
    for (const item of itemsWithPrices) {
      // Get available lots for this SKU that can fulfill the order by delivery date
      // Allow any growth stage as long as expected_ready_date is before delivery_date
      const lotsAvailableQuery = `
        SELECT
          l.id,
          l.lot_number,
          l.available_quantity,
          l.expected_ready_date,
          l.growth_stage,
          p.growth_period_days,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
        FROM lots l
        JOIN skus s ON l.sku_id = s.id
        JOIN products p ON s.product_id = p.id
        WHERE l.sku_id = $1
          AND l.deleted_at IS NULL
          AND l.growth_stage != 'sold'
          AND l.available_quantity >= $2
          AND l.expected_ready_date <= $3
        ORDER BY l.expected_ready_date ASC, l.available_quantity DESC
        LIMIT 5
      `;

      const lotsResult = await client.query(lotsAvailableQuery, [
        item.sku_id,
        item.quantity,
        delivery_date
      ]);

      if (lotsResult.rows.length === 0) {
        // No lots available by delivery date - calculate minimum possible delivery date
        const nextAvailableQuery = `
          SELECT MIN(l.expected_ready_date) as next_available_date
          FROM lots l
          WHERE l.sku_id = $1
            AND l.deleted_at IS NULL
            AND l.available_quantity >= $2
        `;

        const nextAvailableResult = await client.query(nextAvailableQuery, [
          item.sku_id,
          item.quantity
        ]);

        const nextAvailableDate = nextAvailableResult.rows[0]?.next_available_date;

        if (!nextAvailableDate) {
          // Get SKU info for error message
          const skuResult = await client.query(
            'SELECT sku_code, s.id as sku_id, p.name as product_name FROM skus s JOIN products p ON s.product_id = p.id WHERE s.id = $1',
            [item.sku_id]
          );

          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Insufficient inventory for ${skuResult.rows[0]?.product_name || 'product'}`,
            error: {
              sku_id: item.sku_id,
              sku_code: skuResult.rows[0]?.sku_code || 'Unknown',
              product_name: skuResult.rows[0]?.product_name || 'Unknown',
              requested_quantity: item.quantity,
              requested_delivery_date: delivery_date,
              issue: 'No lots available with sufficient quantity',
              suggestion: 'Please create new lots or reduce order quantity'
            }
          });
        }

        const minDeliveryDate = new Date(nextAvailableDate);
        const requestedDeliveryDate = new Date(delivery_date);
        const daysShort = Math.ceil((minDeliveryDate - requestedDeliveryDate) / (1000 * 60 * 60 * 24));

        // Get SKU info for error message
        const skuResult = await client.query(
          'SELECT sku_code, p.name as product_name FROM skus s JOIN products p ON s.product_id = p.id WHERE s.id = $1',
          [item.sku_id]
        );

        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Delivery date too early - inventory not ready`,
          error: {
            sku_id: item.sku_id,
            sku_code: skuResult.rows[0]?.sku_code || 'Unknown',
            product_name: skuResult.rows[0]?.product_name || 'Unknown',
            requested_quantity: item.quantity,
            requested_delivery_date: delivery_date,
            earliest_possible_delivery_date: minDeliveryDate.toISOString().split('T')[0],
            days_short: daysShort,
            issue: `Products need ${daysShort} more days to mature`,
            suggestion: `Minimum delivery date should be ${minDeliveryDate.toISOString().split('T')[0]}`
          }
        });
      }

      // Store available lot info for later use
      item.available_lots = lotsResult.rows;
    }

    // Calculate expected_ready_date for the order (maximum of all item ready dates)
    const maxReadyDate = itemsWithPrices.reduce((maxDate, item) => {
      if (item.available_lots && item.available_lots.length > 0) {
        const lotReadyDate = new Date(item.available_lots[0].expected_ready_date);
        return lotReadyDate > maxDate ? lotReadyDate : maxDate;
      }
      return maxDate;
    }, new Date(delivery_date));

    // 4. Calculate totals
    const discountAmountFinal = discount_amount || 0;
    const taxableAmount = subtotal - discountAmountFinal;
    const taxAmount = taxableAmount * TAX_RATE;
    const totalAmount = taxableAmount + taxAmount;

    // 5. Check credit limit if payment type is credit
    if (payment_type === 'credit') {
      const creditResult = await client.query(
        `SELECT credit_limit, credit_used
         FROM customer_credit
         WHERE customer_id = $1`,
        [customer_id]
      );

      if (creditResult.rows.length > 0) {
        const { credit_limit, credit_used } = creditResult.rows[0];
        const availableCredit = credit_limit - credit_used;

        if (totalAmount > availableCredit) {
          return res.status(409).json({
            success: false,
            message: 'Credit limit exceeded',
            details: {
              total_amount: totalAmount,
              available_credit: availableCredit,
              credit_limit,
              credit_used,
            },
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Customer does not have credit facility',
        });
      }
    }

    // 6. Create order (Phase 21: Include expected_ready_date)
    const orderResult = await client.query(
      `INSERT INTO orders (
         customer_id, delivery_address_id, delivery_date, delivery_slot,
         payment_type, subtotal_amount, discount_amount, tax_amount,
         total_amount, expected_ready_date, notes, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       RETURNING *`,
      [
        customer_id,
        delivery_address_id,
        delivery_date,
        delivery_slot,
        payment_type,
        subtotal,
        discountAmountFinal,
        taxAmount,
        totalAmount,
        maxReadyDate, // Phase 21: Add expected_ready_date
        notes,
        userId,
      ]
    );

    const order = orderResult.rows[0];

    // 7. Create order items
    for (const item of itemsWithPrices) {
      await client.query(
        `INSERT INTO order_items (
           order_id, sku_id, quantity, unit_price
         )
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.sku_id, item.quantity, item.unit_price]
      );
    }

    // 8. Update customer credit if payment type is credit
    if (payment_type === 'credit') {
      await client.query(
        `UPDATE customer_credit
         SET credit_used = credit_used + $1,
             updated_at = NOW()
         WHERE customer_id = $2`,
        [totalAmount, customer_id]
      );
    }

    // 9. Auto-allocate lots by default (Phase 21 - Part 4)
    let allocationResult = null;
    const shouldAutoAllocate = auto_allocate !== false; // Default to true unless explicitly set to false

    if (shouldAutoAllocate) {
      try {
        allocationResult = await lotAllocationService.allocateLotsToOrder(order.id);

        // If allocation successful, update order status to confirmed
        if (allocationResult.success && allocationResult.allocated.length > 0) {
          await client.query(
            `UPDATE orders
             SET status = 'confirmed', updated_at = NOW()
             WHERE id = $1`,
            [order.id]
          );

          // Add status history entry
          await client.query(
            `INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes)
             VALUES ($1, 'pending', 'confirmed', $2, 'Auto-confirmed after lot allocation')`,
            [order.id, userId]
          );
        }
      } catch (error) {
        console.error('Auto-allocation failed:', error);
        // Don't fail the order creation if allocation fails
      }
    }

    await client.query('COMMIT');

    // Fetch complete order details
    const completeOrder = await getOrderById(order.id);

    // Trigger WhatsApp notification (Phase 9)
    try {
      notificationEvents.emit('order:created', { orderId: order.id });
    } catch (notificationError) {
      console.error('Error emitting order notification:', notificationError.message);
      // Don't fail the order creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: completeOrder,
      allocation: allocationResult,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get list of orders with filters and pagination
 * GET /api/orders
 */
const listOrders = async (req, res) => {
  try {
    const {
      customer_id,
      status,
      search,
      order_date_from,
      order_date_to,
      delivery_date_from,
      delivery_date_to,
      has_balance,
      page = 1,
      limit = 20,
      sort_by = 'order_date',
      sort_order = 'desc',
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    const whereClauses = ['o.deleted_at IS NULL'];

    // Build WHERE clause
    if (customer_id) {
      params.push(customer_id);
      whereClauses.push(`o.customer_id = $${params.length}`);
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim().toLowerCase());
      params.push(statuses);
      whereClauses.push(`o.status = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }

    // Filter for orders with outstanding balance
    if (has_balance === 'true' || has_balance === true) {
      whereClauses.push(`o.balance_amount > 0`);
    }

    if (order_date_from) {
      params.push(order_date_from);
      whereClauses.push(`o.order_date >= $${params.length}`);
    }

    if (order_date_to) {
      params.push(order_date_to);
      whereClauses.push(`o.order_date <= $${params.length}`);
    }

    if (delivery_date_from) {
      params.push(delivery_date_from);
      whereClauses.push(`o.delivery_date >= $${params.length}`);
    }

    if (delivery_date_to) {
      params.push(delivery_date_to);
      whereClauses.push(`o.delivery_date <= $${params.length}`);
    }

    const whereClause = whereClauses.join(' AND ');

    // Valid sort fields
    const sortField = ['order_date', 'delivery_date', 'total_amount', 'status', 'created_at'].includes(sort_by)
      ? sort_by
      : 'order_date';
    const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count total (join customers so search on c.name works)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Fetch orders
    params.push(limit, offset);
    const ordersQuery = `
      SELECT
        o.id, o.order_number, o.customer_id, o.order_date, o.delivery_date,
        o.delivery_slot, o.status, o.payment_type, o.total_amount,
        o.paid_amount, o.balance_amount, o.expected_ready_date,
        c.name as customer_name, c.phone as customer_phone,
        COUNT(oi.id) as item_count
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE ${whereClause}
      GROUP BY o.id, c.name, c.phone
      ORDER BY o.${sortField} ${sortDirection}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const ordersResult = await pool.query(ordersQuery, params);

    res.json({
      success: true,
      data: ordersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
};

/**
 * Get single order details
 * GET /api/orders/:id
 */
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message,
    });
  }
};

/**
 * Helper function to get order by ID with all details
 */
const getOrderById = async (orderId) => {
  // Fetch order
  const orderResult = await pool.query(
    `SELECT
       o.*,
       c.name as customer_name, c.email as customer_email,
       c.phone as customer_phone, c.whatsapp_number,
       c.credit_days,
       ca.address_line1, ca.address_line2, ca.city,
       ca.state, ca.pincode, ca.landmark
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     LEFT JOIN customer_addresses ca ON o.delivery_address_id = ca.id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];

  // Fetch order items with SKU and lot details
  const itemsResult = await pool.query(
    `SELECT
       oi.*,
       s.sku_code, s.variety, p.name as product_name, s.price as current_price,
       l.lot_number, l.growth_stage, l.expected_ready_date as lot_ready_date
     FROM order_items oi
     JOIN skus s ON oi.sku_id = s.id
     JOIN products p ON s.product_id = p.id
     LEFT JOIN lots l ON oi.lot_id = l.id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at`,
    [orderId]
  );

  order.items = itemsResult.rows;

  // Fetch lot allocations from order_items (Phase 21 - Part 4)
  // Group allocations by lot for display
  const allocationsResult = await pool.query(
    `SELECT
       oi.id as order_item_id,
       oi.quantity as quantity_allocated,
       oi.allocated_at,
       l.id as lot_id,
       l.lot_number,
       l.growth_stage,
       l.expected_ready_date,
       s.sku_code,
       p.name as product_name
     FROM order_items oi
     JOIN lots l ON oi.lot_id = l.id
     JOIN skus s ON l.sku_id = s.id
     JOIN products p ON s.product_id = p.id
     WHERE oi.order_id = $1 AND oi.lot_id IS NOT NULL
     ORDER BY oi.created_at ASC`,
    [orderId]
  );

  order.allocations = allocationsResult.rows;

  // Fetch payment details
  const paymentsResult = await pool.query(
    `SELECT * FROM payments
     WHERE order_id = $1
     ORDER BY payment_date DESC`,
    [orderId]
  );

  order.payments = paymentsResult.rows;

  // Fetch order status history
  const statusHistoryResult = await pool.query(
    `SELECT
       osh.*,
       u.full_name as changed_by_name
     FROM order_status_history osh
     LEFT JOIN users u ON osh.changed_by = u.id
     WHERE osh.order_id = $1
     ORDER BY osh.changed_at ASC`,
    [orderId]
  );

  order.statusHistory = statusHistoryResult.rows;

  return order;
};

/**
 * Update order status
 * PUT /api/orders/:id/status
 */
const updateOrderStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // Fetch current order
    const orderResult = await client.query(
      `SELECT id, status, order_number
       FROM orders
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const order = orderResult.rows[0];

    // Validate status transition
    if (!isValidStatusTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${order.status} to ${status}`,
      });
    }

    // Update order status
    await client.query(
      `UPDATE orders
       SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, userId, id]
    );

    // If cancelling order, release allocated lots
    if (status === 'cancelled') {
      await lotAllocationService.releaseAllocatedLots(id);
    }

    await client.query('COMMIT');

    // Trigger WhatsApp notification for order ready status (Phase 9)
    try {
      if (status === 'ready') {
        notificationEvents.emit('order:ready', { orderId: id });
      }
    } catch (notificationError) {
      console.error('Error emitting order status notification:', notificationError.message);
      // Don't fail the status update if notification fails
    }

    // Fetch updated order
    const updatedOrder = await getOrderById(id);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: updatedOrder,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Allocate lots to order
 * POST /api/orders/:id/allocate
 */
const allocateLots = async (req, res) => {
  try {
    const { id } = req.params;
    const { allocations, auto = false } = req.body;

    // Check if order exists
    const orderResult = await pool.query(
      `SELECT id, status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const order = orderResult.rows[0];

    // Check if order status allows allocation
    const allowedStatuses = ['pending', 'confirmed', 'preparing'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot allocate lots for order with status: ${order.status}`,
      });
    }

    let result;

    if (auto) {
      // Automatic allocation
      result = await lotAllocationService.allocateLotsToOrder(id);
    } else {
      // Manual allocation
      if (!allocations || allocations.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'allocations array required for manual allocation',
        });
      }
      result = await lotAllocationService.manualAllocateLots(id, allocations);
    }

    res.json({
      success: true,
      message: 'Lot allocation completed',
      data: result,
    });
  } catch (error) {
    console.error('Error allocating lots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to allocate lots',
      error: error.message,
    });
  }
};

/**
 * Get order status timeline
 * GET /api/orders/:id/timeline
 */
const getOrderTimeline = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if order exists
    const orderResult = await pool.query(
      `SELECT id FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Fetch status history
    const historyResult = await pool.query(
      `SELECT
         osh.id, osh.previous_status, osh.new_status,
         osh.changed_at, osh.duration_minutes, osh.notes,
         u.full_name as changed_by_name, u.email as changed_by_email
       FROM order_status_history osh
       LEFT JOIN users u ON osh.changed_by = u.id
       WHERE osh.order_id = $1
       ORDER BY osh.changed_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: historyResult.rows,
    });
  } catch (error) {
    console.error('Error fetching order timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order timeline',
      error: error.message,
    });
  }
};

/**
 * Check lot availability for order items
 * POST /api/orders/check-availability
 */
/**
 * Check lot availability for order items
 * POST /api/orders/check-availability
 * Phase 21 - Part 1: Enhanced with delivery date validation
 */
const checkAvailability = async (req, res) => {
  try {
    const { items, delivery_date } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    if (!delivery_date) {
      return res.status(400).json({
        success: false,
        message: 'delivery_date is required',
      });
    }

    const availabilityChecks = [];

    for (const item of items) {
      // Check lots available by delivery date
      const lotsQuery = `
        SELECT
          l.id,
          l.lot_number,
          l.growth_stage,
          l.quantity,
          l.allocated_quantity,
          l.available_quantity,
          l.expected_ready_date,
          p.name as product_name,
          p.growth_period_days,
          s.sku_code,
          s.variety,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
        FROM lots l
        JOIN skus s ON l.sku_id = s.id
        JOIN products p ON s.product_id = p.id
        WHERE l.sku_id = $1
          AND l.deleted_at IS NULL
          AND l.growth_stage != 'sold'
          AND l.available_quantity > 0
        ORDER BY l.expected_ready_date ASC
      `;

      const lotsResult = await pool.query(lotsQuery, [item.sku_id]);
      const allLots = lotsResult.rows;

      // Fallback: get product/SKU info even when no lots exist
      let productName = lotsResult.rows[0]?.product_name || null;
      let variety = lotsResult.rows[0]?.variety || lotsResult.rows[0]?.sku_code || null;
      let skuCode = lotsResult.rows[0]?.sku_code || null;
      let growthPeriodDays = lotsResult.rows[0]?.growth_period_days || null;
      if (!productName) {
        const skuInfo = await pool.query(
          `SELECT s.sku_code, s.variety, p.name as product_name, p.growth_period_days
           FROM skus s JOIN products p ON s.product_id = p.id
           WHERE s.id = $1`,
          [item.sku_id]
        );
        if (skuInfo.rows.length > 0) {
          productName = skuInfo.rows[0].product_name;
          variety = skuInfo.rows[0].variety || skuInfo.rows[0].sku_code;
          skuCode = skuInfo.rows[0].sku_code;
          growthPeriodDays = skuInfo.rows[0].growth_period_days;
        }
      }

      // Lots ready by delivery date
      const lotsReadyByDate = allLots.filter(
        lot => new Date(lot.expected_ready_date) <= new Date(delivery_date)
      );

      const totalAvailable = lotsReadyByDate.reduce(
        (sum, lot) => sum + parseInt(lot.available_quantity),
        0
      );

      const canFulfill = totalAvailable >= item.quantity;

      // Find next available date if can't fulfill
      let nextAvailableDate = null;
      if (!canFulfill) {
        let cumulative = 0;
        for (const lot of allLots) {
          cumulative += parseInt(lot.available_quantity);
          if (cumulative >= item.quantity) {
            nextAvailableDate = lot.expected_ready_date;
            break;
          }
        }
      }

      availabilityChecks.push({
        sku_id: item.sku_id,
        sku_code: skuCode || 'Unknown',
        variety: variety || skuCode || 'Unknown',
        product_name: productName || 'Unknown',
        requested_quantity: item.quantity,
        requested_delivery_date: delivery_date,
        available_quantity: totalAvailable,
        available: canFulfill,
        ready_lots_count: lotsReadyByDate.length,
        pending_lots_count: allLots.length - lotsReadyByDate.length,
        total_lots_available: allLots.length,
        next_available_date: nextAvailableDate,
        growth_period_days: growthPeriodDays,
        lots_details: lotsReadyByDate.slice(0, 5).map(lot => ({
          lot_number: lot.lot_number,
          available_quantity: parseInt(lot.available_quantity),
          expected_ready_date: lot.expected_ready_date,
          days_until_ready: parseInt(lot.days_until_ready || 0),
          growth_stage: lot.growth_stage
        }))
      });
    }

    const allAvailable = availabilityChecks.every((check) => check.available);

    res.json({
      success: true,
      all_available: allAvailable,
      delivery_date: delivery_date,
      data: availabilityChecks,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: error.message,
    });
  }
};

/**
 * Get recent orders (last 10)
 * GET /api/orders/recent
 */
const getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         o.status,
         o.total_amount,
         o.delivery_date,
         o.order_date,
         o.created_at,
         c.name as customer_name,
         c.email as customer_email
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.deleted_at IS NULL
       ORDER BY o.order_date DESC, o.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent orders',
      error: error.message,
    });
  }
};

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  getRecentOrders,
  updateOrderStatus,
  allocateLots,
  getOrderTimeline,
  checkAvailability,
};
