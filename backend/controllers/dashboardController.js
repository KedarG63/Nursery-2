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

  // Revenue this month - based on actual payments received
  const currentMonth = new Date();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

  const revenueResult = await pool.query(
    `SELECT
       COALESCE(SUM(p.amount), 0) as total_revenue,
       COALESCE(SUM(p.amount), 0) as collected_revenue,
       COALESCE(SUM(o.balance_amount), 0) as pending_revenue,
       COUNT(DISTINCT p.order_id) as order_count
     FROM payments p
     LEFT JOIN orders o ON p.order_id = o.id
     WHERE p.status = 'success'
     AND p.payment_date >= $1
     AND p.payment_date <= $2
     AND p.deleted_at IS NULL`,
    [firstDayOfMonth, lastDayOfMonth]
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
       (o.expected_ready_date::date - CURRENT_DATE::date) as days_until_ready,
       (o.delivery_date::date - CURRENT_DATE::date) as days_until_delivery,
       CASE
         WHEN o.expected_ready_date > o.delivery_date THEN 'At Risk'
         WHEN (o.expected_ready_date::date - CURRENT_DATE::date) <= 3 THEN 'Urgent'
         WHEN (o.expected_ready_date::date - CURRENT_DATE::date) <= 7 THEN 'Soon'
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
       (l.expected_ready_date::date - CURRENT_DATE::date) as days_until_ready
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
       (o.delivery_date::date - CURRENT_DATE::date) as days_until_delivery,
       o.payment_type,
       CASE
         WHEN o.delivery_date < CURRENT_DATE THEN 'Overdue'
         WHEN (o.delivery_date::date - CURRENT_DATE::date) <= 2 THEN 'Due Soon'
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
 * Get Revenue Analytics - based on actual payments
 */
const getRevenueAnalytics = async () => {
  // Revenue trend (last 7 days) - from actual payments received
  const revenueTrendResult = await pool.query(
    `SELECT
       DATE(p.payment_date) as date,
       COUNT(DISTINCT p.order_id) as order_count,
       SUM(p.amount) as revenue,
       SUM(p.amount) as collected,
       COALESCE(SUM(o.balance_amount), 0) as pending
     FROM payments p
     LEFT JOIN orders o ON p.order_id = o.id
     WHERE p.payment_date >= CURRENT_DATE - INTERVAL '7 days'
     AND p.deleted_at IS NULL
     AND p.status = 'success'
     GROUP BY DATE(p.payment_date)
     ORDER BY date ASC`
  );

  // Monthly comparison (current vs previous month) - from actual payments
  const monthlyComparisonResult = await pool.query(
    `SELECT
       CASE
         WHEN EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         THEN 'current_month'
         ELSE 'previous_month'
       END as period,
       COUNT(DISTINCT p.order_id) as order_count,
       SUM(p.amount) as revenue,
       SUM(p.amount) as collected
     FROM payments p
     WHERE p.payment_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND p.deleted_at IS NULL
     AND p.status = 'success'
     GROUP BY
       CASE
         WHEN EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
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
       (o.delivery_date::date - CURRENT_DATE::date) as days_until_delivery
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
