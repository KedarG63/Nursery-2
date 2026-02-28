const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const logger = require('../config/logger');

// Redis client (try to import, fallback if not available)
let redis;
try {
  redis = require('../config/redis');
} catch (error) {
  logger.warn('Redis not configured, health check will skip Redis');
}

/**
 * Basic health check endpoint
 * Returns 200 if service is up
 */
router.get('/', async (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'nursery-management-api'
  });
});

/**
 * Detailed health check with dependency checks
 * Checks database, Redis, and other critical services
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'nursery-management-api',
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime(),
    checks: {}
  };

  let isHealthy = true;

  // Check database connection
  try {
    const start = Date.now();
    const result = await db.query('SELECT NOW() as now, version() as version');
    const duration = Date.now() - start;
    health.checks.database = {
      status: 'healthy',
      responseTime: duration,
      timestamp: result.rows[0].now,
      version: result.rows[0].version.split(' ')[0]
    };
  } catch (error) {
    isHealthy = false;
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
    logger.error('Database health check failed', { error: error.message });
  }

  // Check Redis connection (if available)
  if (redis) {
    try {
      const start = Date.now();
      await redis.ping();
      const duration = Date.now() - start;
      health.checks.redis = {
        status: 'healthy',
        responseTime: duration
      };
    } catch (error) {
      isHealthy = false;
      health.checks.redis = {
        status: 'unhealthy',
        error: error.message
      };
      logger.error('Redis health check failed', { error: error.message });
    }
  } else {
    health.checks.redis = {
      status: 'not_configured'
    };
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  health.checks.memory = {
    status: memoryPercentage < 90 ? 'healthy' : 'warning',
    heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    usage: `${memoryPercentage.toFixed(2)}%`
  };

  // Check disk space (Node.js process)
  health.checks.process = {
    status: 'healthy',
    pid: process.pid,
    uptime: `${Math.floor(process.uptime())} seconds`,
    nodeVersion: process.version
  };

  // Overall health status
  health.status = isHealthy ? 'healthy' : 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * Readiness probe for Kubernetes/container orchestration
 * Checks if service is ready to accept traffic
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is accessible
    await db.query('SELECT 1');

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe for Kubernetes/container orchestration
 * Checks if service is alive and should not be restarted
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
