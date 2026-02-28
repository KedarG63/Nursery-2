/**
 * Mock GPS Service
 * Simulates GPS tracking for vehicles on delivery routes
 * Generates realistic GPS data without external API dependencies
 */

const {
  calculateDestination,
  calculateBearing,
  haversineDistance,
  generateIntermediatePoints
} = require('../../utils/distanceUtils');
const gpsConfig = require('../../config/gpsProvider');

class MockGPSService {
  constructor() {
    this.activeSimulations = new Map();
    this.config = gpsConfig.mock;
  }

  /**
   * Start simulating GPS tracking for a vehicle on a route
   * @param {string} vehicleId - Vehicle UUID
   * @param {string} routeId - Route UUID
   * @param {Array} stops - Array of stop objects with coordinates
   * @param {object} startLocation - Starting location {latitude, longitude}
   * @returns {string} Simulation ID
   */
  startSimulation(vehicleId, routeId, stops, startLocation) {
    // Stop any existing simulation for this vehicle
    this.stopSimulation(vehicleId);

    // Generate route waypoints
    const waypoints = this.generateRouteWaypoints(startLocation, stops);

    const simulation = {
      vehicleId,
      routeId,
      waypoints,
      currentWaypointIndex: 0,
      currentLocation: { ...startLocation },
      speedKmh: this.config.defaultSpeed,
      isActive: true,
      startTime: new Date()
    };

    this.activeSimulations.set(vehicleId, simulation);

    // Start updating location at intervals
    const intervalId = setInterval(() => {
      this.updateSimulation(vehicleId);
    }, this.config.updateIntervalSeconds * 1000);

    simulation.intervalId = intervalId;

    console.log(`Started GPS simulation for vehicle ${vehicleId} on route ${routeId}`);

    return vehicleId;
  }

  /**
   * Update simulation to next position
   * @param {string} vehicleId - Vehicle UUID
   */
  updateSimulation(vehicleId) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (!simulation || !simulation.isActive) {
      return;
    }

    // Check if reached end of waypoints
    if (simulation.currentWaypointIndex >= simulation.waypoints.length) {
      this.stopSimulation(vehicleId);
      return;
    }

    const currentWaypoint = simulation.waypoints[simulation.currentWaypointIndex];

    // Calculate distance to next waypoint
    const distance = haversineDistance(
      simulation.currentLocation.latitude,
      simulation.currentLocation.longitude,
      currentWaypoint.latitude,
      currentWaypoint.longitude
    );

    // Calculate how far vehicle moves in this update interval
    const distancePerUpdate =
      (simulation.speedKmh / 3600) * this.config.updateIntervalSeconds * this.config.simulationSpeed;

    if (distance <= distancePerUpdate) {
      // Reached waypoint, move to next
      simulation.currentLocation = { ...currentWaypoint };
      simulation.currentWaypointIndex++;
    } else {
      // Move towards waypoint
      const bearing = calculateBearing(
        simulation.currentLocation.latitude,
        simulation.currentLocation.longitude,
        currentWaypoint.latitude,
        currentWaypoint.longitude
      );

      const newLocation = calculateDestination(
        simulation.currentLocation.latitude,
        simulation.currentLocation.longitude,
        distancePerUpdate,
        bearing
      );

      simulation.currentLocation = newLocation;
    }

    // Update simulation heading
    if (simulation.currentWaypointIndex < simulation.waypoints.length) {
      const nextWaypoint = simulation.waypoints[simulation.currentWaypointIndex];
      simulation.heading = calculateBearing(
        simulation.currentLocation.latitude,
        simulation.currentLocation.longitude,
        nextWaypoint.latitude,
        nextWaypoint.longitude
      );
    }

    // Add some randomness to speed (±10%)
    simulation.speedKmh = this.config.defaultSpeed * (0.9 + Math.random() * 0.2);
  }

  /**
   * Get current location of a vehicle
   * @param {string} vehicleId - Vehicle UUID
   * @returns {object|null} Current GPS data or null if not simulating
   */
  getCurrentLocation(vehicleId) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (!simulation) {
      return null;
    }

    return {
      vehicleId: simulation.vehicleId,
      routeId: simulation.routeId,
      latitude: simulation.currentLocation.latitude,
      longitude: simulation.currentLocation.longitude,
      speedKmh: simulation.speedKmh,
      heading: simulation.heading || 0,
      ignitionOn: true,
      isMoving: simulation.speedKmh > 1,
      timestamp: new Date().toISOString(),
      provider: 'mock'
    };
  }

  /**
   * Check if vehicle is near a stop (geofencing)
   * @param {string} vehicleId - Vehicle UUID
   * @param {object} stopLocation - {latitude, longitude} of stop
   * @param {number} radiusMeters - Geofence radius in meters (default: 100)
   * @returns {boolean} True if vehicle is within geofence
   */
  isNearStop(vehicleId, stopLocation, radiusMeters = 100) {
    const currentLocation = this.getCurrentLocation(vehicleId);
    if (!currentLocation) {
      return false;
    }

    const distance = haversineDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      stopLocation.latitude,
      stopLocation.longitude
    );

    const distanceMeters = distance * 1000;
    return distanceMeters <= radiusMeters;
  }

  /**
   * Stop GPS simulation for a vehicle
   * @param {string} vehicleId - Vehicle UUID
   */
  stopSimulation(vehicleId) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (simulation) {
      simulation.isActive = false;
      if (simulation.intervalId) {
        clearInterval(simulation.intervalId);
      }
      this.activeSimulations.delete(vehicleId);
      console.log(`Stopped GPS simulation for vehicle ${vehicleId}`);
    }
  }

  /**
   * Generate waypoints along the route
   * @param {object} startLocation - Starting location
   * @param {Array} stops - Array of stops
   * @returns {Array} Array of waypoint coordinates
   */
  generateRouteWaypoints(startLocation, stops) {
    const waypoints = [];
    let currentLocation = startLocation;

    for (const stop of stops) {
      // Generate intermediate points between current location and stop
      const intermediatePoints = generateIntermediatePoints(
        currentLocation.latitude,
        currentLocation.longitude,
        stop.latitude,
        stop.longitude,
        5 // 5 intermediate points per segment
      );

      waypoints.push(...intermediatePoints.slice(1)); // Skip first point (current location)
      currentLocation = stop;
    }

    return waypoints;
  }

  /**
   * Get all active simulations
   * @returns {Array} Array of active simulation info
   */
  getActiveSimulations() {
    const simulations = [];
    for (const [vehicleId, simulation] of this.activeSimulations) {
      simulations.push({
        vehicleId,
        routeId: simulation.routeId,
        isActive: simulation.isActive,
        progress: `${simulation.currentWaypointIndex}/${simulation.waypoints.length}`,
        currentLocation: simulation.currentLocation
      });
    }
    return simulations;
  }

  /**
   * Manually set vehicle location (for testing)
   * @param {string} vehicleId - Vehicle UUID
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   */
  setLocation(vehicleId, latitude, longitude) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (simulation) {
      simulation.currentLocation = { latitude, longitude };
    }
  }

  /**
   * Pause simulation
   * @param {string} vehicleId - Vehicle UUID
   */
  pauseSimulation(vehicleId) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (simulation) {
      simulation.isActive = false;
      if (simulation.intervalId) {
        clearInterval(simulation.intervalId);
        delete simulation.intervalId;
      }
    }
  }

  /**
   * Resume simulation
   * @param {string} vehicleId - Vehicle UUID
   */
  resumeSimulation(vehicleId) {
    const simulation = this.activeSimulations.get(vehicleId);
    if (simulation && !simulation.isActive) {
      simulation.isActive = true;
      const intervalId = setInterval(() => {
        this.updateSimulation(vehicleId);
      }, this.config.updateIntervalSeconds * 1000);
      simulation.intervalId = intervalId;
    }
  }
}

module.exports = MockGPSService;
