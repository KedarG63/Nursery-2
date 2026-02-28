/**
 * Delivery Configuration
 * Contains default settings for delivery route optimization and management
 */

module.exports = {
  // Default warehouse/depot location (New Delhi area)
  defaultWarehouse: {
    latitude: parseFloat(process.env.DEFAULT_WAREHOUSE_LAT || '28.7041'),
    longitude: parseFloat(process.env.DEFAULT_WAREHOUSE_LNG || '77.1025'),
    name: 'Main Warehouse'
  },

  // Route optimization settings
  optimization: {
    averageSpeedKmh: parseInt(process.env.AVERAGE_DELIVERY_SPEED_KMH || '30'),
    stopDurationMinutes: 15, // Average time spent at each stop
    maxStopsPerRoute: 20, // Maximum stops per route
    maxRouteDistanceKm: 100, // Maximum route distance
    trafficMultiplier: 1.2, // Multiplier to account for traffic (20% additional time)
  },

  // Time window settings
  timeWindows: {
    morningStartTime: '09:00',
    morningEndTime: '13:00',
    afternoonStartTime: '14:00',
    afternoonEndTime: '18:00',
    defaultWindowMinutes: 120 // 2 hour delivery window
  },

  // GPS tracking settings
  gps: {
    updateIntervalSeconds: parseInt(process.env.GPS_UPDATE_INTERVAL_SECONDS || '30'),
    geofenceRadiusMeters: 100, // Radius for arrival detection
    mockEnabled: process.env.MOCK_GPS_ENABLED === 'true' || true,
    simulationSpeed: parseFloat(process.env.MOCK_GPS_SIMULATION_SPEED || '1') // 1x real-time
  },

  // Delivery proof settings
  proof: {
    maxFileSizeMB: 5,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    requiredProofTypes: ['signature', 'photo']
  },

  // Scoring weights for route optimization
  scoringWeights: {
    distance: 0.4, // Weight for total distance
    time: 0.3, // Weight for total time
    timeWindowAdherence: 0.2, // Weight for meeting time windows
    stopSequence: 0.1 // Weight for logical stop ordering
  }
};
