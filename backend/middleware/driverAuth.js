/**
 * Driver Authentication Middleware
 * Issue #38: Driver authentication for mobile app
 * Verifies that the authenticated user has 'Delivery' role
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Authenticate driver (must be a user with Delivery role)
 */
async function authenticateDriver(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please include a valid JWT token in the Authorization header.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Fetch user with roles from database
    const userQuery = `
      SELECT
        u.id,
        u.email,
        u.full_name as name,
        u.phone_number,
        u.status,
        array_agg(DISTINCT r.role_name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id, u.email, u.full_name, u.phone_number, u.status
    `;

    const result = await pool.query(userQuery, [decoded.userId || decoded.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Check if user has Delivery role
    if (!user.roles || !user.roles.includes('Delivery')) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. User must have Delivery role to access driver endpoints.'
      });
    }

    // Attach driver info to request
    req.driver = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone_number,
      roles: user.roles
    };

    next();
  } catch (error) {
    console.error('Driver authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
}

/**
 * Optional: Check if driver has active assignment
 */
async function checkActiveAssignment(req, res, next) {
  try {
    const driverId = req.driver.id;

    const query = `
      SELECT da.*, v.registration_number, dr.route_number
      FROM driver_assignments da
      JOIN vehicles v ON da.vehicle_id = v.id
      LEFT JOIN delivery_routes dr ON da.route_id = dr.id
      WHERE da.driver_id = $1
        AND da.is_active = true
      ORDER BY da.assigned_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [driverId]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No active assignment found for driver'
      });
    }

    req.assignment = result.rows[0];
    next();
  } catch (error) {
    console.error('Error checking assignment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify assignment',
      error: error.message
    });
  }
}

module.exports = {
  authenticateDriver,
  checkActiveAssignment
};
