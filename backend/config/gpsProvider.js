/**
 * GPS Provider Configuration
 * Configuration for GPS/Fleet tracking service integration
 */

module.exports = {
  // Current provider: 'mock', 'loconav', 'fleetx'
  provider: process.env.GPS_PROVIDER || 'mock',

  // Mock GPS settings
  mock: {
    enabled: process.env.MOCK_GPS_ENABLED === 'true' || true,
    simulationSpeed: parseFloat(process.env.MOCK_GPS_SIMULATION_SPEED || '1'), // 1x real-time
    updateIntervalSeconds: parseInt(process.env.GPS_UPDATE_INTERVAL_SECONDS || '30'),
    defaultSpeed: 30 // km/h
  },

  // LocoNav configuration (for future production use)
  loconav: {
    apiKey: process.env.LOCONAV_API_KEY || '',
    apiUrl: process.env.LOCONAV_API_URL || 'https://api.loconav.com',
    webhookSecret: process.env.LOCONAV_WEBHOOK_SECRET || '',
    enabled: false
  },

  // Fleetx configuration (for future production use)
  fleetx: {
    apiKey: process.env.FLEETX_API_KEY || '',
    apiUrl: process.env.FLEETX_API_URL || 'https://api.fleetx.io',
    webhookSecret: process.env.FLEETX_WEBHOOK_SECRET || '',
    enabled: false
  },

  // General GPS settings
  settings: {
    geofenceRadiusMeters: 100, // Radius for arrival detection
    maxLocationAge: 300, // Maximum age of GPS data in seconds (5 minutes)
    minAccuracyMeters: 50, // Minimum GPS accuracy required
    trackingEnabled: true
  }
};
