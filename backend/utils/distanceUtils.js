/**
 * Distance and Geospatial Utility Functions
 * Provides utilities for distance calculations and coordinate operations
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Calculate bearing (heading) from one point to another
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Bearing in degrees (0-360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

  let bearing = toDegrees(Math.atan2(y, x));
  bearing = (bearing + 360) % 360; // Normalize to 0-360

  return Math.round(bearing);
}

/**
 * Calculate destination point given distance and bearing
 * @param {number} lat - Starting latitude
 * @param {number} lon - Starting longitude
 * @param {number} distanceKm - Distance to travel in km
 * @param {number} bearing - Bearing in degrees
 * @returns {object} Object with latitude and longitude of destination
 */
function calculateDestination(lat, lon, distanceKm, bearing) {
  const R = 6371; // Earth's radius in km
  const d = distanceKm / R;
  const brng = toRadians(bearing);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: toDegrees(lat2),
    longitude: toDegrees(lon2)
  };
}

/**
 * Check if a point is within a circular geofence
 * @param {number} pointLat - Latitude of point to check
 * @param {number} pointLon - Longitude of point to check
 * @param {number} centerLat - Latitude of geofence center
 * @param {number} centerLon - Longitude of geofence center
 * @param {number} radiusMeters - Radius of geofence in meters
 * @returns {boolean} True if point is within geofence
 */
function isWithinGeofence(pointLat, pointLon, centerLat, centerLon, radiusMeters) {
  const distanceKm = haversineDistance(pointLat, pointLon, centerLat, centerLon);
  const distanceMeters = distanceKm * 1000;
  return distanceMeters <= radiusMeters;
}

/**
 * Generate intermediate points along a route
 * @param {number} startLat - Starting latitude
 * @param {number} startLon - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLon - Ending longitude
 * @param {number} numPoints - Number of intermediate points to generate
 * @returns {Array} Array of {latitude, longitude} objects
 */
function generateIntermediatePoints(startLat, startLon, endLat, endLon, numPoints = 10) {
  const points = [];
  points.push({ latitude: startLat, longitude: startLon });

  for (let i = 1; i < numPoints; i++) {
    const fraction = i / numPoints;
    const lat = startLat + (endLat - startLat) * fraction;
    const lon = startLon + (endLon - startLon) * fraction;
    points.push({ latitude: lat, longitude: lon });
  }

  points.push({ latitude: endLat, longitude: endLon });
  return points;
}

/**
 * Calculate total distance of a route with multiple points
 * @param {Array} points - Array of {latitude, longitude} objects
 * @returns {number} Total distance in kilometers
 */
function calculateRouteDistance(points) {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const distance = haversineDistance(
      points[i].latitude,
      points[i].longitude,
      points[i + 1].latitude,
      points[i + 1].longitude
    );
    totalDistance += distance;
  }

  return totalDistance;
}

/**
 * Calculate ETA in minutes based on distance
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} avgSpeedKmh - Average speed in km/h (default: 30)
 * @returns {number} ETA in minutes
 */
function calculateETA(distanceKm, avgSpeedKmh = 30) {
  return Math.round((distanceKm / avgSpeedKmh) * 60);
}

module.exports = {
  haversineDistance,
  toRadians,
  toDegrees,
  calculateBearing,
  calculateDestination,
  isWithinGeofence,
  generateIntermediatePoints,
  calculateRouteDistance,
  calculateETA
};
