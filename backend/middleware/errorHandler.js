const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Convert non-operational errors to AppError
  if (!error.isOperational) {
    error = new AppError(
      error.message || 'Internal server error',
      error.statusCode || 500,
      error.code || 'INTERNAL_ERROR'
    );
  }

  // Log error
  logger.error('Error occurred', {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Prepare error response
  const errorResponse = {
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    },
  };

  // Add details if available (for validation errors)
  if (error.details) {
    errorResponse.error.details = error.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = error.stack;
  }

  res.status(error.statusCode).json(errorResponse);
};

// 404 handler for unknown routes
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

module.exports = { errorHandler, notFoundHandler };
