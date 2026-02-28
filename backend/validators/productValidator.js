const validator = require('validator');

/**
 * Validate product creation input
 */
function validateProductCreation(req, res, next) {
  const { name, description, category, growth_period_days, image_url } = req.body;
  const errors = [];

  // Validate name
  if (!name) {
    errors.push('Product name is required');
  } else if (name.trim().length < 2) {
    errors.push('Product name must be at least 2 characters long');
  } else if (name.trim().length > 255) {
    errors.push('Product name must not exceed 255 characters');
  }

  // Validate category
  const validCategories = ['leafy_greens', 'fruiting', 'root', 'herbs'];
  if (!category) {
    errors.push('Product category is required');
  } else if (!validCategories.includes(category)) {
    errors.push(`Category must be one of: ${validCategories.join(', ')}`);
  }

  // Validate growth_period_days
  if (!growth_period_days) {
    errors.push('Growth period days is required');
  } else if (!Number.isInteger(growth_period_days) || growth_period_days <= 0) {
    errors.push('Growth period days must be a positive integer');
  }

  // Validate image_url (optional)
  if (image_url) {
    if (!validator.isURL(image_url, { protocols: ['http', 'https'] })) {
      errors.push('Image URL must be a valid URL');
    } else if (image_url.length > 500) {
      errors.push('Image URL must not exceed 500 characters');
    }
  }

  // Validate description (optional)
  if (description && description.length > 5000) {
    errors.push('Description must not exceed 5000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  // Sanitize inputs
  req.body.name = name.trim();
  if (description) {
    req.body.description = description.trim();
  }

  next();
}

/**
 * Validate product update input
 */
function validateProductUpdate(req, res, next) {
  const { name, description, category, growth_period_days, image_url, status } = req.body;
  const errors = [];

  // Validate name (if provided)
  if (name !== undefined) {
    if (name.trim().length < 2) {
      errors.push('Product name must be at least 2 characters long');
    } else if (name.trim().length > 255) {
      errors.push('Product name must not exceed 255 characters');
    }
  }

  // Validate category (if provided)
  const validCategories = ['leafy_greens', 'fruiting', 'root', 'herbs'];
  if (category !== undefined && !validCategories.includes(category)) {
    errors.push(`Category must be one of: ${validCategories.join(', ')}`);
  }

  // Validate status (if provided)
  const validStatuses = ['active', 'inactive', 'discontinued'];
  if (status !== undefined && !validStatuses.includes(status)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate growth_period_days (if provided)
  if (growth_period_days !== undefined) {
    if (!Number.isInteger(growth_period_days) || growth_period_days <= 0) {
      errors.push('Growth period days must be a positive integer');
    }
  }

  // Validate image_url (if provided)
  if (image_url !== undefined && image_url !== null && image_url !== '') {
    if (!validator.isURL(image_url, { protocols: ['http', 'https'] })) {
      errors.push('Image URL must be a valid URL');
    } else if (image_url.length > 500) {
      errors.push('Image URL must not exceed 500 characters');
    }
  }

  // Validate description (if provided)
  if (description !== undefined && description !== null && description.length > 5000) {
    errors.push('Description must not exceed 5000 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  // Sanitize inputs
  if (name !== undefined) {
    req.body.name = name.trim();
  }
  if (description !== undefined && description !== null) {
    req.body.description = description.trim();
  }

  next();
}

module.exports = {
  validateProductCreation,
  validateProductUpdate,
};
