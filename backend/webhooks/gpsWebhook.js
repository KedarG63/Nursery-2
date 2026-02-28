/**
 * GPS Webhook Handler
 * Issue #36: Placeholder for real GPS provider integrations
 * Handles webhooks from LocoNav, Fleetx, or other GPS tracking services
 */

const pool = require('../config/database');
const GPSTrackingService = require('../services/delivery/gpsTrackingService');
const gpsConfig = require('../config/gpsProvider');

const gpsService = new GPSTrackingService();

/**
 * Handle LocoNav GPS webhook
 * POST /webhooks/gps/loconav
 */
async function handleLocoNavWebhook(req, res) {
  try {
    // Verify webhook signature (when using real LocoNav)
    const signature = req.headers['x-loconav-signature'];
    if (gpsConfig.loconav.enabled && !verifyLocoNavSignature(req.body, signature)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const { deviceId, latitude, longitude, speed, heading, timestamp, ignition } = req.body;

    // Find vehicle by GPS device ID
    const vehicleQuery = `
      SELECT id, gps_device_id FROM vehicles
      WHERE gps_device_id = $1 AND gps_provider = 'loconav'
    `;
    const result = await pool.query(vehicleQuery, [deviceId]);

    if (result.rows.length === 0) {
      console.warn(`Vehicle not found for GPS device: ${deviceId}`);
      return res.status(200).json({ received: true }); // Still acknowledge
    }

    const vehicle = result.rows[0];

    // Get active route for vehicle
    const routeQuery = `
      SELECT id FROM delivery_routes
      WHERE vehicle_id = $1 AND status = 'in_progress'
      ORDER BY route_date DESC
      LIMIT 1
    `;
    const routeResult = await pool.query(routeQuery, [vehicle.id]);
    const routeId = routeResult.rows[0]?.id || null;

    // Record GPS location
    await gpsService.recordLocation(vehicle.id, routeId, {
      latitude,
      longitude,
      speedKmh: speed,
      heading,
      ignitionOn: ignition,
      isMoving: speed > 1,
      timestamp: new Date(timestamp)
    });

    res.status(200).json({
      success: true,
      message: 'GPS data recorded'
    });
  } catch (error) {
    console.error('Error processing LocoNav webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process GPS data',
      error: error.message
    });
  }
}

/**
 * Handle Fleetx GPS webhook
 * POST /webhooks/gps/fleetx
 */
async function handleFleetxWebhook(req, res) {
  try {
    // Verify webhook signature (when using real Fleetx)
    const signature = req.headers['x-fleetx-signature'];
    if (gpsConfig.fleetx.enabled && !verifyFleetxSignature(req.body, signature)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const { vehicle_id, location, speed, heading, timestamp } = req.body;

    // Find vehicle by GPS device ID
    const vehicleQuery = `
      SELECT id FROM vehicles
      WHERE gps_device_id = $1 AND gps_provider = 'fleetx'
    `;
    const result = await pool.query(vehicleQuery, [vehicle_id]);

    if (result.rows.length === 0) {
      console.warn(`Vehicle not found for GPS device: ${vehicle_id}`);
      return res.status(200).json({ received: true });
    }

    const vehicle = result.rows[0];

    // Get active route
    const routeQuery = `
      SELECT id FROM delivery_routes
      WHERE vehicle_id = $1 AND status = 'in_progress'
      ORDER BY route_date DESC
      LIMIT 1
    `;
    const routeResult = await pool.query(routeQuery, [vehicle.id]);
    const routeId = routeResult.rows[0]?.id || null;

    // Record GPS location
    await gpsService.recordLocation(vehicle.id, routeId, {
      latitude: location.lat,
      longitude: location.lng,
      speedKmh: speed,
      heading,
      timestamp: new Date(timestamp)
    });

    res.status(200).json({
      success: true,
      message: 'GPS data recorded'
    });
  } catch (error) {
    console.error('Error processing Fleetx webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process GPS data',
      error: error.message
    });
  }
}

/**
 * Verify LocoNav webhook signature
 * @param {object} payload - Webhook payload
 * @param {string} signature - Signature from header
 * @returns {boolean} True if signature is valid
 */
function verifyLocoNavSignature(payload, signature) {
  // Placeholder - implement actual signature verification
  // const crypto = require('crypto');
  // const secret = gpsConfig.loconav.webhookSecret;
  // const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  // return hash === signature;

  // For mock/development
  return true;
}

/**
 * Verify Fleetx webhook signature
 * @param {object} payload - Webhook payload
 * @param {string} signature - Signature from header
 * @returns {boolean} True if signature is valid
 */
function verifyFleetxSignature(payload, signature) {
  // Placeholder - implement actual signature verification
  // For mock/development
  return true;
}

/**
 * Test webhook endpoint (for development)
 * POST /webhooks/gps/test
 */
async function handleTestWebhook(req, res) {
  try {
    console.log('Test GPS webhook received:', req.body);

    res.status(200).json({
      success: true,
      message: 'Test webhook received',
      data: req.body
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process test webhook',
      error: error.message
    });
  }
}

module.exports = {
  handleLocoNavWebhook,
  handleFleetxWebhook,
  handleTestWebhook
};
