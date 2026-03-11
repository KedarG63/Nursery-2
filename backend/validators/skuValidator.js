/**
 * Validate SKU creation input
 */
function validateSKUCreation(req, res, next) {
  const { product_id, variety, price, cost, min_stock_level, max_stock_level } = req.body;
  const errors = [];

  console.log('[SKU Validator] Incoming request body:', JSON.stringify(req.body, null, 2));

  // Validate product_id
  if (!product_id) {
    errors.push('Product ID is required');
  } else if (!isValidUUID(product_id)) {
    errors.push('Product ID must be a valid UUID');
  }

  // Validate price
  if (!price) {
    errors.push('Price is required');
  } else if (isNaN(price) || parseFloat(price) <= 0) {
    errors.push('Price must be a positive number');
  }

  // Validate cost
  if (cost === undefined || cost === null || cost === '') {
    errors.push('Cost is required');
  } else if (isNaN(cost) || parseFloat(cost) < 0) {
    errors.push('Cost must be a non-negative number');
  }

  // Validate price > cost
  if (price && cost !== undefined && cost !== null && cost !== '') {
    if (parseFloat(price) <= parseFloat(cost)) {
      errors.push('Price must be greater than cost');
    }
  }

  // Validate variety (optional)
  if (variety && variety.length > 100) {
    errors.push('Variety must not exceed 100 characters');
  }

  // Validate min_stock_level (optional)
  if (min_stock_level !== undefined && min_stock_level !== null) {
    if (!Number.isInteger(min_stock_level) || min_stock_level < 0) {
      errors.push('Minimum stock level must be a non-negative integer');
    }
  }

  // Validate max_stock_level (optional)
  if (max_stock_level !== undefined && max_stock_level !== null) {
    if (!Number.isInteger(max_stock_level) || max_stock_level <= 0) {
      errors.push('Maximum stock level must be a positive integer');
    }
  }

  if (errors.length > 0) {
    console.log('[SKU Validator] Validation failed with errors:', errors);
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  console.log('[SKU Validator] Validation passed');

  if (variety) {
    req.body.variety = variety.trim();
  }

  next();
}

/**
 * Validate SKU update input
 */
function validateSKUUpdate(req, res, next) {
  const { variety, price, cost, min_stock_level, max_stock_level, active } = req.body;
  const errors = [];

  // Validate price (if provided)
  if (price !== undefined) {
    if (isNaN(price) || parseFloat(price) <= 0) {
      errors.push('Price must be a positive number');
    }
  }

  // Validate cost (if provided)
  if (cost !== undefined) {
    if (isNaN(cost) || parseFloat(cost) < 0) {
      errors.push('Cost must be a non-negative number');
    }
  }

  // Validate price > cost (if both provided)
  if (price !== undefined && cost !== undefined) {
    if (parseFloat(price) <= parseFloat(cost)) {
      errors.push('Price must be greater than cost');
    }
  }

  // Validate variety (if provided)
  if (variety !== undefined && variety !== null && variety.length > 100) {
    errors.push('Variety must not exceed 100 characters');
  }

  // Validate min_stock_level (if provided)
  if (min_stock_level !== undefined) {
    if (!Number.isInteger(min_stock_level) || min_stock_level < 0) {
      errors.push('Minimum stock level must be a non-negative integer');
    }
  }

  // Validate max_stock_level (if provided)
  if (max_stock_level !== undefined) {
    if (!Number.isInteger(max_stock_level) || max_stock_level <= 0) {
      errors.push('Maximum stock level must be a positive integer');
    }
  }

  // Validate active (if provided)
  if (active !== undefined && typeof active !== 'boolean') {
    errors.push('Active must be a boolean value');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  if (variety !== undefined && variety !== null) {
    req.body.variety = variety.trim();
  }

  next();
}

/**
 * Helper function to validate UUID format
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

module.exports = {
  validateSKUCreation,
  validateSKUUpdate,
};
