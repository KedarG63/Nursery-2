# Phase 21 - PART 2: Dashboard & Payment Management Fixes

## PART 2A: DASHBOARD COMPREHENSIVE FIXES

### Current Issues:
1. Dashboard shows minimal KPIs (only basic counts)
2. No order readiness countdown (days remaining based on lot maturity)
3. No upcoming payment tracking
4. No revenue analytics or trends
5. No actionable insights

### Solution: Complete Dashboard Controller Overhaul

**Modify: backend/controllers/dashboardController.js**

Replace entire file with comprehensive dashboard implementation:

```javascript
/**
 * Dashboard Controller - Comprehensive
 * Provides KPIs, insights, and actionable data for dashboard
 */

const pool = require('../config/database');

/**
 * Get comprehensive dashboard data
 * GET /api/dashboard/overview
 */
const getDashboardOverview = async (req, res) => {
  try {
    const dashboardData = {
      kpis: await getKPIsData(),
      orderInsights: await getOrderInsights(),
      inventoryInsights: await getInventoryInsights(),
      paymentInsights: await getPaymentInsights(),
      revenueAnalytics: await getRevenueAnalytics(),
      upcomingDeliveries: await getUpcomingDeliveries(),
      alerts: await getSystemAlerts()
    };

    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

/**
 * Get Key Performance Indicators
 */
const getKPIsData = async () => {
  // Active orders
  const activeOrdersResult = await pool.query(
    `SELECT COUNT(*) as count FROM orders
     WHERE status IN ('pending', 'confirmed', 'preparing', 'ready', 'dispatched')
     AND deleted_at IS NULL`
  );

  // Orders today
  const ordersTodayResult = await pool.query(
    `SELECT COUNT(*) as count FROM orders
     WHERE DATE(order_date) = CURRENT_DATE
     AND deleted_at IS NULL`
  );

  // Ready lots count
  const readyLotsResult = await pool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(available_quantity), 0) as total_units
     FROM lots
     WHERE growth_stage = 'ready'
     AND available_quantity > 0
     AND deleted_at IS NULL`
  );

  // Pending deliveries
  const pendingDeliveriesResult = await pool.query(
    `SELECT COUNT(DISTINCT o.id) as count
     FROM orders o
     WHERE o.status = 'dispatched'
     AND o.deleted_at IS NULL`
  );

  // Revenue this month
  const currentMonth = new Date();
  const revenueResult = await pool.query(
    `SELECT
       COALESCE(SUM(total_amount), 0) as total_revenue,
       COALESCE(SUM(paid_amount), 0) as collected_revenue,
       COALESCE(SUM(balance_amount), 0) as pending_revenue,
       COUNT(*) as order_count
     FROM orders
     WHERE status IN ('delivered', 'dispatched', 'ready')
     AND EXTRACT(MONTH FROM order_date) = $1
     AND EXTRACT(YEAR FROM order_date) = $2
     AND deleted_at IS NULL`,
    [currentMonth.getMonth() + 1, currentMonth.getFullYear()]
  );

  // Low stock alerts
  const lowStockResult = await pool.query(
    `SELECT COUNT(DISTINCT s.id) as count
     FROM skus s
     LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL
     GROUP BY s.id
     HAVING COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level`
  );

  // Customer count
  const customerResult = await pool.query(
    `SELECT COUNT(*) as total,
       COUNT(CASE WHEN status = 'active' THEN 1 END) as active
     FROM customers
     WHERE deleted_at IS NULL`
  );

  return {
    activeOrders: parseInt(activeOrdersResult.rows[0].count),
    ordersToday: parseInt(ordersTodayResult.rows[0].count),
    readyLots: parseInt(readyLotsResult.rows[0].count),
    readyUnits: parseInt(readyLotsResult.rows[0].total_units),
    pendingDeliveries: parseInt(pendingDeliveriesResult.rows[0].count),
    monthlyRevenue: parseFloat(revenueResult.rows[0].total_revenue),
    collectedRevenue: parseFloat(revenueResult.rows[0].collected_revenue),
    pendingRevenue: parseFloat(revenueResult.rows[0].pending_revenue),
    monthlyOrders: parseInt(revenueResult.rows[0].order_count),
    lowStockItems: parseInt(lowStockResult.rows[0]?.count || 0),
    totalCustomers: parseInt(customerResult.rows[0].total),
    activeCustomers: parseInt(customerResult.rows[0].active)
  };
};

/**
 * Get Order Insights with readiness timeline
 */
const getOrderInsights = async () => {
  // Orders by status
  const ordersByStatusResult = await pool.query(
    `SELECT status, COUNT(*) as count
     FROM orders
     WHERE deleted_at IS NULL
     AND status != 'cancelled'
     GROUP BY status
     ORDER BY
       CASE status
         WHEN 'pending' THEN 1
         WHEN 'confirmed' THEN 2
         WHEN 'preparing' THEN 3
         WHEN 'ready' THEN 4
         WHEN 'dispatched' THEN 5
         WHEN 'delivered' THEN 6
       END`
  );

  // Orders with days to delivery (readiness countdown)
  const ordersReadinessResult = await pool.query(
    `SELECT
       o.id,
       o.order_number,
       o.status,
       o.delivery_date,
       o.expected_ready_date,
       c.name as customer_name,
       EXTRACT(DAY FROM (o.expected_ready_date - CURRENT_DATE)) as days_until_ready,
       EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) as days_until_delivery,
       CASE
         WHEN o.expected_ready_date > o.delivery_date THEN 'At Risk'
         WHEN EXTRACT(DAY FROM (o.expected_ready_date - CURRENT_DATE)) <= 3 THEN 'Urgent'
         WHEN EXTRACT(DAY FROM (o.expected_ready_date - CURRENT_DATE)) <= 7 THEN 'Soon'
         ELSE 'On Track'
       END as readiness_status
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.status IN ('pending', 'confirmed', 'preparing')
     AND o.deleted_at IS NULL
     AND o.expected_ready_date IS NOT NULL
     ORDER BY o.expected_ready_date ASC
     LIMIT 10`
  );

  // Orders at risk (expected_ready_date > delivery_date)
  const atRiskOrdersResult = await pool.query(
    `SELECT COUNT(*) as count
     FROM orders
     WHERE expected_ready_date > delivery_date
     AND status IN ('pending', 'confirmed', 'preparing')
     AND deleted_at IS NULL`
  );

  return {
    byStatus: ordersByStatusResult.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    })),
    readinessTimeline: ordersReadinessResult.rows.map(row => ({
      orderId: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      status: row.status,
      deliveryDate: row.delivery_date,
      expectedReadyDate: row.expected_ready_date,
      daysUntilReady: parseInt(row.days_until_ready),
      daysUntilDelivery: parseInt(row.days_until_delivery),
      readinessStatus: row.readiness_status
    })),
    atRiskCount: parseInt(atRiskOrdersResult.rows[0].count)
  };
};

/**
 * Get Inventory Insights
 */
const getInventoryInsights = async () => {
  // Inventory by growth stage
  const inventoryByStageResult = await pool.query(
    `SELECT
       l.growth_stage,
       COUNT(l.id) as lot_count,
       SUM(l.quantity) as total_quantity,
       SUM(l.available_quantity) as available_quantity,
       SUM(l.allocated_quantity) as allocated_quantity
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
       END`
  );

  // Lots becoming ready soon (next 7 days)
  const lotsReadySoonResult = await pool.query(
    `SELECT
       l.lot_number,
       l.expected_ready_date,
       l.available_quantity,
       p.name as product_name,
       s.sku_code,
       EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
     FROM lots l
     JOIN skus s ON l.sku_id = s.id
     JOIN products p ON s.product_id = p.id
     WHERE l.expected_ready_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     AND l.growth_stage != 'ready'
     AND l.deleted_at IS NULL
     ORDER BY l.expected_ready_date ASC
     LIMIT 10`
  );

  // Products with low stock
  const lowStockProductsResult = await pool.query(
    `SELECT
       p.id,
       p.name as product_name,
       s.id as sku_id,
       s.sku_code,
       s.min_stock_level,
       COALESCE(SUM(l.available_quantity), 0) as current_stock,
       (s.min_stock_level - COALESCE(SUM(l.available_quantity), 0)) as stock_deficit
     FROM skus s
     JOIN products p ON s.product_id = p.id
     LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL AND l.growth_stage = 'ready'
     WHERE s.deleted_at IS NULL
     GROUP BY p.id, p.name, s.id, s.sku_code, s.min_stock_level
     HAVING COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level
     ORDER BY (s.min_stock_level - COALESCE(SUM(l.available_quantity), 0)) DESC
     LIMIT 10`
  );

  return {
    byGrowthStage: inventoryByStageResult.rows.map(row => ({
      growthStage: row.growth_stage,
      lotCount: parseInt(row.lot_count),
      totalQuantity: parseInt(row.total_quantity),
      availableQuantity: parseInt(row.available_quantity),
      allocatedQuantity: parseInt(row.allocated_quantity)
    })),
    lotsReadySoon: lotsReadySoonResult.rows.map(row => ({
      lotNumber: row.lot_number,
      productName: row.product_name,
      skuCode: row.sku_code,
      expectedReadyDate: row.expected_ready_date,
      availableQuantity: parseInt(row.available_quantity),
      daysUntilReady: parseInt(row.days_until_ready)
    })),
    lowStockProducts: lowStockProductsResult.rows.map(row => ({
      productId: row.id,
      productName: row.product_name,
      skuId: row.sku_id,
      skuCode: row.sku_code,
      minStockLevel: parseInt(row.min_stock_level),
      currentStock: parseInt(row.current_stock),
      stockDeficit: parseInt(row.stock_deficit)
    }))
  };
};

/**
 * Get Payment Insights
 */
const getPaymentInsights = async () => {
  // Upcoming payments (orders with balance > 0, delivery date within 7 days)
  const upcomingPaymentsResult = await pool.query(
    `SELECT
       o.id,
       o.order_number,
       c.name as customer_name,
       c.phone as customer_phone,
       o.total_amount,
       o.paid_amount,
       o.balance_amount,
       o.delivery_date,
       EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) as days_until_delivery,
       o.payment_type,
       CASE
         WHEN o.delivery_date < CURRENT_DATE THEN 'Overdue'
         WHEN EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) <= 2 THEN 'Due Soon'
         ELSE 'Upcoming'
       END as payment_urgency
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.balance_amount > 0
     AND o.status IN ('confirmed', 'preparing', 'ready', 'dispatched', 'delivered')
     AND o.deleted_at IS NULL
     ORDER BY o.delivery_date ASC
     LIMIT 10`
  );

  // Payment summary
  const paymentSummaryResult = await pool.query(
    `SELECT
       COUNT(*) as total_orders_with_balance,
       SUM(balance_amount) as total_outstanding,
       SUM(CASE WHEN delivery_date < CURRENT_DATE THEN balance_amount ELSE 0 END) as overdue_amount,
       COUNT(CASE WHEN delivery_date < CURRENT_DATE THEN 1 END) as overdue_count
     FROM orders
     WHERE balance_amount > 0
     AND status != 'cancelled'
     AND deleted_at IS NULL`
  );

  // Recent payments
  const recentPaymentsResult = await pool.query(
    `SELECT
       p.id,
       p.amount,
       p.payment_method,
       p.payment_date,
       p.status,
       o.order_number,
       c.name as customer_name
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     JOIN customers c ON p.customer_id = c.id
     WHERE p.deleted_at IS NULL
     ORDER BY p.payment_date DESC
     LIMIT 10`
  );

  return {
    upcomingPayments: upcomingPaymentsResult.rows.map(row => ({
      orderId: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      totalAmount: parseFloat(row.total_amount),
      paidAmount: parseFloat(row.paid_amount),
      balanceAmount: parseFloat(row.balance_amount),
      deliveryDate: row.delivery_date,
      daysUntilDelivery: parseInt(row.days_until_delivery),
      paymentType: row.payment_type,
      urgency: row.payment_urgency
    })),
    summary: {
      totalOrdersWithBalance: parseInt(paymentSummaryResult.rows[0].total_orders_with_balance),
      totalOutstanding: parseFloat(paymentSummaryResult.rows[0].total_outstanding),
      overdueAmount: parseFloat(paymentSummaryResult.rows[0].overdue_amount),
      overdueCount: parseInt(paymentSummaryResult.rows[0].overdue_count)
    },
    recentPayments: recentPaymentsResult.rows.map(row => ({
      paymentId: row.id,
      amount: parseFloat(row.amount),
      paymentMethod: row.payment_method,
      paymentDate: row.payment_date,
      status: row.status,
      orderNumber: row.order_number,
      customerName: row.customer_name
    }))
  };
};

/**
 * Get Revenue Analytics
 */
const getRevenueAnalytics = async () => {
  // Revenue trend (last 7 days)
  const revenueTrendResult = await pool.query(
    `SELECT
       DATE(order_date) as date,
       COUNT(*) as order_count,
       SUM(total_amount) as revenue,
       SUM(paid_amount) as collected,
       SUM(balance_amount) as pending
     FROM orders
     WHERE order_date >= CURRENT_DATE - INTERVAL '7 days'
     AND deleted_at IS NULL
     AND status != 'cancelled'
     GROUP BY DATE(order_date)
     ORDER BY date ASC`
  );

  // Monthly comparison (current vs previous month)
  const monthlyComparisonResult = await pool.query(
    `SELECT
       CASE
         WHEN EXTRACT(MONTH FROM order_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         THEN 'current_month'
         ELSE 'previous_month'
       END as period,
       COUNT(*) as order_count,
       SUM(total_amount) as revenue,
       SUM(paid_amount) as collected
     FROM orders
     WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND deleted_at IS NULL
     AND status != 'cancelled'
     GROUP BY
       CASE
         WHEN EXTRACT(MONTH FROM order_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         THEN 'current_month'
         ELSE 'previous_month'
       END`
  );

  // Top products by revenue
  const topProductsResult = await pool.query(
    `SELECT
       p.name as product_name,
       SUM(oi.quantity * oi.unit_price) as revenue,
       SUM(oi.quantity) as units_sold,
       COUNT(DISTINCT o.id) as order_count
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     JOIN skus s ON oi.sku_id = s.id
     JOIN products p ON s.product_id = p.id
     WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
     AND o.deleted_at IS NULL
     AND o.status != 'cancelled'
     GROUP BY p.id, p.name
     ORDER BY revenue DESC
     LIMIT 5`
  );

  return {
    dailyTrend: revenueTrendResult.rows.map(row => ({
      date: row.date,
      orderCount: parseInt(row.order_count),
      revenue: parseFloat(row.revenue),
      collected: parseFloat(row.collected),
      pending: parseFloat(row.pending)
    })),
    monthlyComparison: monthlyComparisonResult.rows.reduce((acc, row) => {
      acc[row.period] = {
        orderCount: parseInt(row.order_count),
        revenue: parseFloat(row.revenue),
        collected: parseFloat(row.collected)
      };
      return acc;
    }, {}),
    topProducts: topProductsResult.rows.map(row => ({
      productName: row.product_name,
      revenue: parseFloat(row.revenue),
      unitsSold: parseInt(row.units_sold),
      orderCount: parseInt(row.order_count)
    }))
  };
};

/**
 * Get Upcoming Deliveries
 */
const getUpcomingDeliveries = async () => {
  const result = await pool.query(
    `SELECT
       o.id,
       o.order_number,
       o.delivery_date,
       o.delivery_slot,
       o.status,
       c.name as customer_name,
       c.phone as customer_phone,
       ca.city,
       EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) as days_until_delivery
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     JOIN customer_addresses ca ON o.delivery_address_id = ca.id
     WHERE o.delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     AND o.status IN ('ready', 'dispatched')
     AND o.deleted_at IS NULL
     ORDER BY o.delivery_date ASC, o.delivery_slot ASC
     LIMIT 10`
  );

  return result.rows.map(row => ({
    orderId: row.id,
    orderNumber: row.order_number,
    deliveryDate: row.delivery_date,
    deliverySlot: row.delivery_slot,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    city: row.city,
    daysUntilDelivery: parseInt(row.days_until_delivery)
  }));
};

/**
 * Get System Alerts
 */
const getSystemAlerts = async () => {
  const alerts = [];

  // Orders at risk
  const atRiskOrders = await pool.query(
    `SELECT COUNT(*) as count FROM orders
     WHERE expected_ready_date > delivery_date
     AND status IN ('pending', 'confirmed', 'preparing')
     AND deleted_at IS NULL`
  );

  if (parseInt(atRiskOrders.rows[0].count) > 0) {
    alerts.push({
      type: 'warning',
      category: 'orders',
      message: `${atRiskOrders.rows[0].count} orders may not be ready by delivery date`,
      count: parseInt(atRiskOrders.rows[0].count),
      action: 'View Orders'
    });
  }

  // Low stock items
  const lowStock = await pool.query(
    `SELECT COUNT(DISTINCT s.id) as count
     FROM skus s
     LEFT JOIN lots l ON l.sku_id = s.id AND l.deleted_at IS NULL AND l.growth_stage = 'ready'
     GROUP BY s.id
     HAVING COALESCE(SUM(l.available_quantity), 0) < s.min_stock_level`
  );

  if (parseInt(lowStock.rows[0]?.count || 0) > 0) {
    alerts.push({
      type: 'error',
      category: 'inventory',
      message: `${lowStock.rows[0].count} SKUs are below minimum stock level`,
      count: parseInt(lowStock.rows[0].count),
      action: 'View Inventory'
    });
  }

  // Overdue payments
  const overduePayments = await pool.query(
    `SELECT COUNT(*) as count, SUM(balance_amount) as amount
     FROM orders
     WHERE balance_amount > 0
     AND delivery_date < CURRENT_DATE
     AND status != 'cancelled'
     AND deleted_at IS NULL`
  );

  if (parseInt(overduePayments.rows[0].count) > 0) {
    alerts.push({
      type: 'warning',
      category: 'payments',
      message: `${overduePayments.rows[0].count} orders have overdue payments (₹${parseFloat(overduePayments.rows[0].amount).toFixed(2)})`,
      count: parseInt(overduePayments.rows[0].count),
      amount: parseFloat(overduePayments.rows[0].amount),
      action: 'View Payments'
    });
  }

  // Pending deliveries
  const pendingDeliveries = await pool.query(
    `SELECT COUNT(*) as count
     FROM orders
     WHERE status = 'dispatched'
     AND deleted_at IS NULL`
  );

  if (parseInt(pendingDeliveries.rows[0].count) > 0) {
    alerts.push({
      type: 'info',
      category: 'delivery',
      message: `${pendingDeliveries.rows[0].count} deliveries in progress`,
      count: parseInt(pendingDeliveries.rows[0].count),
      action: 'Track Deliveries'
    });
  }

  return alerts;
};

/**
 * Legacy endpoint - Get basic KPIs
 * GET /api/dashboard/kpis
 * @deprecated Use getDashboardOverview instead
 */
const getKPIs = async (req, res) => {
  try {
    const kpis = await getKPIsData();
    res.json({ success: true, data: kpis });
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard KPIs',
      error: error.message
    });
  }
};

/**
 * Legacy endpoint - Get recent orders
 * GET /api/dashboard/recent-orders
 * @deprecated Use getDashboardOverview instead
 */
const getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const result = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         o.status,
         o.total_amount,
         o.delivery_date,
         o.order_date,
         o.created_at,
         c.name as customer_name
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.deleted_at IS NULL
       ORDER BY o.order_date DESC, o.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent orders',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardOverview,
  getKPIs,
  getRecentOrders
};
```

**Update backend/routes/dashboard.js:**

```javascript
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// Comprehensive dashboard endpoint
router.get('/overview', authenticate, dashboardController.getDashboardOverview);

// Legacy endpoints (for backward compatibility)
router.get('/kpis', authenticate, dashboardController.getKPIs);
router.get('/recent-orders', authenticate, dashboardController.getRecentOrders);

module.exports = router;
```

---

## PART 2B: PAYMENT MANAGEMENT ENHANCEMENTS

### Issue: Payment Tracking Not Comprehensive

**Modify backend/controllers/paymentController.js** - Add new endpoints:

```javascript
// Add to existing paymentController.js

/**
 * Get payment summary for dashboard
 * GET /api/payments/summary
 */
const getPaymentSummary = async (req, res) => {
  try {
    const { period = 'month' } = req.query; // month, week, all

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = `AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                    AND EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`;
    } else if (period === 'week') {
      dateFilter = `AND p.payment_date >= CURRENT_DATE - INTERVAL '7 days'`;
    }

    // Payment summary
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_payments,
         SUM(amount) as total_collected,
         COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_count,
         SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_amount,
         COUNT(CASE WHEN payment_method = 'upi' THEN 1 END) as upi_count,
         SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END) as upi_amount,
         COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_count,
         SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END) as card_amount
       FROM payments p
       WHERE p.deleted_at IS NULL
       AND p.status = 'success'
       ${dateFilter}`
    );

    // Outstanding amounts
    const outstandingResult = await pool.query(
      `SELECT
         COUNT(*) as orders_with_balance,
         SUM(balance_amount) as total_outstanding,
         SUM(CASE WHEN delivery_date < CURRENT_DATE THEN balance_amount ELSE 0 END) as overdue_amount,
         COUNT(CASE WHEN delivery_date < CURRENT_DATE THEN 1 END) as overdue_count
       FROM orders
       WHERE balance_amount > 0
       AND status != 'cancelled'
       AND deleted_at IS NULL`
    );

    // Payment installments upcoming
    const installmentsResult = await pool.query(
      `SELECT COUNT(*) as count, SUM(installment_amount) as amount
       FROM payment_installments
       WHERE status = 'pending'
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
    );

    res.json({
      success: true,
      data: {
        collected: {
          totalPayments: parseInt(summaryResult.rows[0].total_payments),
          totalAmount: parseFloat(summaryResult.rows[0].total_collected),
          byMethod: {
            cash: {
              count: parseInt(summaryResult.rows[0].cash_count),
              amount: parseFloat(summaryResult.rows[0].cash_amount)
            },
            upi: {
              count: parseInt(summaryResult.rows[0].upi_count),
              amount: parseFloat(summaryResult.rows[0].upi_amount)
            },
            card: {
              count: parseInt(summaryResult.rows[0].card_count),
              amount: parseFloat(summaryResult.rows[0].card_amount)
            }
          }
        },
        outstanding: {
          ordersWithBalance: parseInt(outstandingResult.rows[0].orders_with_balance),
          totalOutstanding: parseFloat(outstandingResult.rows[0].total_outstanding),
          overdueAmount: parseFloat(outstandingResult.rows[0].overdue_amount),
          overdueCount: parseInt(outstandingResult.rows[0].overdue_count)
        },
        upcomingInstallments: {
          count: parseInt(installmentsResult.rows[0]?.count || 0),
          amount: parseFloat(installmentsResult.rows[0]?.amount || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get payment summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment summary',
      error: error.message
    });
  }
};

/**
 * Get upcoming payment reminders
 * GET /api/payments/upcoming
 */
const getUpcomingPayments = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         c.name as customer_name,
         c.phone as customer_phone,
         c.whatsapp_number,
         o.total_amount,
         o.paid_amount,
         o.balance_amount,
         o.delivery_date,
         o.payment_type,
         EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) as days_until_due
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.balance_amount > 0
       AND o.delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::interval
       AND o.status IN ('confirmed', 'preparing', 'ready', 'dispatched', 'delivered')
       AND o.deleted_at IS NULL
       ORDER BY o.delivery_date ASC`,
      [`${days} days`]
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        orderId: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        whatsappNumber: row.whatsapp_number,
        totalAmount: parseFloat(row.total_amount),
        paidAmount: parseFloat(row.paid_amount),
        balanceAmount: parseFloat(row.balance_amount),
        deliveryDate: row.delivery_date,
        paymentType: row.payment_type,
        daysUntilDue: parseInt(row.days_until_due),
        urgency: parseInt(row.days_until_due) <= 2 ? 'high' : 'normal'
      }))
    });
  } catch (error) {
    console.error('Get upcoming payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming payments',
      error: error.message
    });
  }
};

/**
 * Get payment installments for an order
 * GET /api/payments/installments/:orderId
 */
const getOrderInstallments = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT
         pi.*,
         p.payment_date,
         p.payment_method,
         p.receipt_number
       FROM payment_installments pi
       LEFT JOIN payments p ON pi.payment_id = p.id
       WHERE pi.order_id = $1
       ORDER BY pi.installment_number ASC`,
      [orderId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get order installments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch installments',
      error: error.message
    });
  }
};

module.exports = {
  initiatePayment,
  verifyPayment,
  recordOfflinePayment,
  getOrderPayments,
  getCustomerPayments,
  processRefund,
  getPaymentSummary,    // NEW
  getUpcomingPayments,  // NEW
  getOrderInstallments  // NEW
};
```

**Update backend/routes/payments.js:**

```javascript
// Add new routes
router.get('/summary', authenticate, paymentController.getPaymentSummary);
router.get('/upcoming', authenticate, paymentController.getUpcomingPayments);
router.get('/installments/:orderId', authenticate, paymentController.getOrderInstallments);
```

---

## Summary PART 2

### New/Modified Backend Files:

1. **MODIFIED:** `backend/controllers/dashboardController.js` - Complete overhaul with comprehensive insights
2. **MODIFIED:** `backend/routes/dashboard.js` - Add `/overview` endpoint
3. **MODIFIED:** `backend/controllers/paymentController.js` - Add 3 new endpoints
4. **MODIFIED:** `backend/routes/payments.js` - Register new payment endpoints

### New API Endpoints:

**Dashboard:**
- `GET /api/dashboard/overview` - Comprehensive dashboard data
  - KPIs, order insights, inventory insights, payment insights, revenue analytics, upcoming deliveries, alerts

**Payments:**
- `GET /api/payments/summary?period=month|week|all` - Payment collection summary
- `GET /api/payments/upcoming?days=7` - Upcoming payment reminders
- `GET /api/payments/installments/:orderId` - Order installment schedule

### Testing Checklist PART 2:

- [ ] Dashboard overview endpoint returns all sections
- [ ] Order readiness timeline shows correct days until ready
- [ ] Payment reminders show orders with upcoming dues
- [ ] Low stock alerts appear when inventory below min
- [ ] Revenue trends show last 7 days data
- [ ] At-risk orders are identified (expected_ready_date > delivery_date)
- [ ] Payment summary shows collected vs outstanding correctly

---

*Continue to PART 3 for Reports & Analytics fixes*
