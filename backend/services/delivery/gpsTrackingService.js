/**
 * GPS Tracking Service
 * Manages GPS tracking data storage and retrieval
 * Integrates with mock or real GPS providers
 */

const pool = require('../../config/database');
const MockGPSService = require('./mockGPSService');
const gpsConfig = require('../../config/gpsProvider');
const { haversineDistance, isWithinGeofence } = require('../../utils/distanceUtils');

class GPSTrackingService {
  constructor() {
    // Initialize GPS provider based on configuration
    if (gpsConfig.provider === 'mock' || gpsConfig.mock.enabled) {
      this.provider = new MockGPSService();
    } else {
      // For future: initialize LocoNav or Fleetx clients
      this.provider = new MockGPSService(); // Default to mock
    }
  }

  /**
   * Record GPS location data
   * @param {string} vehicleId - Vehicle UUID
   * @param {string} routeId - Route UUID
   * @param {object} location - Location data
   * @returns {object} Recorded GPS entry
   */
  async recordLocation(vehicleId, routeId, location) {
    const {
      latitude,
      longitude,
      speedKmh = 0,
      heading = 0,
      altitudeM = 0,
      ignitionOn = true,
      isMoving = true,
      timestamp = new Date()
    } = location;

    // Calculate distance from route and next stop (if applicable)
    let distanceFromNextStop = null;
    if (routeId) {
      const nextStop = await this.getNextStop(routeId);
      if (nextStop && nextStop.latitude && nextStop.longitude) {
        distanceFromNextStop = haversineDistance(
          latitude,
          longitude,
          parseFloat(nextStop.latitude),
          parseFloat(nextStop.longitude)
        ) * 1000; // Convert to meters
      }
    }

    const query = `
      INSERT INTO gps_tracking (
        vehicle_id, route_id, latitude, longitude,
        speed_kmh, heading, altitude_m,
        ignition_on, is_moving,
        distance_from_next_stop_m,
        gps_provider, recorded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      vehicleId,
      routeId,
      latitude,
      longitude,
      speedKmh,
      heading,
      altitudeM,
      ignitionOn,
      isMoving,
      distanceFromNextStop,
      gpsConfig.provider,
      timestamp
    ];

    const result = await pool.query(query, values);

    // Check if vehicle arrived at stop (geofencing)
    if (routeId && distanceFromNextStop) {
      await this.checkStopArrival(routeId, vehicleId, latitude, longitude);
    }

    return result.rows[0];
  }

  /**
   * Get current location of a vehicle
   * @param {string} vehicleId - Vehicle UUID
   * @returns {object|null} Latest GPS data
   */
  async getCurrentLocation(vehicleId) {
    const query = `
      SELECT * FROM gps_tracking
      WHERE vehicle_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [vehicleId]);
    return result.rows[0] || null;
  }

  /**
   * Get GPS history for a vehicle
   * @param {string} vehicleId - Vehicle UUID
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @returns {Array} Array of GPS records
   */
  async getVehicleHistory(vehicleId, startTime, endTime) {
    const query = `
      SELECT * FROM gps_tracking
      WHERE vehicle_id = $1
        AND recorded_at BETWEEN $2 AND $3
      ORDER BY recorded_at ASC
    `;

    const result = await pool.query(query, [vehicleId, startTime, endTime]);
    return result.rows;
  }

  /**
   * Get all GPS tracking data for a route
   * @param {string} routeId - Route UUID
   * @returns {Array} Array of GPS records
   */
  async getRouteTracking(routeId) {
    const query = `
      SELECT gt.*, v.registration_number
      FROM gps_tracking gt
      JOIN vehicles v ON gt.vehicle_id = v.id
      WHERE gt.route_id = $1
      ORDER BY gt.recorded_at ASC
    `;

    const result = await pool.query(query, [routeId]);
    return result.rows;
  }

  /**
   * Get next pending stop for a route
   * @param {string} routeId - Route UUID
   * @returns {object|null} Next stop object
   */
  async getNextStop(routeId) {
    const query = `
      SELECT * FROM route_stops
      WHERE route_id = $1
        AND status IN ('pending', 'in_transit')
      ORDER BY stop_sequence ASC
      LIMIT 1
    `;

    const result = await pool.query(query, [routeId]);
    return result.rows[0] || null;
  }

  /**
   * Check if vehicle has arrived at a stop (geofencing)
   * @param {string} routeId - Route UUID
   * @param {string} vehicleId - Vehicle UUID
   * @param {number} latitude - Current latitude
   * @param {number} longitude - Current longitude
   */
  async checkStopArrival(routeId, vehicleId, latitude, longitude) {
    const nextStop = await this.getNextStop(routeId);
    if (!nextStop || !nextStop.latitude || !nextStop.longitude) {
      return;
    }

    const isNear = isWithinGeofence(
      latitude,
      longitude,
      parseFloat(nextStop.latitude),
      parseFloat(nextStop.longitude),
      gpsConfig.settings.geofenceRadiusMeters
    );

    if (isNear && nextStop.status === 'pending') {
      // Auto-update stop status to 'arrived'
      const updateQuery = `
        UPDATE route_stops
        SET status = 'arrived',
            actual_arrival_time = NOW()
        WHERE id = $1
        RETURNING *
      `;

      await pool.query(updateQuery, [nextStop.id]);
      console.log(`Vehicle ${vehicleId} arrived at stop ${nextStop.id}`);
    }
  }

  /**
   * Start GPS simulation for a route
   * @param {string} vehicleId - Vehicle UUID
   * @param {string} routeId - Route UUID
   * @returns {string} Simulation ID
   */
  async startRouteTracking(vehicleId, routeId) {
    // Get route stops
    const query = `
      SELECT latitude, longitude, stop_sequence
      FROM route_stops
      WHERE route_id = $1
      ORDER BY stop_sequence ASC
    `;

    const result = await pool.query(query, [routeId]);
    const stops = result.rows;

    // Get warehouse location
    const deliveryConfig = require('../../config/delivery');
    const startLocation = deliveryConfig.defaultWarehouse;

    // Start mock GPS simulation
    if (this.provider instanceof MockGPSService) {
      return this.provider.startSimulation(vehicleId, routeId, stops, startLocation);
    }

    return vehicleId;
  }

  /**
   * Stop GPS tracking for a vehicle
   * @param {string} vehicleId - Vehicle UUID
   */
  stopRouteTracking(vehicleId) {
    if (this.provider instanceof MockGPSService) {
      this.provider.stopSimulation(vehicleId);
    }
  }

  /**
   * Get real-time tracking data for a route
   * @param {string} routeId - Route UUID
   * @returns {object} Real-time tracking information
   */
  async getRealtimeTracking(routeId) {
    // Get route details
    const routeQuery = `
      SELECT dr.*, v.id as vehicle_id, v.registration_number
      FROM delivery_routes dr
      LEFT JOIN vehicles v ON dr.vehicle_id = v.id
      WHERE dr.id = $1
    `;

    const routeResult = await pool.query(routeQuery, [routeId]);
    if (routeResult.rows.length === 0) {
      return null;
    }

    const route = routeResult.rows[0];

    // Get current location
    let currentLocation = null;
    if (route.vehicle_id) {
      currentLocation = await this.getCurrentLocation(route.vehicle_id);
    }

    // Get stops
    const stopsQuery = `
      SELECT * FROM route_stops
      WHERE route_id = $1
      ORDER BY stop_sequence ASC
    `;

    const stopsResult = await pool.query(stopsQuery, [routeId]);
    const stops = stopsResult.rows;

    const completedStops = stops.filter(s => s.status === 'delivered').length;
    const nextStop = stops.find(s => s.status === 'pending' || s.status === 'in_transit');

    return {
      route: {
        id: route.id,
        routeNumber: route.route_number,
        status: route.status,
        vehicle: route.registration_number
      },
      currentLocation: currentLocation ? {
        latitude: parseFloat(currentLocation.latitude),
        longitude: parseFloat(currentLocation.longitude),
        speed: parseFloat(currentLocation.speed_kmh),
        heading: currentLocation.heading,
        timestamp: currentLocation.recorded_at
      } : null,
      progress: {
        completedStops,
        totalStops: stops.length,
        percentComplete: stops.length > 0 ? Math.round((completedStops / stops.length) * 100) : 0
      },
      nextStop: nextStop ? {
        stopSequence: nextStop.stop_sequence,
        address: nextStop.delivery_address,
        estimatedArrival: nextStop.estimated_arrival_time,
        latitude: parseFloat(nextStop.latitude),
        longitude: parseFloat(nextStop.longitude)
      } : null
    };
  }

  /**
   * Clean up old GPS data (data retention)
   * @param {number} daysToKeep - Number of days to keep data
   */
  async cleanOldData(daysToKeep = 90) {
    const query = `
      DELETE FROM gps_tracking
      WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'
    `;

    const result = await pool.query(query);
    console.log(`Cleaned ${result.rowCount} old GPS records`);
    return result.rowCount;
  }
}

module.exports = GPSTrackingService;
