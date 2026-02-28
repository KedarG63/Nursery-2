const cloudwatch = require('../config/cloudwatch');
const logger = require('../config/logger');

/**
 * Middleware to track API metrics in CloudWatch
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Track when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Send metrics to CloudWatch
    cloudwatch.trackResponseTime(endpoint, duration, res.statusCode);

    // Track errors
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'ServerError' : 'ClientError';
      cloudwatch.trackError(errorType, endpoint);
    }

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow API request', {
        endpoint,
        duration,
        statusCode: res.statusCode,
        method: req.method
      });
    }
  });

  next();
}

module.exports = metricsMiddleware;
