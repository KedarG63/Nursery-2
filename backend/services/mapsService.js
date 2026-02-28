const { googleMapsClient, GOOGLE_MAPS_API_KEY } = require('../config/googleMaps');
const cacheService = require('./cacheService');

class MapsService {
  // Get distance matrix between multiple origins and destinations
  async getDistanceMatrix(origins, destinations) {
    // Create cache key
    const cacheKey = `distance_matrix:${JSON.stringify(origins)}:${JSON.stringify(destinations)}`;

    // Check cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await googleMapsClient.distancematrix({
        params: {
          origins,
          destinations,
          mode: 'driving',
          key: GOOGLE_MAPS_API_KEY,
        },
      });

      const result = this.parseDistanceMatrixResponse(response.data);

      // Cache for 24 hours
      await cacheService.set(cacheKey, JSON.stringify(result), 86400);

      return result;
    } catch (error) {
      console.error('Google Maps API error:', error);
      throw new Error('Failed to calculate distances');
    }
  }

  // Calculate distance between two points
  async getDistance(origin, destination) {
    const matrix = await this.getDistanceMatrix([origin], [destination]);
    return matrix[0][0];
  }

  // Parse API response to simple format
  parseDistanceMatrixResponse(data) {
    return data.rows.map(row =>
      row.elements.map(element => ({
        distanceKm: element.distance ? element.distance.value / 1000 : null,
        durationMinutes: element.duration ? element.duration.value / 60 : null,
        status: element.status,
      }))
    );
  }

  // Get optimized route order using TSP approximation
  async getOptimizedRoute(stops) {
    // Get all distances between stops
    const addresses = stops.map(stop => `${stop.lat},${stop.lng}`);
    const matrix = await this.getDistanceMatrix(addresses, addresses);

    // Simple nearest neighbor algorithm
    const visited = new Set();
    const route = [0]; // Start from first stop
    visited.add(0);

    let current = 0;
    while (visited.size < stops.length) {
      let nearest = -1;
      let minDistance = Infinity;

      for (let i = 0; i < stops.length; i++) {
        if (!visited.has(i) && matrix[current][i].distanceKm < minDistance) {
          minDistance = matrix[current][i].distanceKm;
          nearest = i;
        }
      }

      route.push(nearest);
      visited.add(nearest);
      current = nearest;
    }

    return route.map(index => stops[index]);
  }
}

module.exports = new MapsService();
