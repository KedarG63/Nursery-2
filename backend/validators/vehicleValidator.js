/**
 * Vehicle Validation Middleware
 * Validates vehicle creation and update requests
 */

const VEHICLE_TYPES = ['truck', 'tempo', 'van', 'pickup', 'two_wheeler'];
const VEHICLE_STATUSES = ['available', 'in_use', 'maintenance', 'inactive'];
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'cng'];
const GPS_PROVIDERS = ['mock', 'loconav', 'fleetx'];

/**
 * Validate vehicle creation request
 */
function validateCreateVehicle(req, res, next) {
  const {
    registrationNumber,
    vehicleType,
    capacityUnits,
    capacityWeightKg,
    makeModel,
    year,
    color,
    fuelType,
    gpsProvider,
    gpsDeviceId
  } = req.body;

  const errors = [];

  // Validate registrationNumber
  if (!registrationNumber || typeof registrationNumber !== 'string') {
    errors.push('registrationNumber is required and must be a string');
  } else if (registrationNumber.length > 20) {
    errors.push('registrationNumber must not exceed 20 characters');
  }

  // Validate vehicleType
  if (!vehicleType) {
    errors.push('vehicleType is required');
  } else if (!VEHICLE_TYPES.includes(vehicleType)) {
    errors.push(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`);
  }

  // Validate capacityUnits
  if (!capacityUnits) {
    errors.push('capacityUnits is required');
  } else if (typeof capacityUnits !== 'number' || capacityUnits <= 0) {
    errors.push('capacityUnits must be a positive number');
  }

  // Validate capacityWeightKg (optional)
  if (capacityWeightKg !== undefined && capacityWeightKg !== null) {
    if (typeof capacityWeightKg !== 'number' || capacityWeightKg <= 0) {
      errors.push('capacityWeightKg must be a positive number');
    }
  }

  // Validate makeModel (optional)
  if (makeModel !== undefined && typeof makeModel !== 'string') {
    errors.push('makeModel must be a string');
  }

  // Validate year (optional)
  if (year !== undefined) {
    const currentYear = new Date().getFullYear();
    if (typeof year !== 'number' || year < 1900 || year > currentYear + 1) {
      errors.push(`year must be between 1900 and ${currentYear + 1}`);
    }
  }

  // Validate color (optional)
  if (color !== undefined && typeof color !== 'string') {
    errors.push('color must be a string');
  }

  // Validate fuelType (optional)
  if (fuelType !== undefined && !FUEL_TYPES.includes(fuelType)) {
    errors.push(`fuelType must be one of: ${FUEL_TYPES.join(', ')}`);
  }

  // Validate gpsProvider (optional)
  if (gpsProvider !== undefined && !GPS_PROVIDERS.includes(gpsProvider)) {
    errors.push(`gpsProvider must be one of: ${GPS_PROVIDERS.join(', ')}`);
  }

  // Validate gpsDeviceId (optional)
  if (gpsDeviceId !== undefined && typeof gpsDeviceId !== 'string') {
    errors.push('gpsDeviceId must be a string');
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
 * Validate vehicle update request
 */
function validateUpdateVehicle(req, res, next) {
  const {
    registrationNumber,
    vehicleType,
    capacityUnits,
    capacityWeightKg,
    status,
    makeModel,
    year,
    color,
    fuelType,
    gpsProvider,
    gpsDeviceId,
    insuranceExpiry,
    fitnessExpiry,
    permitExpiry,
    lastMaintenanceDate,
    nextMaintenanceDate,
    odometerReading,
    averageFuelConsumption
  } = req.body;

  const errors = [];

  // All fields are optional for update, but validate if provided

  if (registrationNumber !== undefined) {
    if (typeof registrationNumber !== 'string' || registrationNumber.length > 20) {
      errors.push('registrationNumber must be a string with max 20 characters');
    }
  }

  if (vehicleType !== undefined && !VEHICLE_TYPES.includes(vehicleType)) {
    errors.push(`vehicleType must be one of: ${VEHICLE_TYPES.join(', ')}`);
  }

  if (capacityUnits !== undefined && (typeof capacityUnits !== 'number' || capacityUnits <= 0)) {
    errors.push('capacityUnits must be a positive number');
  }

  if (
    capacityWeightKg !== undefined &&
    capacityWeightKg !== null &&
    (typeof capacityWeightKg !== 'number' || capacityWeightKg <= 0)
  ) {
    errors.push('capacityWeightKg must be a positive number');
  }

  if (status !== undefined && !VEHICLE_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${VEHICLE_STATUSES.join(', ')}`);
  }

  if (makeModel !== undefined && typeof makeModel !== 'string') {
    errors.push('makeModel must be a string');
  }

  if (year !== undefined) {
    const currentYear = new Date().getFullYear();
    if (typeof year !== 'number' || year < 1900 || year > currentYear + 1) {
      errors.push(`year must be between 1900 and ${currentYear + 1}`);
    }
  }

  if (color !== undefined && typeof color !== 'string') {
    errors.push('color must be a string');
  }

  if (fuelType !== undefined && !FUEL_TYPES.includes(fuelType)) {
    errors.push(`fuelType must be one of: ${FUEL_TYPES.join(', ')}`);
  }

  if (gpsProvider !== undefined && !GPS_PROVIDERS.includes(gpsProvider)) {
    errors.push(`gpsProvider must be one of: ${GPS_PROVIDERS.join(', ')}`);
  }

  if (gpsDeviceId !== undefined && typeof gpsDeviceId !== 'string') {
    errors.push('gpsDeviceId must be a string');
  }

  // Validate date fields
  const dateFields = [
    'insuranceExpiry',
    'fitnessExpiry',
    'permitExpiry',
    'lastMaintenanceDate',
    'nextMaintenanceDate'
  ];
  const dateValues = [
    insuranceExpiry,
    fitnessExpiry,
    permitExpiry,
    lastMaintenanceDate,
    nextMaintenanceDate
  ];

  dateFields.forEach((field, index) => {
    const value = dateValues[index];
    if (value !== undefined && value !== null) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        errors.push(`${field} must be a valid date`);
      }
    }
  });

  if (odometerReading !== undefined && (typeof odometerReading !== 'number' || odometerReading < 0)) {
    errors.push('odometerReading must be a non-negative number');
  }

  if (
    averageFuelConsumption !== undefined &&
    averageFuelConsumption !== null &&
    (typeof averageFuelConsumption !== 'number' || averageFuelConsumption <= 0)
  ) {
    errors.push('averageFuelConsumption must be a positive number');
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
 * Validate vehicle assignment
 */
function validateAssignVehicle(req, res, next) {
  const { driverId } = req.body;

  const errors = [];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!driverId) {
    errors.push('driverId is required');
  } else if (!uuidRegex.test(driverId)) {
    errors.push('Invalid driverId format');
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
  validateCreateVehicle,
  validateUpdateVehicle,
  validateAssignVehicle,
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  FUEL_TYPES,
  GPS_PROVIDERS
};
