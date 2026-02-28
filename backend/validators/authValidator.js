const validator = require('validator');

/**
 * Validate registration input
 */
function validateRegistration(req, res, next) {
  const { email, password, fullName, phone } = req.body;
  const errors = [];

  // Validate email
  if (!email) {
    errors.push('Email is required');
  } else if (!validator.isEmail(email)) {
    errors.push('Invalid email format');
  }

  // Validate password
  if (!password) {
    errors.push('Password is required');
  } else {
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
  }

  // Validate full name
  if (!fullName) {
    errors.push('Full name is required');
  } else if (fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters long');
  }

  // Validate phone (optional)
  if (phone && !validator.isMobilePhone(phone, 'any')) {
    errors.push('Invalid phone number format');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  // Sanitize inputs
  req.body.email = validator.normalizeEmail(email);
  req.body.fullName = validator.escape(fullName.trim());
  if (phone) {
    req.body.phone = validator.escape(phone.trim());
  }

  next();
}

/**
 * Validate login input
 */
function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  if (!email) {
    errors.push('Email is required');
  } else if (!validator.isEmail(email)) {
    errors.push('Invalid email format');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please fix the following errors',
      errors,
    });
  }

  req.body.email = validator.normalizeEmail(email);

  next();
}

module.exports = {
  validateRegistration,
  validateLogin,
};
