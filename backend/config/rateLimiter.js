const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = require('./redis');
const logger = require('./logger');

// Global rate limiter: 300 requests per 15 minutes per IP (increased for development)
const globalLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:global',
  points: 300, // Number of requests (increased from 100 to 300 for development)
  duration: 900, // Per 15 minutes (900 seconds)
  blockDuration: 300, // Block for 5 minutes (reduced from 15 for development)
});

// Auth endpoints: 20 requests per 15 minutes per IP (increased for development)
const authLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:auth',
  points: 20, // Increased from 5 to 20 for development
  duration: 900,
  blockDuration: 300, // Reduced block from 30 min to 5 min for development
});

// API endpoints: 120 requests per minute per user (increased for development)
const apiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:api',
  points: 120, // Increased from 60 to 120 for development
  duration: 60, // Per minute
  blockDuration: 30, // Reduced from 60 to 30 seconds
});

// Strict limiter for sensitive operations
const strictLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:strict',
  points: 10,
  duration: 3600, // Per hour
  blockDuration: 3600,
});

// Role-based point multipliers
const roleMultipliers = {
  Admin: 3, // 3x normal limit
  Manager: 2, // 2x normal limit
  Sales: 1.5,
  Warehouse: 1,
  Delivery: 1,
};

module.exports = {
  globalLimiter,
  authLimiter,
  apiLimiter,
  strictLimiter,
  roleMultipliers,
};
