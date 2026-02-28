const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

// Middleware to validate request using Joi schema
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
      convert: true, // Convert types
    });

    if (error) {
      const details = {};
      error.details.forEach(detail => {
        details[detail.path.join('.')] = detail.message;
      });

      logger.warn('Validation failed', {
        url: req.originalUrl,
        method: req.method,
        errors: details,
        userId: req.user?.id,
      });

      return next(new ValidationError('Validation failed', details));
    }

    // Replace request data with validated & sanitized data
    req[property] = value;
    next();
  };
};

// Common validation rules
const commonRules = {
  uuid: Joi.string().uuid(),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  name: Joi.string().min(2).max(100).trim(),
  description: Joi.string().max(5000).trim(),
  url: Joi.string().uri(),
  date: Joi.date(),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = { validateRequest, commonRules };
