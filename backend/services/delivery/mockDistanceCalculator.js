/**
 * Mock Distance Calculator Service
 * Provides distance and travel time calculations without external API calls
 * Uses Haversine formula for great-circle distance calculations
 */

const {
  haversineDistance,
  calculateBearing
} = require('../../utils/distanceUtils');
const deliveryConfig = require('../../config/delivery');

class MockDistanceCalculator {
  constructor() {
    this.averageSpeedKmh = deliveryConfig.optimization.averageSpeedKmh;
    this.trafficMultiplier = deliveryConfig.optimization.trafficMultiplier;
  }

  /**
   * Calculate distance between two points
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    return haversineDistance(lat1, lon1, lat2, lon2);
  }

  /**
   * Estimate travel time based on distance
   * @param {number} distanceKm - Distance in kilometers
   * @param {number} trafficMultiplier - Multiplier for traffic conditions (default: from config)
   * @returns {number} Travel time in minutes
   */
  estimateTravelTime(distanceKm, trafficMultiplier = null) {
    const multiplier = trafficMultiplier !== null ? trafficMultiplier : this.trafficMultiplier;
    const baseTimeHours = distanceKm / this.averageSpeedKmh;
    const adjustedTimeHours = baseTimeHours * multiplier;
    return Math.round(adjustedTimeHours * 60); // Convert to minutes
  }

  /**
   * Calculate distance matrix between multiple locations
   * @param {Array} locations - Array of {latitude, longitude} objects
   * @returns {Array} 2D array of distances in kilometers
   */
  getDistanceMatrix(locations) {
    const n = locations.length;
    const matrix = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 0;
        } else {
          const distance = this.calculateDistance(
            locations[i].latitude,
            locations[i].longitude,
            locations[j].latitude,
            locations[j].longitude
          );
          matrix[i][j] = distance;
        }
      }
    }

    return matrix;
  }

  /**
   * Calculate travel time matrix between multiple locations
   * @param {Array} locations - Array of {latitude, longitude} objects
   * @returns {Array} 2D array of travel times in minutes
   */
  getTravelTimeMatrix(locations) {
    const distanceMatrix = this.getDistanceMatrix(locations);
    return distanceMatrix.map(row =>
      row.map(distance => this.estimateTravelTime(distance))
    );
  }

  /**
   * Get route details between two points
   * @param {object} origin - {latitude, longitude} of origin
   * @param {object} destination - {latitude, longitude} of destination
   * @returns {object} Route details with distance, duration, and bearing
   */
  getRouteDetails(origin, destination) {
    const distance = this.calculateDistance(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );

    const duration = this.estimateTravelTime(distance);

    const bearing = calculateBearing(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );

    return {
      distance: distance,
      distanceText: `${distance.toFixed(2)} km`,
      duration: duration,
      durationText: this.formatDuration(duration),
      bearing: bearing
    };
  }

  /**
   * Simulate traffic conditions (randomize multiplier)
   * @returns {number} Traffic multiplier (1.0 to 2.0)
   */
  simulateTraffic() {
    // Random traffic between 1.0x (no traffic) to 2.0x (heavy traffic)
    return 1.0 + Math.random();
  }

  /**
   * Get traffic-adjusted travel time
   * @param {number} distanceKm - Distance in kilometers
   * @returns {number} Travel time in minutes with simulated traffic
   */
  getTravelTimeWithTraffic(distanceKm) {
    const trafficMultiplier = this.simulateTraffic();
    return this.estimateTravelTime(distanceKm, trafficMultiplier);
  }

  /**
   * Format duration in human-readable format
   * @param {number} minutes - Duration in minutes
   * @returns {string} Formatted duration string
   */
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${Math.round(minutes)} mins`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (mins === 0) {
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }

    return `${hours} hr${hours > 1 ? 's' : ''} ${mins} mins`;
  }

  /**
   * Calculate optimized route distance for multiple stops
   * @param {Array} stops - Array of {latitude, longitude} objects
   * @returns {object} Total distance and duration
   */
  calculateMultiStopRoute(stops) {
    if (stops.length < 2) {
      return { totalDistance: 0, totalDuration: 0 };
    }

    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < stops.length - 1; i++) {
      const distance = this.calculateDistance(
        stops[i].latitude,
        stops[i].longitude,
        stops[i + 1].latitude,
        stops[i + 1].longitude
      );

      const duration = this.estimateTravelTime(distance);

      totalDistance += distance;
      totalDuration += duration;
    }

    // Add stop duration
    const stopDuration = deliveryConfig.optimization.stopDurationMinutes;
    totalDuration += (stops.length - 1) * stopDuration;

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round(totalDuration),
      totalDistanceText: `${totalDistance.toFixed(2)} km`,
      totalDurationText: this.formatDuration(totalDuration)
    };
  }
}

module.exports = MockDistanceCalculator;
