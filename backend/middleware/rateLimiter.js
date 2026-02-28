const { globalLimiter, authLimiter, apiLimiter, strictLimiter, roleMultipliers } = require('../config/rateLimiter');
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

// Generic rate limiter middleware
const createRateLimiter = (limiter, keyGenerator = null) => {
  return async (req, res, next) => {
    try {
      // Generate key based on IP or user
      const key = keyGenerator
        ? keyGenerator(req)
        : req.ip || req.connection.remoteAddress;

      // Calculate points based on user role
      let points = limiter.points;
      if (req.user && req.user.role) {
        const multiplier = roleMultipliers[req.user.role] || 1;
        points = Math.floor(limiter.points * multiplier);
      }

      // Consume rate limit point
      const rateLimitRes = await limiter.consume(key, 1);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', points);
      res.setHeader('X-RateLimit-Remaining', rateLimitRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString());

      next();
    } catch (error) {
      // Rate limit exceeded
      if (error.remainingPoints !== undefined) {
        const retryAfter = Math.ceil(error.msBeforeNext / 1000);

        // Log rate limit violation
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          url: req.originalUrl,
          method: req.method,
          userId: req.user?.id,
          retryAfter,
        });

        res.setHeader('Retry-After', retryAfter);
        res.setHeader('X-RateLimit-Limit', limiter.points);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + error.msBeforeNext).toISOString());

        return next(new AppError('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED'));
      }

      // Other errors
      logger.error('Rate limiter error', { error: error.message });
      next(); // Don't block on rate limiter errors
    }
  };
};

// Global rate limiter (applied to all routes)
const globalRateLimiter = createRateLimiter(globalLimiter);

// Auth rate limiter (login, register, forgot password)
const authRateLimiter = createRateLimiter(authLimiter);

// API rate limiter (authenticated API endpoints)
const apiRateLimiter = createRateLimiter(
  apiLimiter,
  (req) => req.user?.id || req.ip
);

// Strict rate limiter (payment, sensitive operations)
const strictRateLimiter = createRateLimiter(strictLimiter);

// IP whitelist for admin operations
const adminWhitelist = (process.env.ADMIN_WHITELIST || '').split(',').filter(Boolean);

const whitelistMiddleware = (req, res, next) => {
  if (adminWhitelist.includes(req.ip)) {
    return next(); // Skip rate limiting for whitelisted IPs
  }
  next();
};

// Legacy exports for backward compatibility
const loginRateLimiter = authRateLimiter;
const registerRateLimiter = authRateLimiter;

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  whitelistMiddleware,
  // Legacy exports
  loginRateLimiter,
  registerRateLimiter,
};
