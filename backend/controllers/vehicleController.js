/**
 * Vehicle Controller
 * Issue #60: Vehicle management endpoints
 * Handles CRUD operations for vehicles
 */

const pool = require('../config/database');

/**
 * Create a new vehicle
 * POST /api/vehicles
 */
const createVehicle = async (req, res) => {
  const client = await pool.connect();

  try {
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
      gpsDeviceId,
      insuranceExpiry,
      fitnessExpiry,
      permitExpiry,
      averageFuelConsumption
    } = req.body;

    await client.query('BEGIN');

    // Check if registration number already exists
    const checkQuery = `
      SELECT id FROM vehicles
      WHERE registration_number = $1 AND deleted_at IS NULL
    `;
    const checkResult = await client.query(checkQuery, [registrationNumber]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Vehicle with this registration number already exists'
      });
    }

    // Insert vehicle
    const insertQuery = `
      INSERT INTO vehicles (
        registration_number, vehicle_type, capacity_units, capacity_weight_kg,
        make_model, year, color, fuel_type, gps_provider, gps_device_id,
        insurance_expiry, fitness_expiry, permit_expiry, average_fuel_consumption,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      registrationNumber,
      vehicleType,
      capacityUnits,
      capacityWeightKg || null,
      makeModel || null,
      year || null,
      color || null,
      fuelType || null,
      gpsProvider || 'mock',
      gpsDeviceId || null,
      insuranceExpiry || null,
      fitnessExpiry || null,
      permitExpiry || null,
      averageFuelConsumption || null,
      'available'
    ];

    const result = await client.query(insertQuery, values);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      vehicle: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vehicle',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get all vehicles with filters
 * GET /api/vehicles
 */
const getVehicles = async (req, res) => {
  try {
    const { status, vehicleType, available, page = 1, limit = 20 } = req.query;

    let query = `
      SELECT v.*,
             da.driver_id, u.full_name as current_driver_name
      FROM vehicles v
      LEFT JOIN driver_assignments da ON v.id = da.vehicle_id AND da.is_active = true
      LEFT JOIN users u ON da.driver_id = u.id
      WHERE v.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND v.status = $${paramCount}`;
      params.push(status);
    }

    if (vehicleType) {
      paramCount++;
      query += ` AND v.vehicle_type = $${paramCount}`;
      params.push(vehicleType);
    }

    if (available === 'true') {
      query += ` AND v.status = 'available'`;
    }

    query += ` ORDER BY v.registration_number ASC`;

    // Pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM vehicles v
      WHERE v.deleted_at IS NULL
    `;

    const countParams = [];
    let countParamNum = 0;

    if (status) {
      countParamNum++;
      countQuery += ` AND v.status = $${countParamNum}`;
      countParams.push(status);
    }

    if (vehicleType) {
      countParamNum++;
      countQuery += ` AND v.vehicle_type = $${countParamNum}`;
      countParams.push(vehicleType);
    }

    if (available === 'true') {
      countQuery += ` AND v.status = 'available'`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      vehicles: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles',
      error: error.message
    });
  }
};

/**
 * Get vehicle by ID
 * GET /api/vehicles/:id
 */
const getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT v.*,
             da.driver_id, da.assigned_at, da.assigned_by,
             u.full_name as current_driver_name, u.phone as driver_phone,
             dr.id as current_route_id, dr.route_number, dr.status as route_status
      FROM vehicles v
      LEFT JOIN driver_assignments da ON v.id = da.vehicle_id AND da.is_active = true
      LEFT JOIN users u ON da.driver_id = u.id
      LEFT JOIN delivery_routes dr ON da.route_id = dr.id AND dr.status IN ('assigned', 'in_progress')
      WHERE v.id = $1 AND v.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      vehicle: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle',
      error: error.message
    });
  }
};

/**
 * Update vehicle
 * PUT /api/vehicles/:id
 */
const updateVehicle = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const updates = req.body;

    await client.query('BEGIN');

    // Check if vehicle exists
    const checkQuery = `SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL`;
    const checkResult = await client.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Check if updating registration number to an existing one
    if (updates.registrationNumber) {
      const dupCheckQuery = `
        SELECT id FROM vehicles
        WHERE registration_number = $1 AND id != $2 AND deleted_at IS NULL
      `;
      const dupCheckResult = await client.query(dupCheckQuery, [
        updates.registrationNumber,
        id
      ]);

      if (dupCheckResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Another vehicle with this registration number already exists'
        });
      }
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 0;

    const fieldMap = {
      registrationNumber: 'registration_number',
      vehicleType: 'vehicle_type',
      capacityUnits: 'capacity_units',
      capacityWeightKg: 'capacity_weight_kg',
      status: 'status',
      makeModel: 'make_model',
      year: 'year',
      color: 'color',
      fuelType: 'fuel_type',
      gpsProvider: 'gps_provider',
      gpsDeviceId: 'gps_device_id',
      insuranceExpiry: 'insurance_expiry',
      fitnessExpiry: 'fitness_expiry',
      permitExpiry: 'permit_expiry',
      lastMaintenanceDate: 'last_maintenance_date',
      nextMaintenanceDate: 'next_maintenance_date',
      odometerReading: 'odometer_reading',
      averageFuelConsumption: 'average_fuel_consumption'
    };

    Object.keys(updates).forEach((key) => {
      if (fieldMap[key]) {
        paramCount++;
        fields.push(`${fieldMap[key]} = $${paramCount}`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    paramCount++;
    values.push(id);

    const updateQuery = `
      UPDATE vehicles
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(updateQuery, values);

    await client.query('COMMIT');

    res.json({
      success: true,
      vehicle: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vehicle',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Delete vehicle (soft delete)
 * DELETE /api/vehicles/:id
 */
const deleteVehicle = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if vehicle exists
    const checkQuery = `SELECT * FROM vehicles WHERE id = $1 AND deleted_at IS NULL`;
    const checkResult = await client.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Check if vehicle is currently in use
    if (checkResult.rows[0].status === 'in_use') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete vehicle that is currently in use'
      });
    }

    // Soft delete
    const deleteQuery = `
      UPDATE vehicles
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;

    await client.query(deleteQuery, [id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vehicle',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get vehicle maintenance history
 * GET /api/vehicles/:id/maintenance
 */
const getMaintenanceHistory = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if vehicle exists
    const vehicleQuery = `SELECT id FROM vehicles WHERE id = $1 AND deleted_at IS NULL`;
    const vehicleResult = await pool.query(vehicleQuery, [id]);

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Get vehicle maintenance details
    const query = `
      SELECT
        last_maintenance_date,
        next_maintenance_date,
        odometer_reading,
        insurance_expiry,
        fitness_expiry,
        permit_expiry
      FROM vehicles
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      maintenance: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching maintenance history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance history',
      error: error.message
    });
  }
};

/**
 * Get vehicle GPS location history
 * GET /api/vehicles/:id/location-history
 */
const getLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;

    // Check if vehicle exists
    const vehicleQuery = `SELECT id FROM vehicles WHERE id = $1 AND deleted_at IS NULL`;
    const vehicleResult = await pool.query(vehicleQuery, [id]);

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    let query = `
      SELECT
        id, latitude, longitude, speed_kmh, heading, altitude_m,
        ignition_on, is_moving, recorded_at, route_id
      FROM gps_tracking
      WHERE vehicle_id = $1
    `;

    const params = [id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND recorded_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND recorded_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY recorded_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      locations: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location history',
      error: error.message
    });
  }
};

module.exports = {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getMaintenanceHistory,
  getLocationHistory
};
