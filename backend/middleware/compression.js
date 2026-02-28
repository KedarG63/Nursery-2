const compression = require('compression');
const logger = require('../config/logger');

// Custom compression filter
const shouldCompress = (req, res) => {
  // Don't compress if client doesn't support it
  if (req.headers['x-no-compression']) {
    return false;
  }

  // Don't compress Server-Sent Events
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    return false;
  }

  // Check content type
  const contentType = res.getHeader('Content-Type');

  // Don't compress already compressed content
  const skipTypes = [
    'image/',
    'video/',
    'audio/',
    'application/zip',
    'application/gzip',
    'application/pdf',
  ];

  if (contentType) {
    for (const type of skipTypes) {
      if (contentType.includes(type)) {
        return false;
      }
    }
  }

  // Use default compression filter
  return compression.filter(req, res);
};

// Compression configuration
const compressionMiddleware = compression({
  filter: shouldCompress,
  level: 6, // Compression level (1-9, 6 is balanced)
  threshold: 1024, // Only compress responses > 1KB
});

// Middleware to track compression stats
const compressionStats = (req, res, next) => {
  const originalWrite = res.write;
  const originalEnd = res.end;

  let originalSize = 0;
  let compressedSize = 0;

  res.write = function (chunk, ...args) {
    if (chunk) {
      originalSize += chunk.length;
    }
    return originalWrite.apply(res, [chunk, ...args]);
  };

  res.end = function (chunk, ...args) {
    if (chunk) {
      originalSize += chunk.length;
    }

    const encoding = res.getHeader('Content-Encoding');
    compressedSize = parseInt(res.getHeader('Content-Length')) || originalSize;

    // Log compression stats for large responses
    if (originalSize > 10240 && encoding) { // > 10KB
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

      logger.info('Response compressed', {
        url: req.originalUrl,
        method: req.method,
        encoding,
        originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
        compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
        ratio: `${ratio}%`,
      });
    }

    return originalEnd.apply(res, [chunk, ...args]);
  };

  next();
};

module.exports = { compressionMiddleware, compressionStats };
