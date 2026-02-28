# Phase 21 - PART 3: Reports & Delivery Management Fixes

## PART 3A: REPORTS & ANALYTICS FIXES

### Current Issues:
1. Report endpoints exist but frontend not showing data properly
2. No revenue vs expenses comparison
3. Sales reports may not have proper aggregations
4. Inventory reports missing key metrics

### Solution Overview:
The backend `reportController.js` already has good structure using service layer. We need to:
1. Verify/enhance report services
2. Add expense tracking (if within scope)
3. Ensure proper data aggregation

### Report Service Verification

**Check if these services exist - if not, we'll need to create them:**
- `backend/services/salesReportService.js`
- `backend/services/inventoryReportService.js`
- `backend/services/deliveryReportService.js`
- `backend/services/customerReportService.js`
- `backend/services/financialReportService.js`

### Enhancement 1: Sales Report Service

**Create/Verify backend/services/salesReportService.js:**

```javascript
/**
 * Sales Report Service
 * Generates comprehensive sales analytics
 */

const pool = require('../config/database');

/**
 * Get sales analytics for date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} groupBy - Grouping interval (day, week, month)
 * @returns {Promise<Object>} Sales analytics data
 */
const getSalesAnalytics = async (startDate, endDate, groupBy = 'day') => {
  // Determine date truncation based on groupBy
  const dateTrunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

  // Sales over time
  const salesOverTimeQuery = `
    SELECT
      DATE_TRUNC($3, order_date) as period,
      COUNT(*) as order_count,
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as collected_revenue,
      AVG(total_amount) as avg_order_value,
      COUNT(DISTINCT customer_id) as unique_customers
    FROM orders
    WHERE order_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
      AND status != 'cancelled'
    GROUP BY DATE_TRUNC($3, order_date)
    ORDER BY period ASC
  `;

  const salesOverTime = await pool.query(salesOverTimeQuery, [startDate, endDate, dateTrunc]);

  // Overall summary
  const summaryQuery = `
    SELECT
      COUNT(*) as total_orders,
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as collected_revenue,
      SUM(balance_amount) as pending_revenue,
      AVG(total_amount) as avg_order_value,
      COUNT(DISTINCT customer_id) as unique_customers,
      SUM(subtotal_amount) as subtotal,
      SUM(discount_amount) as total_discount,
      SUM(tax_amount) as total_tax
    FROM orders
    WHERE order_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
      AND status != 'cancelled'
  `;

  const summary = await pool.query(summaryQuery, [startDate, endDate]);

  // Sales by product
  const productSalesQuery = `
    SELECT
      p.id,
      p.name as product_name,
      p.category,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.quantity * oi.unit_price) as revenue,
      AVG(oi.unit_price) as avg_price
    FROM order_items oi
    JOIN skus s ON oi.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.order_date BETWEEN $1 AND $2
      AND o.deleted_at IS NULL
      AND o.status != 'cancelled'
    GROUP BY p.id, p.name, p.category
    ORDER BY revenue DESC
  `;

  const productSales = await pool.query(productSalesQuery, [startDate, endDate]);

  // Sales by status
  const statusBreakdownQuery = `
    SELECT
      status,
      COUNT(*) as count,
      SUM(total_amount) as revenue
    FROM orders
    WHERE order_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
    GROUP BY status
    ORDER BY count DESC
  `;

  const statusBreakdown = await pool.query(statusBreakdownQuery, [startDate, endDate]);

  // Top customers
  const topCustomersQuery = `
    SELECT
      c.id,
      c.name as customer_name,
      c.phone,
      COUNT(o.id) as order_count,
      SUM(o.total_amount) as total_spent,
      AVG(o.total_amount) as avg_order_value,
      MAX(o.order_date) as last_order_date
    FROM customers c
    JOIN orders o ON c.id = o.customer_id
    WHERE o.order_date BETWEEN $1 AND $2
      AND o.deleted_at IS NULL
      AND o.status != 'cancelled'
    GROUP BY c.id, c.name, c.phone
    ORDER BY total_spent DESC
    LIMIT 10
  `;

  const topCustomers = await pool.query(topCustomersQuery, [startDate, endDate]);

  return {
    summary: {
      totalOrders: parseInt(summary.rows[0].total_orders),
      totalRevenue: parseFloat(summary.rows[0].total_revenue),
      collectedRevenue: parseFloat(summary.rows[0].collected_revenue),
      pendingRevenue: parseFloat(summary.rows[0].pending_revenue),
      avgOrderValue: parseFloat(summary.rows[0].avg_order_value),
      uniqueCustomers: parseInt(summary.rows[0].unique_customers),
      subtotal: parseFloat(summary.rows[0].subtotal),
      totalDiscount: parseFloat(summary.rows[0].total_discount),
      totalTax: parseFloat(summary.rows[0].total_tax)
    },
    salesOverTime: salesOverTime.rows.map(row => ({
      period: row.period,
      orderCount: parseInt(row.order_count),
      totalRevenue: parseFloat(row.total_revenue),
      collectedRevenue: parseFloat(row.collected_revenue),
      avgOrderValue: parseFloat(row.avg_order_value),
      uniqueCustomers: parseInt(row.unique_customers)
    })),
    productSales: productSales.rows.map(row => ({
      productId: row.id,
      productName: row.product_name,
      category: row.category,
      orderCount: parseInt(row.order_count),
      unitsSold: parseInt(row.units_sold),
      revenue: parseFloat(row.revenue),
      avgPrice: parseFloat(row.avg_price)
    })),
    statusBreakdown: statusBreakdown.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      revenue: parseFloat(row.revenue)
    })),
    topCustomers: topCustomers.rows.map(row => ({
      customerId: row.id,
      customerName: row.customer_name,
      phone: row.phone,
      orderCount: parseInt(row.order_count),
      totalSpent: parseFloat(row.total_spent),
      avgOrderValue: parseFloat(row.avg_order_value),
      lastOrderDate: row.last_order_date
    }))
  };
};

module.exports = {
  getSalesAnalytics
};
```

### Enhancement 2: Inventory Report Service

**Create/Verify backend/services/inventoryReportService.js:**

```javascript
/**
 * Inventory Report Service
 * Generates inventory analytics and reports
 */

const pool = require('../config/database');

/**
 * Get comprehensive inventory analytics
 * @returns {Promise<Object>} Inventory analytics data
 */
const getInventoryAnalytics = async () => {
  // Inventory summary by stage
  const stageS ummaryQuery = `
    SELECT
      l.growth_stage,
      COUNT(l.id) as lot_count,
      SUM(l.quantity) as total_units,
      SUM(l.allocated_quantity) as allocated_units,
      SUM(l.available_quantity) as available_units,
      AVG(EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE))) as avg_days_to_ready
    FROM lots l
    WHERE l.deleted_at IS NULL
    GROUP BY l.growth_stage
    ORDER BY
      CASE l.growth_stage
        WHEN 'seed' THEN 1
        WHEN 'germination' THEN 2
        WHEN 'seedling' THEN 3
        WHEN 'transplant' THEN 4
        WHEN 'ready' THEN 5
        WHEN 'sold' THEN 6
      END
  `;

  const stageSummary = await pool.query(stageSummaryQuery);

  // Inventory by product
  const productInventoryQuery = `
    SELECT
      p.id,
      p.name as product_name,
      p.category,
      p.growth_period_days,
      COUNT(DISTINCT l.id) as lot_count,
      SUM(l.quantity) as total_units,
      SUM(l.available_quantity) as available_units,
      SUM(l.allocated_quantity) as allocated_units,
      COUNT(DISTINCT CASE WHEN l.growth_stage = 'ready' THEN l.id END) as ready_lots,
      MIN(l.expected_ready_date) as next_ready_date
    FROM products p
    LEFT JOIN skus s ON s.product_id = p.id AND s.deleted_at IS NULL
    LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.name, p.category, p.growth_period_days
    ORDER BY p.name
  `;

  const productInventory = await pool.query(productInventoryQuery);

  // Stock levels vs requirements
  const stockLevelsQuery = `
    SELECT
      p.name as product_name,
      s.sku_code,
      s.min_stock_level,
      s.max_stock_level,
      COALESCE(SUM(l.available_quantity), 0) as current_stock,
      CASE
        WHEN COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level THEN 'Low Stock'
        WHEN COALESCE(SUM(l.available_quantity), 0) > s.max_stock_level THEN 'Overstock'
        ELSE 'Normal'
      END as stock_status,
      s.min_stock_level - COALESCE(SUM(l.available_quantity), 0) as reorder_quantity
    FROM skus s
    JOIN products p ON s.product_id = p.id
    LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL AND l.growth_stage = 'ready'
    WHERE s.deleted_at IS NULL
    GROUP BY p.name, s.id, s.sku_code, s.min_stock_level, s.max_stock_level
    HAVING COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level
       OR COALESCE(SUM(l.available_quantity), 0) > s.max_stock_level
    ORDER BY
      CASE
        WHEN COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level THEN 1
        ELSE 2
      END,
      (s.min_stock_level - COALESCE(SUM(l.available_quantity), 0)) DESC
  `;

  const stockLevels = await pool.query(stockLevelsQuery);

  // Inventory aging (lots by age)
  const inventoryAgingQuery = `
    SELECT
      CASE
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 30 THEN '0-30 days'
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 60 THEN '31-60 days'
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 90 THEN '61-90 days'
        ELSE '90+ days'
      END as age_range,
      COUNT(l.id) as lot_count,
      SUM(l.available_quantity) as available_units
    FROM lots l
    WHERE l.deleted_at IS NULL
      AND l.growth_stage != 'sold'
    GROUP BY
      CASE
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 30 THEN '0-30 days'
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 60 THEN '31-60 days'
        WHEN EXTRACT(DAY FROM (CURRENT_DATE - l.planted_date)) <= 90 THEN '61-90 days'
        ELSE '90+ days'
      END
    ORDER BY
      CASE age_range
        WHEN '0-30 days' THEN 1
        WHEN '31-60 days' THEN 2
        WHEN '61-90 days' THEN 3
        ELSE 4
      END
  `;

  const inventoryAging = await pool.query(inventoryAgingQuery);

  // Upcoming ready inventory (next 14 days)
  const upcomingReadyQuery = `
    SELECT
      l.lot_number,
      l.expected_ready_date,
      l.available_quantity,
      l.growth_stage,
      p.name as product_name,
      s.sku_code,
      EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
    FROM lots l
    JOIN skus s ON l.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    WHERE l.expected_ready_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      AND l.growth_stage != 'ready'
      AND l.deleted_at IS NULL
    ORDER BY l.expected_ready_date ASC
  `;

  const upcomingReady = await pool.query(upcomingReadyQuery);

  // Overall summary
  const overallSummaryQuery = `
    SELECT
      COUNT(DISTINCT p.id) as total_products,
      COUNT(DISTINCT s.id) as total_skus,
      COUNT(l.id) as total_lots,
      COALESCE(SUM(l.quantity), 0) as total_units,
      COALESCE(SUM(l.available_quantity), 0) as available_units,
      COALESCE(SUM(l.allocated_quantity), 0) as allocated_units,
      COUNT(CASE WHEN l.growth_stage = 'ready' THEN 1 END) as ready_lots
    FROM products p
    LEFT JOIN skus s ON s.product_id = p.id AND s.deleted_at IS NULL
    LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
  `;

  const overallSummary = await pool.query(overallSummaryQuery);

  return {
    summary: {
      totalProducts: parseInt(overallSummary.rows[0].total_products),
      totalSkus: parseInt(overallSummary.rows[0].total_skus),
      totalLots: parseInt(overallSummary.rows[0].total_lots),
      totalUnits: parseInt(overallSummary.rows[0].total_units),
      availableUnits: parseInt(overallSummary.rows[0].available_units),
      allocatedUnits: parseInt(overallSummary.rows[0].allocated_units),
      readyLots: parseInt(overallSummary.rows[0].ready_lots),
      utilizationRate: overallSummary.rows[0].total_units > 0
        ? ((overallSummary.rows[0].allocated_units / overallSummary.rows[0].total_units) * 100).toFixed(2)
        : 0
    },
    byGrowthStage: stageSummary.rows.map(row => ({
      growthStage: row.growth_stage,
      lotCount: parseInt(row.lot_count),
      totalUnits: parseInt(row.total_units),
      allocatedUnits: parseInt(row.allocated_units),
      availableUnits: parseInt(row.available_units),
      avgDaysToReady: row.avg_days_to_ready ? parseFloat(row.avg_days_to_ready).toFixed(1) : null
    })),
    byProduct: productInventory.rows.map(row => ({
      productId: row.id,
      productName: row.product_name,
      category: row.category,
      growthPeriodDays: row.growth_period_days,
      lotCount: parseInt(row.lot_count || 0),
      totalUnits: parseInt(row.total_units || 0),
      availableUnits: parseInt(row.available_units || 0),
      allocatedUnits: parseInt(row.allocated_units || 0),
      readyLots: parseInt(row.ready_lots || 0),
      nextReadyDate: row.next_ready_date
    })),
    stockAlerts: stockLevels.rows.map(row => ({
      productName: row.product_name,
      skuCode: row.sku_code,
      minStockLevel: parseInt(row.min_stock_level),
      maxStockLevel: parseInt(row.max_stock_level),
      currentStock: parseInt(row.current_stock),
      stockStatus: row.stock_status,
      reorderQuantity: parseInt(row.reorder_quantity)
    })),
    aging: inventoryAging.rows.map(row => ({
      ageRange: row.age_range,
      lotCount: parseInt(row.lot_count),
      availableUnits: parseInt(row.available_units)
    })),
    upcomingReady: upcomingReady.rows.map(row => ({
      lotNumber: row.lot_number,
      productName: row.product_name,
      skuCode: row.sku_code,
      expectedReadyDate: row.expected_ready_date,
      availableQuantity: parseInt(row.available_quantity),
      growthStage: row.growth_stage,
      daysUntilReady: parseInt(row.days_until_ready)
    }))
  };
};

module.exports = {
  getInventoryAnalytics
};
```

---

## PART 3B: DELIVERY MANAGEMENT FIXES

### Current Issues:
1. Delivery tab shows nothing (frontend issue)
2. Backend delivery controller already has comprehensive implementation
3. Need to verify delivery routes are being created/displayed

### Analysis:
Based on `deliveryController.js` review, the backend has:
- Route creation with optimization
- Driver/vehicle assignment
- GPS tracking integration
- Route progress monitoring

**Problem is likely frontend integration.**

### Backend Verification - Add Delivery Summary Endpoint

**Add to backend/controllers/deliveryController.js:**

```javascript
/**
 * Get delivery summary for dashboard
 * GET /api/delivery/summary
 */
const getDeliverySummary = async (req, res) => {
  try {
    // Active routes today
    const activeRoutesResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM delivery_routes
       WHERE route_date = CURRENT_DATE
       AND status IN ('assigned', 'in_progress')
       AND deleted_at IS NULL`
    );

    // Routes by status
    const routesByStatusResult = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM delivery_routes
       WHERE route_date >= CURRENT_DATE - INTERVAL '7 days'
       AND deleted_at IS NULL
       GROUP BY status`
    );

    // Deliveries today
    const deliveriesTodayResult = await pool.query(
      `SELECT
         COUNT(DISTINCT o.id) as total,
         COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as completed,
         COUNT(DISTINCT CASE WHEN o.status = 'dispatched' THEN o.id END) as in_progress
       FROM orders o
       WHERE o.delivery_date = CURRENT_DATE
       AND o.deleted_at IS NULL`
    );

    // Upcoming deliveries (next 3 days)
    const upcomingDeliveriesResult = await pool.query(
      `SELECT
         DATE(o.delivery_date) as date,
         COUNT(*) as order_count
       FROM orders o
       WHERE o.delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
       AND o.status IN ('ready', 'preparing')
       AND o.deleted_at IS NULL
       GROUP BY DATE(o.delivery_date)
       ORDER BY date ASC`
    );

    // Driver performance today
    const driverPerformanceResult = await pool.query(
      `SELECT
         u.id,
         u.full_name as driver_name,
         COUNT(DISTINCT dr.id) as routes_assigned,
         COUNT(DISTINCT rs.id) as stops_completed
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       LEFT JOIN delivery_routes dr ON dr.driver_id = u.id AND dr.route_date = CURRENT_DATE
       LEFT JOIN route_stops rs ON rs.route_id = dr.id AND rs.status = 'completed'
       WHERE r.name = 'Delivery'
       AND u.status = 'active'
       GROUP BY u.id, u.full_name
       HAVING COUNT(DISTINCT dr.id) > 0`
    );

    res.json({
      success: true,
      data: {
        activeRoutesToday: parseInt(activeRoutesResult.rows[0].count),
        routesByStatus: routesByStatusResult.rows.map(row => ({
          status: row.status,
          count: parseInt(row.count)
        })),
        deliveriesToday: {
          total: parseInt(deliveriesTodayResult.rows[0].total),
          completed: parseInt(deliveriesTodayResult.rows[0].completed),
          inProgress: parseInt(deliveriesTodayResult.rows[0].in_progress)
        },
        upcomingDeliveries: upcomingDeliveriesResult.rows.map(row => ({
          date: row.date,
          orderCount: parseInt(row.order_count)
        })),
        driverPerformance: driverPerformanceResult.rows.map(row => ({
          driverId: row.id,
          driverName: row.driver_name,
          routesAssigned: parseInt(row.routes_assigned),
          stopsCompleted: parseInt(row.stops_completed)
        }))
      }
    });
  } catch (error) {
    console.error('Get delivery summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery summary',
      error: error.message
    });
  }
};

/**
 * Get all orders ready for delivery (not yet assigned to routes)
 * GET /api/delivery/available-orders
 */
const getAvailableOrdersForDelivery = async (req, res) => {
  try {
    const { delivery_date } = req.query;

    let dateFilter = 'o.delivery_date = CURRENT_DATE';
    const params = [];

    if (delivery_date) {
      dateFilter = 'o.delivery_date = $1';
      params.push(delivery_date);
    }

    const query = `
      SELECT
        o.id,
        o.order_number,
        o.delivery_date,
        o.delivery_slot,
        o.total_amount,
        c.name as customer_name,
        c.phone as customer_phone,
        ca.address_line1,
        ca.address_line2,
        ca.city,
        ca.state,
        ca.pincode,
        ca.gps_latitude,
        ca.gps_longitude,
        COUNT(oi.id) as item_count,
        SUM(oi.quantity) as total_units
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN customer_addresses ca ON o.delivery_address_id = ca.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE ${dateFilter}
        AND o.status = 'ready'
        AND o.deleted_at IS NULL
        AND o.id NOT IN (
          SELECT DISTINCT rs.order_id
          FROM route_stops rs
          JOIN delivery_routes dr ON rs.route_id = dr.id
          WHERE dr.status IN ('planned', 'assigned', 'in_progress')
          AND dr.deleted_at IS NULL
        )
      GROUP BY o.id, o.order_number, o.delivery_date, o.delivery_slot,
               o.total_amount, c.name, c.phone, ca.address_line1,
               ca.address_line2, ca.city, ca.state, ca.pincode,
               ca.gps_latitude, ca.gps_longitude
      ORDER BY o.delivery_slot, o.order_number
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        orderId: row.id,
        orderNumber: row.order_number,
        deliveryDate: row.delivery_date,
        deliverySlot: row.delivery_slot,
        totalAmount: parseFloat(row.total_amount),
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        address: {
          line1: row.address_line1,
          line2: row.address_line2,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          latitude: row.gps_latitude,
          longitude: row.gps_longitude
        },
        itemCount: parseInt(row.item_count),
        totalUnits: parseInt(row.total_units)
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available orders',
      error: error.message
    });
  }
};

// Add to module.exports
module.exports = {
  createRoute,
  getRoutes,
  getRouteById,
  assignRoute,
  startRoute,
  getRouteProgress,
  getDeliverySummary,           // NEW
  getAvailableOrdersForDelivery // NEW
};
```

**Update backend/routes/delivery.js:**

```javascript
// Add new routes
router.get('/summary', authenticate, deliveryController.getDeliverySummary);
router.get('/available-orders', authenticate, deliveryController.getAvailableOrdersForDelivery);
```

---

## PART 3C: FINANCIAL REPORT SERVICE (Revenue vs Expenses)

**Create backend/services/financialReportService.js:**

```javascript
/**
 * Financial Report Service
 * NOTE: Expense tracking not fully implemented yet.
 * This service provides revenue analysis and placeholders for expenses.
 */

const pool = require('../config/database');

/**
 * Get financial summary
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} groupBy - Grouping interval (day, week, month)
 * @returns {Promise<Object>} Financial summary data
 */
const getFinancialSummary = async (startDate, endDate, groupBy = 'day') => {
  const dateTrunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

  // Revenue data
  const revenueQuery = `
    SELECT
      DATE_TRUNC($3, order_date) as period,
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as collected_revenue,
      SUM(balance_amount) as pending_revenue,
      COUNT(*) as order_count
    FROM orders
    WHERE order_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
      AND status != 'cancelled'
    GROUP BY DATE_TRUNC($3, order_date)
    ORDER BY period ASC
  `;

  const revenueData = await pool.query(revenueQuery, [startDate, endDate, dateTrunc]);

  // Overall summary
  const summaryQuery = `
    SELECT
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as collected_revenue,
      SUM(balance_amount) as pending_revenue,
      COUNT(*) as order_count,
      AVG(total_amount) as avg_order_value
    FROM orders
    WHERE order_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
      AND status != 'cancelled'
  `;

  const summary = await pool.query(summaryQuery, [startDate, endDate]);

  // Payment collection summary
  const paymentsQuery = `
    SELECT
      payment_method,
      COUNT(*) as transaction_count,
      SUM(amount) as total_collected
    FROM payments
    WHERE payment_date BETWEEN $1 AND $2
      AND deleted_at IS NULL
      AND status = 'success'
    GROUP BY payment_method
    ORDER BY total_collected DESC
  `;

  const payments = await pool.query(paymentsQuery, [startDate, endDate]);

  // Note: Expenses would require vendor_payments or expenses table
  // Placeholder for future implementation
  const expenses = {
    total: 0,
    breakdown: [],
    note: 'Expense tracking not yet implemented'
  };

  return {
    summary: {
      totalRevenue: parseFloat(summary.rows[0]?.total_revenue || 0),
      collectedRevenue: parseFloat(summary.rows[0]?.collected_revenue || 0),
      pendingRevenue: parseFloat(summary.rows[0]?.pending_revenue || 0),
      totalExpenses: 0, // Placeholder
      netProfit: parseFloat(summary.rows[0]?.collected_revenue || 0), // Revenue - Expenses
      orderCount: parseInt(summary.rows[0]?.order_count || 0),
      avgOrderValue: parseFloat(summary.rows[0]?.avg_order_value || 0)
    },
    revenueOverTime: revenueData.rows.map(row => ({
      period: row.period,
      totalRevenue: parseFloat(row.total_revenue),
      collectedRevenue: parseFloat(row.collected_revenue),
      pendingRevenue: parseFloat(row.pending_revenue),
      orderCount: parseInt(row.order_count)
    })),
    paymentMethods: payments.rows.map(row => ({
      method: row.payment_method,
      transactionCount: parseInt(row.transaction_count),
      totalCollected: parseFloat(row.total_collected)
    })),
    expenses: expenses,
    profitMargin: summary.rows[0]?.collected_revenue > 0
      ? ((parseFloat(summary.rows[0].collected_revenue) / parseFloat(summary.rows[0].total_revenue)) * 100).toFixed(2)
      : 0
  };
};

module.exports = {
  getFinancialSummary
};
```

---

## Summary PART 3

### New/Modified Backend Files:

**Report Services:**
1. **CREATE:** `backend/services/salesReportService.js` - Comprehensive sales analytics
2. **CREATE:** `backend/services/inventoryReportService.js` - Inventory analytics
3. **CREATE:** `backend/services/financialReportService.js` - Financial summary (revenue focus)

**Delivery Enhancements:**
4. **MODIFY:** `backend/controllers/deliveryController.js` - Add 2 new endpoints
5. **MODIFY:** `backend/routes/delivery.js` - Register new delivery endpoints

### New API Endpoints:

**Delivery:**
- `GET /api/delivery/summary` - Delivery dashboard summary
- `GET /api/delivery/available-orders?delivery_date=YYYY-MM-DD` - Orders ready for route assignment

**Reports:** (Already exist, services now created/verified)
- `GET /api/reports/sales?start_date=X&end_date=Y&group_by=day`
- `GET /api/reports/inventory`
- `GET /api/reports/delivery?start_date=X&end_date=Y`
- `GET /api/reports/customers?start_date=X&end_date=Y`
- `GET /api/reports/financial?start_date=X&end_date=Y&group_by=day`

### Testing Checklist PART 3:

- [ ] Sales report shows revenue trends and top products
- [ ] Inventory report shows stock by growth stage and alerts
- [ ] Financial report shows revenue breakdown (expenses noted as placeholder)
- [ ] Delivery summary shows active routes and driver performance
- [ ] Available orders for delivery endpoint returns unassigned orders
- [ ] Reports can be filtered by date range and group by day/week/month

### Notes:
1. **Expense Tracking**: Not fully implemented. Would require:
   - `vendor_payments` table for seed purchases
   - `expenses` table for operational costs
   - Currently only revenue is tracked

2. **Delivery Frontend**: Backend is comprehensive. Frontend needs:
   - Route list page
   - Route creation interface
   - Driver assignment UI
   - GPS tracking display

---

*Continue to PART 4 for Frontend Integration Guide*
