const logger = require('../config/logger');

// Redirect HTTP to HTTPS in production
const httpsRedirect = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // Only redirect when a proxy explicitly signals HTTP (internal requests have no header)
    const proto = req.header('x-forwarded-proto');
    if (proto && proto !== 'https') {
      logger.warn('HTTP request redirected to HTTPS', {
        ip: req.ip,
        url: req.originalUrl,
      });

      return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }
  }
  next();
};

// Enforce secure headers
const secureHeaders = (req, res, next) => {
  // Force HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Prevent caching of sensitive data
  if (req.path.includes('/api/auth') || req.path.includes('/api/payments')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

module.exports = { httpsRedirect, secureHeaders };
