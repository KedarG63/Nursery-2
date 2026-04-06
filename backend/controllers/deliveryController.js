/**
 * Delivery Controller
 * Issue #35: Create delivery route API endpoints
 * Issue #79: Emit delivery events for automation
 * Handles route creation, optimization, assignment, and tracking
 */

const pool = require('../config/database');
const RouteOptimizationService = require('../services/delivery/routeOptimizationService');
const GPSTrackingService = require('../services/delivery/gpsTrackingService');
const deliveryConfig = require('../config/delivery');
const notificationEvents = require('../events/notificationEvents');
const deliveryEvents = require('../events/deliveryEvents');

const routeOptimizer = new RouteOptimizationService();
const gpsService = new GPSTrackingService();

/**
 * Create optimized delivery route from orders
 * POST /api/routes
 */
const createRoute = async (req, res) => {
  const client = await pool.connect();

  try {
    const { orderIds, routeDate, plannedStartTime, notes } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // 1. Fetch orders with delivery addresses
    const ordersQuery = `
      SELECT o.id as order_id, o.customer_id, o.total_amount,
             ca.address_line1, ca.address_line2, ca.city, ca.state,
             ca.pincode, ca.gps_latitude as latitude, ca.gps_longitude as longitude,
             c.phone,
             COALESCE(SUM(oi.quantity), 0) as total_units
      FROM orders o
      JOIN customer_addresses ca ON o.delivery_address_id = ca.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ANY($1)
        AND o.deleted_at IS NULL
        AND o.status NOT IN ('delivered', 'cancelled')
      GROUP BY o.id, o.customer_id, o.total_amount, ca.address_line1,
               ca.address_line2, ca.city, ca.state, ca.pincode,
               ca.gps_latitude, ca.gps_longitude, c.phone
    `;

    const ordersResult = await client.query(ordersQuery, [orderIds]);

    if (ordersResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid orders found'
      });
    }

    if (ordersResult.rows.length !== orderIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some orders are invalid or already processed'
      });
    }

    // 2. Prepare stops for optimization
    const stops = ordersResult.rows.map(order => ({
      orderId: order.order_id,
      customerId: order.customer_id,
      deliveryAddress: `${order.address_line1}, ${order.address_line2 || ''}, ${order.city}, ${order.state} - ${order.pincode}`.trim(),
      customerContact: order.phone,
      latitude: parseFloat(order.latitude) || 0,
      longitude: parseFloat(order.longitude) || 0,
      totalUnits: parseInt(order.total_units) || 0
    }));

    // Check if all orders have valid coordinates
    const invalidCoords = stops.filter(s => s.latitude === 0 || s.longitude === 0);
    if (invalidCoords.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Orders with missing coordinates: ${invalidCoords.map(s => s.orderId).join(', ')}`
      });
    }

    // 3. Optimize route
    const startLocation = deliveryConfig.defaultWarehouse;
    const optimizedRoute = routeOptimizer.optimizeStops(stops, startLocation);

    // 4. Calculate ETAs
    const startTime = plannedStartTime || new Date();
    const stopsWithETAs = routeOptimizer.calculateETAs(optimizedRoute.optimizedStops, startTime);

    // 5. Create delivery route record
    const routeInsertQuery = `
      INSERT INTO delivery_routes (
        route_date, status, planned_start_time,
        total_distance_km, estimated_duration_minutes,
        optimization_score, total_stops, notes,
        created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const routeValues = [
      routeDate,
      'planned',
      startTime,
      optimizedRoute.totalDistance,
      optimizedRoute.totalDuration,
      optimizedRoute.optimizationScore,
      stopsWithETAs.length,
      notes || null,
      userId,
      userId
    ];

    const routeResult = await client.query(routeInsertQuery, routeValues);
    const route = routeResult.rows[0];

    // 6. Insert route stops
    for (const stop of stopsWithETAs) {
      const stopInsertQuery = `
        INSERT INTO route_stops (
          route_id, order_id, stop_sequence, status,
          delivery_address, customer_contact,
          latitude, longitude,
          estimated_arrival_time, estimated_departure_time,
          distance_from_previous_km
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      const stopValues = [
        route.id,
        stop.orderId,
        stop.stopSequence,
        'pending',
        stop.deliveryAddress,
        stop.customerContact,
        stop.latitude,
        stop.longitude,
        stop.estimatedArrivalTime,
        stop.estimatedDepartureTime,
        stop.distanceFromPrevious
      ];

      await client.query(stopInsertQuery, stopValues);
    }

    // 7. Update order status to 'dispatched'
    await client.query(
      `UPDATE orders SET status = 'ready', updated_at = NOW() WHERE id = ANY($1)`,
      [orderIds]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      route: {
        id: route.id,
        routeNumber: route.route_number,
        totalStops: route.total_stops,
        totalDistance: parseFloat(route.total_distance_km),
        estimatedDuration: route.estimated_duration_minutes,
        optimizationScore: route.optimization_score,
        stops: stopsWithETAs
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create route',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get all routes with filters
 * GET /api/routes
 */
const getRoutes = async (req, res) => {
  try {
    const { status, routeDate, driverId, page = 1, limit = 20 } = req.query;

    let query = `
      SELECT dr.*,
             u.full_name as driver_name,
             v.registration_number as vehicle_number
      FROM delivery_routes dr
      LEFT JOIN users u ON dr.driver_id = u.id
      LEFT JOIN vehicles v ON dr.vehicle_id = v.id
      WHERE dr.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND dr.status = $${paramCount}`;
      params.push(status);
    }

    if (routeDate) {
      paramCount++;
      query += ` AND dr.route_date = $${paramCount}`;
      params.push(routeDate);
    }

    if (driverId) {
      paramCount++;
      query += ` AND dr.driver_id = $${paramCount}`;
      params.push(driverId);
    }

    query += ` ORDER BY dr.route_date DESC, dr.created_at DESC`;

    // Pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM delivery_routes dr
      WHERE dr.deleted_at IS NULL
    `;

    const countParams = [];
    let countParamNum = 0;

    if (status) {
      countParamNum++;
      countQuery += ` AND dr.status = $${countParamNum}`;
      countParams.push(status);
    }

    if (routeDate) {
      countParamNum++;
      countQuery += ` AND dr.route_date = $${countParamNum}`;
      countParams.push(routeDate);
    }

    if (driverId) {
      countParamNum++;
      countQuery += ` AND dr.driver_id = $${countParamNum}`;
      countParams.push(driverId);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      routes: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch routes',
      error: error.message
    });
  }
};

/**
 * Get route by ID with stops
 * GET /api/routes/:id
 */
const getRouteById = async (req, res) => {
  try {
    const { id } = req.params;

    const routeQuery = `
      SELECT dr.*,
             u.full_name as driver_name, u.phone as driver_phone,
             v.registration_number as vehicle_number, v.vehicle_type
      FROM delivery_routes dr
      LEFT JOIN users u ON dr.driver_id = u.id
      LEFT JOIN vehicles v ON dr.vehicle_id = v.id
      WHERE dr.id = $1 AND dr.deleted_at IS NULL
    `;

    const routeResult = await pool.query(routeQuery, [id]);

    if (routeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const route = routeResult.rows[0];

    // Get stops
    const stopsQuery = `
      SELECT rs.*, o.order_number, o.total_amount
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      WHERE rs.route_id = $1
      ORDER BY rs.stop_sequence ASC
    `;

    const stopsResult = await pool.query(stopsQuery, [id]);

    res.json({
      success: true,
      route: {
        ...route,
        stops: stopsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route',
      error: error.message
    });
  }
};

/**
 * Assign driver and vehicle to route
 * PUT /api/routes/:id/assign
 */
const assignRoute = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { driverId, vehicleId } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // Check if route exists and is in planned status
    const routeCheck = await client.query(
      `SELECT * FROM delivery_routes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const route = routeCheck.rows[0];

    if (route.status !== 'planned') {
      return res.status(400).json({
        success: false,
        message: `Cannot assign route with status: ${route.status}`
      });
    }

    // Check if driver exists and has delivery role
    const driverCheck = await client.query(
      `SELECT u.* FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1 AND r.name = 'Delivery' AND u.status = 'active'`,
      [driverId]
    );

    if (driverCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found or not authorized for deliveries'
      });
    }

    // Check if vehicle exists and is available
    const vehicleCheck = await client.query(
      `SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL`,
      [vehicleId]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Update route
    await client.query(
      `UPDATE delivery_routes
       SET driver_id = $1, vehicle_id = $2, status = 'assigned', updated_by = $3, updated_at = NOW()
       WHERE id = $4`,
      [driverId, vehicleId, userId, id]
    );

    // Create driver assignment record
    await client.query(
      `INSERT INTO driver_assignments (driver_id, vehicle_id, route_id, assigned_by)
       VALUES ($1, $2, $3, $4)`,
      [driverId, vehicleId, id, userId]
    );

    // Update vehicle status
    await client.query(
      `UPDATE vehicles SET status = 'in_use', updated_at = NOW() WHERE id = $1`,
      [vehicleId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Driver and vehicle assigned successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign route',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Start a route
 * PUT /api/routes/:id/start
 */
const startRoute = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { startLocation } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    const routeCheck = await client.query(
      `SELECT * FROM delivery_routes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const route = routeCheck.rows[0];

    if (route.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: `Cannot start route with status: ${route.status}`
      });
    }

    // Update route status
    await client.query(
      `UPDATE delivery_routes
       SET status = 'in_progress', actual_start_time = NOW(), updated_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [userId, id]
    );

    await client.query('COMMIT');

    // Start GPS tracking if vehicle assigned
    if (route.vehicle_id) {
      await gpsService.startRouteTracking(route.vehicle_id, id);
    }

    // Trigger WhatsApp notification for delivery dispatch (Phase 9)
    try {
      notificationEvents.emit('delivery:dispatched', { routeId: id });
    } catch (notificationError) {
      console.error('Error emitting delivery dispatch notification:', notificationError.message);
      // Don't fail the route start if notification fails
    }

    // Emit delivery event for automation (Issue #79)
    try {
      deliveryEvents.emit('route:started', { routeId: id });
    } catch (eventError) {
      console.error('Error emitting route:started event:', eventError.message);
      // Don't fail the route start if event emission fails
    }

    res.json({
      success: true,
      route: {
        status: 'in_progress',
        actualStartTime: new Date().toISOString()
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start route',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get route progress
 * GET /api/routes/:id/progress
 */
const getRouteProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const tracking = await gpsService.getRealtimeTracking(id);

    if (!tracking) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    res.json({
      success: true,
      progress: tracking
    });
  } catch (error) {
    console.error('Error fetching route progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route progress',
      error: error.message
    });
  }
};

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
       LEFT JOIN route_stops rs ON rs.route_id = dr.id AND rs.status = 'delivered'
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

module.exports = {
  createRoute,
  getRoutes,
  getRouteById,
  assignRoute,
  startRoute,
  getRouteProgress,
  getDeliverySummary,
  getAvailableOrdersForDelivery
};
