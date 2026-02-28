/**
 * GPS Tracking Service
 * Issue #77: ETA notification from GPS
 * Handles GPS tracking and ETA alert notifications
 */

const pool = require('../config/database');
const { haversineDistance } = require('../utils/distanceUtils');
const NotificationService = require('./notificationService');

const notificationService = new NotificationService();

class GPSTrackingService {
  /**
   * Process GPS update and check for ETA alerts
   * Called whenever new GPS data is received
   * @param {string} routeId - Delivery route ID
   * @param {number} latitude - Current vehicle latitude
   * @param {number} longitude - Current vehicle longitude
   */
  async processGPSUpdate(routeId, latitude, longitude) {
    try {
      // Get next pending stop for this route
      const stopQuery = `
        SELECT
          rs.id as stop_id,
          rs.latitude as stop_lat,
          rs.longitude as stop_lng,
          rs.eta_notification_sent,
          rs.sequence_number,
          o.order_number,
          c.name as customer_name
        FROM route_stops rs
        JOIN orders o ON rs.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        JOIN delivery_routes dr ON rs.route_id = dr.id
        WHERE rs.route_id = $1
          AND rs.status = 'pending'
          AND dr.status = 'in_progress'
          AND rs.eta_notification_sent = FALSE
        ORDER BY rs.sequence_number ASC
        LIMIT 1
      `;

      const result = await pool.query(stopQuery, [routeId]);

      if (result.rows.length === 0) {
        return; // No pending stops
      }

      const stop = result.rows[0];

      // Calculate distance to stop
      const distance = haversineDistance(
        latitude,
        longitude,
        stop.stop_lat,
        stop.stop_lng
      );

      // Update last known distance
      await pool.query(
        `UPDATE route_stops
         SET last_distance_km = $1
         WHERE id = $2`,
        [distance, stop.stop_id]
      );

      // Trigger ETA notification if within 5km
      if (distance <= 5.0 && !stop.eta_notification_sent) {
        // Calculate ETA (assuming 30 km/h average speed in city)
        const etaMinutes = Math.round((distance / 30) * 60);

        console.log(`📍 Vehicle within 5km of stop ${stop.stop_id}. Sending ETA alert...`);

        // Send notification
        await notificationService.sendETAAlert(stop.stop_id, etaMinutes);

        // Mark as sent
        await pool.query(
          `UPDATE route_stops
           SET eta_notification_sent = TRUE,
               eta_notification_sent_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [stop.stop_id]
        );

        console.log(`✅ ETA alert sent for ${stop.customer_name} (${distance.toFixed(1)}km away)`);
      }

      // Reset notification flag if vehicle moves away (> 10km)
      if (distance > 10.0 && stop.eta_notification_sent) {
        await pool.query(
          `UPDATE route_stops
           SET eta_notification_sent = FALSE,
               eta_notification_sent_at = NULL
           WHERE id = $1`,
          [stop.stop_id]
        );

        console.log(`🔄 Reset ETA notification for stop ${stop.stop_id} (moved away)`);
      }

    } catch (error) {
      console.error('Error processing ETA check:', error);
      // Don't throw - this is a background process
    }
  }

  /**
   * Record GPS location (existing functionality)
   * @param {string} vehicleId - Vehicle ID
   * @param {string} routeId - Route ID
   * @param {object} locationData - GPS data
   */
  async recordLocation(vehicleId, routeId, locationData) {
    try {
      const { latitude, longitude, speedKmh, heading, timestamp } = locationData;

      // Record GPS location in database
      await pool.query(
        `INSERT INTO gps_tracking_data
         (vehicle_id, route_id, latitude, longitude, speed_kmh, heading, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [vehicleId, routeId, latitude, longitude, speedKmh, heading, timestamp || new Date()]
      );

      // Process ETA check if route is active
      if (routeId) {
        await this.processGPSUpdate(routeId, latitude, longitude);
      }

    } catch (error) {
      console.error('Error recording GPS location:', error);
      throw error;
    }
  }

  /**
   * Get current location for a vehicle
   * @param {string} vehicleId - Vehicle ID
   * @returns {object} Latest GPS coordinates
   */
  async getCurrentLocation(vehicleId) {
    try {
      const query = `
        SELECT latitude, longitude, speed_kmh, heading, recorded_at
        FROM gps_tracking_data
        WHERE vehicle_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [vehicleId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  /**
   * Get route tracking history
   * @param {string} routeId - Route ID
   * @returns {Array} GPS tracking history
   */
  async getRouteHistory(routeId) {
    try {
      const query = `
        SELECT latitude, longitude, speed_kmh, heading, recorded_at
        FROM gps_tracking_data
        WHERE route_id = $1
        ORDER BY recorded_at ASC
      `;

      const result = await pool.query(query, [routeId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting route history:', error);
      return [];
    }
  }
}

module.exports = GPSTrackingService;
