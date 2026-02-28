/**
 * Validate SKU creation input
 */
function validateSKUCreation(req, res, next) {
  const { sku_code, product_id, variety, size, container_type, price, cost, min_stock_level, max_stock_level } = req.body;
  const errors = [];

  // Log the incoming data for debugging
  console.log('[SKU Validator] Incoming request body:', JSON.stringify(req.body, null, 2));

  // Validate product_id
  if (!product_id) {
    errors.push('Product ID is required');
  } else if (!isValidUUID(product_id)) {
    errors.push('Product ID must be a valid UUID');
  }

  // Validate size
  const validSizes = ['small', 'medium', 'large'];
  if (!size) {
    errors.push('Size is required');
  } else if (!validSizes.includes(size)) {
    errors.push(`Size must be one of: ${validSizes.join(', ')}`);
  }

  // Validate container_type
  const validContainers = ['tray', 'pot', 'seedling_tray', 'grow_bag'];
  if (!container_type) {
    errors.push('Container type is required');
  } else if (!validContainers.includes(container_type)) {
    errors.push(`Container type must be one of: ${validContainers.join(', ')}`);
  }

  // Validate price
  if (!price) {
    errors.push('Price is required');
  } else if (isNaN(price) || parseFloat(price) <= 0) {
    errors.push('Price must be a positive number');
  }

  // Validate cost
  if (!cost) {
    errors.push('Cost is required');
  } else if (isNaN(cost) || parseFloat(cost) < 0) {
    errors.push('Cost must be a non-negative number');
  }

  // Validate price > cost
  if (price && cost && parseFloat(price) <= parseFloat(cost)) {
    errors.push('Price must be greater than cost');
  }

  // Validate sku_code format (if provided)
  if (sku_code) {
    if (!isValidSKUCode(sku_code)) {
      errors.push('SKU code must follow format: PROD-SIZE-CONT (e.g., SPINACH-MED-TRY) or PROD-VAR-SIZE-CONT (e.g., TOM-CHE-MED-POT)');
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

  // Validate min < max
  if (min_stock_level !== undefined && min_stock_level !== null &&
      max_stock_level !== undefined && max_stock_level !== null) {
    if (min_stock_level >= max_stock_level) {
      errors.push('Minimum stock level must be less than maximum stock level');
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

  // Sanitize inputs
  if (variety) {
    req.body.variety = variety.trim();
  }
  if (sku_code) {
    req.body.sku_code = sku_code.trim().toUpperCase();
  }

  next();
}

/**
 * Validate SKU update input
 */
function validateSKUUpdate(req, res, next) {
  const { sku_code, variety, size, container_type, price, cost, min_stock_level, max_stock_level, active } = req.body;
  const errors = [];

  // Validate size (if provided)
  const validSizes = ['small', 'medium', 'large'];
  if (size !== undefined && !validSizes.includes(size)) {
    errors.push(`Size must be one of: ${validSizes.join(', ')}`);
  }

  // Validate container_type (if provided)
  const validContainers = ['tray', 'pot', 'seedling_tray', 'grow_bag'];
  if (container_type !== undefined && !validContainers.includes(container_type)) {
    errors.push(`Container type must be one of: ${validContainers.join(', ')}`);
  }

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

  // Validate sku_code format (if provided)
  if (sku_code !== undefined) {
    if (!isValidSKUCode(sku_code)) {
      errors.push('SKU code must follow format: PROD-SIZE-CONT (e.g., SPINACH-MED-TRY) or PROD-VAR-SIZE-CONT (e.g., TOM-CHE-MED-POT)');
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

  // Sanitize inputs
  if (variety !== undefined && variety !== null) {
    req.body.variety = variety.trim();
  }
  if (sku_code !== undefined) {
    req.body.sku_code = sku_code.trim().toUpperCase();
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

/**
 * Helper function to validate SKU code format
 * Format: PROD-VAR-SIZE-CONT (e.g., TOM-CHE-MED-POT) or PROD-SIZE-CONT (e.g., SPINACH-MED-TRY)
 * Components can have 2-10 characters
 */
function isValidSKUCode(code) {
  // Allow both 4-part format (with variety) and 3-part format (without variety)
  const skuRegex4Part = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}-[A-Z]{2,10}-[A-Z]{2,10}$/;
  const skuRegex3Part = /^[A-Z0-9]{2,10}-[A-Z]{2,10}-[A-Z]{2,10}$/;
  return skuRegex4Part.test(code) || skuRegex3Part.test(code);
}

module.exports = {
  validateSKUCreation,
  validateSKUUpdate,
};
