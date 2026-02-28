/**
 * Delivery Validation Middleware
 * Validates delivery route and driver requests
 */

const ROUTE_STATUSES = ['planned', 'assigned', 'started', 'in_progress', 'completed', 'cancelled'];
const STOP_STATUSES = ['pending', 'in_transit', 'arrived', 'delivering', 'delivered', 'failed', 'skipped'];
const PROOF_TYPES = ['signature', 'photo', 'customer_feedback', 'id_proof'];

/**
 * Validate route creation request
 */
function validateCreateRoute(req, res, next) {
  const { orderIds, routeDate, plannedStartTime, notes } = req.body;

  const errors = [];

  // Validate orderIds
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    errors.push('orderIds must be a non-empty array');
  } else {
    // Check if all orderIds are valid UUIDs
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const orderId of orderIds) {
      if (!uuidRegex.test(orderId)) {
        errors.push(`Invalid UUID format for orderId: ${orderId}`);
      }
    }
  }

  // Validate routeDate
  if (!routeDate) {
    errors.push('routeDate is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(routeDate)) {
      errors.push('routeDate must be in YYYY-MM-DD format');
    } else {
      const date = new Date(routeDate);
      if (isNaN(date.getTime())) {
        errors.push('Invalid routeDate');
      }
    }
  }

  // Validate plannedStartTime (optional)
  if (plannedStartTime) {
    const date = new Date(plannedStartTime);
    if (isNaN(date.getTime())) {
      errors.push('Invalid plannedStartTime format');
    }
  }

  // Validate notes (optional)
  if (notes && typeof notes !== 'string') {
    errors.push('notes must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate route assignment request
 */
function validateAssignRoute(req, res, next) {
  const { driverId, vehicleId } = req.body;

  const errors = [];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Validate driverId
  if (!driverId) {
    errors.push('driverId is required');
  } else if (!uuidRegex.test(driverId)) {
    errors.push('Invalid driverId format');
  }

  // Validate vehicleId
  if (!vehicleId) {
    errors.push('vehicleId is required');
  } else if (!uuidRegex.test(vehicleId)) {
    errors.push('Invalid vehicleId format');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate route start request
 */
function validateStartRoute(req, res, next) {
  const { startLocation } = req.body;

  const errors = [];

  // Validate startLocation
  if (!startLocation) {
    errors.push('startLocation is required');
  } else {
    if (typeof startLocation.latitude !== 'number') {
      errors.push('startLocation.latitude must be a number');
    } else if (startLocation.latitude < -90 || startLocation.latitude > 90) {
      errors.push('startLocation.latitude must be between -90 and 90');
    }

    if (typeof startLocation.longitude !== 'number') {
      errors.push('startLocation.longitude must be a number');
    } else if (startLocation.longitude < -180 || startLocation.longitude > 180) {
      errors.push('startLocation.longitude must be between -180 and 180');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate stop arrival request
 */
function validateStopArrival(req, res, next) {
  const { location, arrivalTime } = req.body;

  const errors = [];

  // Validate location
  if (!location) {
    errors.push('location is required');
  } else {
    if (typeof location.latitude !== 'number') {
      errors.push('location.latitude must be a number');
    } else if (location.latitude < -90 || location.latitude > 90) {
      errors.push('location.latitude must be between -90 and 90');
    }

    if (typeof location.longitude !== 'number') {
      errors.push('location.longitude must be a number');
    } else if (location.longitude < -180 || location.longitude > 180) {
      errors.push('location.longitude must be between -180 and 180');
    }
  }

  // Validate arrivalTime (optional)
  if (arrivalTime) {
    const date = new Date(arrivalTime);
    if (isNaN(date.getTime())) {
      errors.push('Invalid arrivalTime format');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate delivery completion request
 */
function validateDeliveryComplete(req, res, next) {
  const { deliveryTime, location } = req.body;

  const errors = [];

  // Validate location
  if (!location) {
    errors.push('location is required');
  } else {
    if (typeof location.latitude !== 'number') {
      errors.push('location.latitude must be a number');
    } else if (location.latitude < -90 || location.latitude > 90) {
      errors.push('location.latitude must be between -90 and 90');
    }

    if (typeof location.longitude !== 'number') {
      errors.push('location.longitude must be a number');
    } else if (location.longitude < -180 || location.longitude > 180) {
      errors.push('location.longitude must be between -180 and 180');
    }
  }

  // Validate deliveryTime (optional)
  if (deliveryTime) {
    const date = new Date(deliveryTime);
    if (isNaN(date.getTime())) {
      errors.push('Invalid deliveryTime format');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate proof upload request
 */
function validateProofUpload(req, res, next) {
  const { proofType, customerRating, location } = req.body;

  const errors = [];

  // Validate proofType
  if (!proofType) {
    errors.push('proofType is required');
  } else if (!PROOF_TYPES.includes(proofType)) {
    errors.push(`proofType must be one of: ${PROOF_TYPES.join(', ')}`);
  }

  // Validate customerRating (optional)
  if (customerRating !== undefined) {
    const rating = parseInt(customerRating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      errors.push('customerRating must be between 1 and 5');
    }
  }

  // Validate location (optional)
  if (location) {
    try {
      const loc = typeof location === 'string' ? JSON.parse(location) : location;
      if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
        errors.push('Invalid location format');
      }
    } catch (e) {
      errors.push('Invalid location JSON');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

/**
 * Validate GPS location update request
 */
function validateLocationUpdate(req, res, next) {
  const { vehicleId, routeId, location, speed, heading, timestamp } = req.body;

  const errors = [];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Validate vehicleId
  if (!vehicleId) {
    errors.push('vehicleId is required');
  } else if (!uuidRegex.test(vehicleId)) {
    errors.push('Invalid vehicleId format');
  }

  // Validate location
  if (!location) {
    errors.push('location is required');
  } else {
    if (typeof location.latitude !== 'number') {
      errors.push('location.latitude must be a number');
    } else if (location.latitude < -90 || location.latitude > 90) {
      errors.push('location.latitude must be between -90 and 90');
    }

    if (typeof location.longitude !== 'number') {
      errors.push('location.longitude must be a number');
    } else if (location.longitude < -180 || location.longitude > 180) {
      errors.push('location.longitude must be between -180 and 180');
    }
  }

  // Validate routeId (optional)
  if (routeId && !uuidRegex.test(routeId)) {
    errors.push('Invalid routeId format');
  }

  // Validate speed (optional)
  if (speed !== undefined && (typeof speed !== 'number' || speed < 0)) {
    errors.push('speed must be a non-negative number');
  }

  // Validate heading (optional)
  if (heading !== undefined && (typeof heading !== 'number' || heading < 0 || heading > 360)) {
    errors.push('heading must be between 0 and 360');
  }

  // Validate timestamp (optional)
  if (timestamp) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      errors.push('Invalid timestamp format');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
}

module.exports = {
  validateCreateRoute,
  validateAssignRoute,
  validateStartRoute,
  validateStopArrival,
  validateDeliveryComplete,
  validateProofUpload,
  validateLocationUpdate,
  ROUTE_STATUSES,
  STOP_STATUSES,
  PROOF_TYPES
};
