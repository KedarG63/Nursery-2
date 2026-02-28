/**
 * Driver Controller
 * Issue #38: Create driver mobile app API endpoints
 * Issue #79: Emit delivery events for automation
 * Handles driver-specific operations for mobile app
 */

const pool = require('../config/database');
const GPSTrackingService = require('../services/delivery/gpsTrackingService');
const notificationEvents = require('../events/notificationEvents');
const deliveryEvents = require('../events/deliveryEvents');

const gpsService = new GPSTrackingService();

/**
 * Get today's routes for authenticated driver
 * GET /api/driver/routes/today
 */
const getTodayRoutes = async (req, res) => {
  try {
    const driverId = req.driver.id;
    const today = new Date().toISOString().split('T')[0];

    const query = `
      SELECT dr.*,
             v.registration_number, v.vehicle_type,
             COUNT(rs.id) as total_stops,
             COUNT(CASE WHEN rs.status = 'delivered' THEN 1 END) as completed_stops
      FROM delivery_routes dr
      LEFT JOIN vehicles v ON dr.vehicle_id = v.id
      LEFT JOIN route_stops rs ON dr.id = rs.route_id
      WHERE dr.driver_id = $1
        AND dr.route_date = $2
        AND dr.deleted_at IS NULL
      GROUP BY dr.id, v.registration_number, v.vehicle_type
      ORDER BY dr.planned_start_time ASC
    `;

    const result = await pool.query(query, [driverId, today]);

    // Get next stop for each route
    for (const route of result.rows) {
      const nextStopQuery = `
        SELECT * FROM route_stops
        WHERE route_id = $1
          AND status IN ('pending', 'in_transit')
        ORDER BY stop_sequence ASC
        LIMIT 1
      `;

      const nextStopResult = await pool.query(nextStopQuery, [route.id]);

      route.nextStop = nextStopResult.rows[0] || null;
    }

    res.json({
      success: true,
      routes: result.rows
    });
  } catch (error) {
    console.error('Error fetching today routes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch routes',
      error: error.message
    });
  }
};

/**
 * Mark arrival at a stop
 * POST /api/driver/stops/:id/arrive
 */
const markArrival = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { location, arrivalTime } = req.body;
    const driverId = req.driver.id;

    await client.query('BEGIN');

    // Verify stop belongs to driver's route
    const stopCheck = await client.query(
      `SELECT rs.*, dr.driver_id
       FROM route_stops rs
       JOIN delivery_routes dr ON rs.route_id = dr.id
       WHERE rs.id = $1`,
      [id]
    );

    if (stopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = stopCheck.rows[0];

    if (stop.driver_id !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this stop'
      });
    }

    if (stop.status !== 'pending' && stop.status !== 'in_transit') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark arrival for stop with status: ${stop.status}`
      });
    }

    // Update stop status
    const updateQuery = `
      UPDATE route_stops
      SET status = 'arrived',
          actual_arrival_time = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, [
      arrivalTime || new Date(),
      id
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      stop: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error marking arrival:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark arrival',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Mark delivery complete
 * POST /api/driver/stops/:id/deliver
 */
const markDelivered = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { deliveryTime, location } = req.body;
    const driverId = req.driver.id;

    await client.query('BEGIN');

    // Verify stop belongs to driver's route
    const stopCheck = await client.query(
      `SELECT rs.*, dr.driver_id, rs.order_id
       FROM route_stops rs
       JOIN delivery_routes dr ON rs.route_id = dr.id
       WHERE rs.id = $1`,
      [id]
    );

    if (stopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = stopCheck.rows[0];

    if (stop.driver_id !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this stop'
      });
    }

    if (stop.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Stop already marked as delivered'
      });
    }

    // Update stop status
    const updateStopQuery = `
      UPDATE route_stops
      SET status = 'delivered',
          actual_departure_time = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const stopResult = await client.query(updateStopQuery, [
      deliveryTime || new Date(),
      id
    ]);

    // Update order status to delivered
    await client.query(
      `UPDATE orders
       SET status = 'delivered', updated_at = NOW()
       WHERE id = $1`,
      [stop.order_id]
    );

    await client.query('COMMIT');

    // Trigger WhatsApp notification for delivery completion (Phase 9)
    try {
      notificationEvents.emit('delivery:completed', { stopId: id });
    } catch (notificationError) {
      console.error('Error emitting delivery completion notification:', notificationError.message);
      // Don't fail the delivery completion if notification fails
    }

    // Emit delivery event for automation (Issue #79)
    try {
      deliveryEvents.emit('stop:delivered', { stopId: id });
    } catch (eventError) {
      console.error('Error emitting stop:delivered event:', eventError.message);
      // Don't fail the delivery completion if event emission fails
    }

    res.json({
      success: true,
      stop: stopResult.rows[0],
      message: 'Delivery marked successful'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error marking delivered:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark delivery',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Upload delivery proof
 * POST /api/driver/stops/:id/proof
 */
const uploadProof = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { proofType, customerRating, customerFeedback, location } = req.body;
    const driverId = req.driver.id;

    // Parse location if it's a string
    let parsedLocation = location;
    if (typeof location === 'string') {
      parsedLocation = JSON.parse(location);
    }

    await client.query('BEGIN');

    // Verify stop belongs to driver's route
    const stopCheck = await client.query(
      `SELECT rs.*, dr.driver_id
       FROM route_stops rs
       JOIN delivery_routes dr ON rs.route_id = dr.id
       WHERE rs.id = $1`,
      [id]
    );

    if (stopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = stopCheck.rows[0];

    if (stop.driver_id !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to upload proof for this stop'
      });
    }

    // Handle file upload (if file exists)
    let fileUrl = null;
    let fileSize = null;
    let mimeType = null;

    if (req.file) {
      // For now, store file path. In production, upload to S3/Cloudinary
      fileUrl = `/uploads/proofs/${req.file.filename}`;
      fileSize = Math.round(req.file.size / 1024); // KB
      mimeType = req.file.mimetype;
    }

    // Insert proof record
    const insertProofQuery = `
      INSERT INTO delivery_proofs (
        route_stop_id, proof_type, file_url, file_size_kb, file_mime_type,
        customer_rating, customer_feedback,
        captured_by, capture_latitude, capture_longitude
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const proofValues = [
      id,
      proofType,
      fileUrl,
      fileSize,
      mimeType,
      customerRating || null,
      customerFeedback || null,
      driverId,
      parsedLocation?.latitude || null,
      parsedLocation?.longitude || null
    ];

    const proofResult = await client.query(insertProofQuery, proofValues);

    // Update stop with rating and feedback
    if (customerRating || customerFeedback) {
      await client.query(
        `UPDATE route_stops
         SET customer_rating = COALESCE($1, customer_rating),
             customer_feedback = COALESCE($2, customer_feedback),
             updated_at = NOW()
         WHERE id = $3`,
        [customerRating, customerFeedback, id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      proof: proofResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error uploading proof:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload proof',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get navigation details for a stop
 * GET /api/driver/stops/:id/navigation
 */
const getNavigation = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.driver.id;

    const stopQuery = `
      SELECT rs.*, dr.driver_id
      FROM route_stops rs
      JOIN delivery_routes dr ON rs.route_id = dr.id
      WHERE rs.id = $1
    `;

    const stopResult = await pool.query(stopQuery, [id]);

    if (stopResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found'
      });
    }

    const stop = stopResult.rows[0];

    if (stop.driver_id !== driverId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const MockDistanceCalculator = require('../services/delivery/mockDistanceCalculator');
    const distanceCalc = new MockDistanceCalculator();

    // Get current location from GPS
    const currentLocation = await gpsService.getCurrentLocation(stop.vehicle_id);

    let distance = 0;
    let estimatedTime = 0;

    if (currentLocation) {
      distance = distanceCalc.calculateDistance(
        parseFloat(currentLocation.latitude),
        parseFloat(currentLocation.longitude),
        parseFloat(stop.latitude),
        parseFloat(stop.longitude)
      );
      estimatedTime = distanceCalc.estimateTravelTime(distance);
    }

    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`;

    res.json({
      success: true,
      navigation: {
        destination: {
          address: stop.delivery_address,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude)
        },
        distance: distance,
        estimatedTime: estimatedTime,
        googleMapsUrl: googleMapsUrl,
        customerContact: stop.customer_contact
      }
    });
  } catch (error) {
    console.error('Error fetching navigation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch navigation',
      error: error.message
    });
  }
};

/**
 * Update GPS location
 * POST /api/driver/location
 */
const updateLocation = async (req, res) => {
  try {
    const { vehicleId, routeId, location, speed, heading, timestamp } = req.body;
    const driverId = req.driver.id;

    // Verify vehicle belongs to driver
    const vehicleCheck = await pool.query(
      `SELECT da.* FROM driver_assignments da
       WHERE da.driver_id = $1 AND da.vehicle_id = $2 AND da.is_active = true`,
      [driverId, vehicleId]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update location for this vehicle'
      });
    }

    // Record GPS location
    await gpsService.recordLocation(vehicleId, routeId, {
      latitude: location.latitude,
      longitude: location.longitude,
      speedKmh: speed,
      heading: heading,
      timestamp: timestamp || new Date()
    });

    res.json({
      success: true,
      message: 'Location updated'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};

module.exports = {
  getTodayRoutes,
  markArrival,
  markDelivered,
  uploadProof,
  getNavigation,
  updateLocation
};
