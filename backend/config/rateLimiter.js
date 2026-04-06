const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redisClient = require('./redis');
const logger = require('./logger');

// Use insuranceLimiter so rate-limiter-flexible automatically falls back to in-memory
// when Redis is unavailable (connection errors, timeouts, etc.)
const createLimiter = (redisOpts, memoryOpts) => {
  const insuranceLimiter = new RateLimiterMemory(memoryOpts);
  try {
    return new RateLimiterRedis({
      storeClient: redisClient,
      insuranceLimiter,
      ...redisOpts,
    });
  } catch (e) {
    logger.warn('Redis rate limiter init failed, using in-memory fallback', { error: e.message });
    return insuranceLimiter;
  }
};

// Global rate limiter: 300 requests per 15 minutes per IP (increased for development)
const globalLimiter = createLimiter(
  { keyPrefix: 'rlimit:global', points: 300, duration: 900, blockDuration: 300 },
  { points: 300, duration: 900, blockDuration: 300 }
);

// Auth endpoints: 20 requests per 15 minutes per IP (increased for development)
const authLimiter = createLimiter(
  { keyPrefix: 'rlimit:auth', points: 20, duration: 900, blockDuration: 300 },
  { points: 20, duration: 900, blockDuration: 300 }
);

// API endpoints: 120 requests per minute per user (increased for development)
const apiLimiter = createLimiter(
  { keyPrefix: 'rlimit:api', points: 120, duration: 60, blockDuration: 30 },
  { points: 120, duration: 60, blockDuration: 30 }
);

// Strict limiter for sensitive operations
const strictLimiter = createLimiter(
  { keyPrefix: 'rlimit:strict', points: 10, duration: 3600, blockDuration: 3600 },
  { points: 10, duration: 3600, blockDuration: 3600 }
);

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
