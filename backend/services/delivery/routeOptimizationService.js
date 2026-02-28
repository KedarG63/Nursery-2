/**
 * Route Optimization Service
 * Implements nearest neighbor algorithm for optimizing delivery routes
 */

const MockDistanceCalculator = require('./mockDistanceCalculator');
const deliveryConfig = require('../../config/delivery');

class RouteOptimizationService {
  constructor() {
    this.distanceCalculator = new MockDistanceCalculator();
    this.config = deliveryConfig.optimization;
  }

  /**
   * Optimize stops using Nearest Neighbor algorithm
   * @param {Array} stops - Array of stop objects with order details and address
   * @param {object} startLocation - {latitude, longitude} of warehouse/depot
   * @param {object} options - Optimization options (vehicleCapacity, maxDistance, etc.)
   * @returns {object} Optimized route with ordered stops and metrics
   */
  optimizeStops(stops, startLocation, options = {}) {
    if (!stops || stops.length === 0) {
      return {
        optimizedStops: [],
        totalDistance: 0,
        totalDuration: 0,
        optimizationScore: 0
      };
    }

    // Single stop - no optimization needed
    if (stops.length === 1) {
      const stop = stops[0];
      const distance = this.distanceCalculator.calculateDistance(
        startLocation.latitude,
        startLocation.longitude,
        stop.latitude,
        stop.longitude
      );
      const duration = this.distanceCalculator.estimateTravelTime(distance);

      return {
        optimizedStops: [{ ...stop, stopSequence: 1, distanceFromPrevious: distance }],
        totalDistance: distance * 2, // Round trip
        totalDuration: duration * 2 + this.config.stopDurationMinutes,
        optimizationScore: 100
      };
    }

    // Nearest Neighbor algorithm
    const unvisited = [...stops];
    const visited = [];
    let currentLocation = startLocation;
    let totalDistance = 0;
    let totalDuration = 0;

    while (unvisited.length > 0) {
      // Find nearest unvisited stop
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const distance = this.distanceCalculator.calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          unvisited[i].latitude,
          unvisited[i].longitude
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      // Add nearest stop to visited
      const nearestStop = unvisited.splice(nearestIndex, 1)[0];
      const travelTime = this.distanceCalculator.estimateTravelTime(nearestDistance);

      visited.push({
        ...nearestStop,
        stopSequence: visited.length + 1,
        distanceFromPrevious: nearestDistance,
        estimatedTravelTime: travelTime
      });

      totalDistance += nearestDistance;
      totalDuration += travelTime + this.config.stopDurationMinutes;

      // Update current location
      currentLocation = {
        latitude: nearestStop.latitude,
        longitude: nearestStop.longitude
      };
    }

    // Calculate return distance to depot
    const returnDistance = this.distanceCalculator.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      startLocation.latitude,
      startLocation.longitude
    );
    const returnTime = this.distanceCalculator.estimateTravelTime(returnDistance);

    totalDistance += returnDistance;
    totalDuration += returnTime;

    // Calculate optimization score
    const optimizationScore = this.calculateOptimizationScore({
      totalDistance,
      totalDuration,
      stopCount: visited.length,
      maxDistance: options.maxDistance || this.config.maxRouteDistanceKm
    });

    return {
      optimizedStops: visited,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round(totalDuration),
      returnDistance: Math.round(returnDistance * 100) / 100,
      optimizationScore
    };
  }

  /**
   * Calculate ETAs for each stop in the route
   * @param {Array} optimizedStops - Array of optimized stops with sequence
   * @param {Date|string} startTime - Planned start time
   * @returns {Array} Stops with estimated arrival and departure times
   */
  calculateETAs(optimizedStops, startTime) {
    const stopsWithETAs = [];
    let currentTime = new Date(startTime);

    for (const stop of optimizedStops) {
      // Add travel time to current time
      const travelMinutes = stop.estimatedTravelTime || 0;
      currentTime = new Date(currentTime.getTime() + travelMinutes * 60000);

      const estimatedArrivalTime = new Date(currentTime);

      // Add stop duration
      const stopDuration = this.config.stopDurationMinutes;
      currentTime = new Date(currentTime.getTime() + stopDuration * 60000);

      const estimatedDepartureTime = new Date(currentTime);

      stopsWithETAs.push({
        ...stop,
        estimatedArrivalTime: estimatedArrivalTime.toISOString(),
        estimatedDepartureTime: estimatedDepartureTime.toISOString()
      });
    }

    return stopsWithETAs;
  }

  /**
   * Calculate optimization score based on various factors
   * @param {object} metrics - Route metrics
   * @returns {number} Score from 0-100
   */
  calculateOptimizationScore(metrics) {
    const weights = deliveryConfig.scoringWeights;
    let score = 100;

    // Distance penalty (0-40 points)
    const distanceRatio = metrics.totalDistance / metrics.maxDistance;
    const distancePenalty = Math.min(distanceRatio * 40, 40);
    score -= distancePenalty * weights.distance / 0.4;

    // Time efficiency (0-30 points)
    const avgTimePerStop = metrics.totalDuration / metrics.stopCount;
    const idealTimePerStop = 30; // 30 minutes ideal
    const timePenalty = Math.abs(avgTimePerStop - idealTimePerStop) / idealTimePerStop * 30;
    score -= Math.min(timePenalty, 30) * weights.time / 0.3;

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    return Math.round(score);
  }

  /**
   * Validate route constraints
   * @param {object} route - Route object with stops and metrics
   * @param {object} constraints - Constraint object (maxStops, maxDistance, vehicleCapacity)
   * @returns {object} Validation result with errors if any
   */
  validateRouteConstraints(route, constraints = {}) {
    const errors = [];

    // Check max stops
    const maxStops = constraints.maxStops || this.config.maxStopsPerRoute;
    if (route.optimizedStops.length > maxStops) {
      errors.push(`Route exceeds maximum stops: ${route.optimizedStops.length} > ${maxStops}`);
    }

    // Check max distance
    const maxDistance = constraints.maxDistance || this.config.maxRouteDistanceKm;
    if (route.totalDistance > maxDistance) {
      errors.push(`Route exceeds maximum distance: ${route.totalDistance} km > ${maxDistance} km`);
    }

    // Check vehicle capacity if provided
    if (constraints.vehicleCapacity) {
      const totalUnits = route.optimizedStops.reduce((sum, stop) => {
        return sum + (stop.totalUnits || 0);
      }, 0);

      if (totalUnits > constraints.vehicleCapacity) {
        errors.push(
          `Route exceeds vehicle capacity: ${totalUnits} units > ${constraints.vehicleCapacity} units`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Split large routes into multiple smaller routes
   * @param {Array} stops - Array of all stops
   * @param {object} startLocation - Warehouse location
   * @param {number} maxStopsPerRoute - Maximum stops per route
   * @returns {Array} Array of optimized routes
   */
  splitIntoMultipleRoutes(stops, startLocation, maxStopsPerRoute = null) {
    const maxStops = maxStopsPerRoute || this.config.maxStopsPerRoute;
    const routes = [];

    for (let i = 0; i < stops.length; i += maxStops) {
      const routeStops = stops.slice(i, i + maxStops);
      const optimizedRoute = this.optimizeStops(routeStops, startLocation);
      routes.push(optimizedRoute);
    }

    return routes;
  }

  /**
   * Re-optimize route by removing a stop
   * @param {Array} optimizedStops - Current optimized stops
   * @param {number} stopSequence - Sequence number of stop to remove
   * @param {object} startLocation - Warehouse location
   * @returns {object} Re-optimized route
   */
  removeStopAndReoptimize(optimizedStops, stopSequence, startLocation) {
    const filteredStops = optimizedStops
      .filter(stop => stop.stopSequence !== stopSequence)
      .map(stop => ({
        latitude: stop.latitude,
        longitude: stop.longitude,
        orderId: stop.orderId,
        deliveryAddress: stop.deliveryAddress,
        customerContact: stop.customerContact
      }));

    return this.optimizeStops(filteredStops, startLocation);
  }
}

module.exports = RouteOptimizationService;
