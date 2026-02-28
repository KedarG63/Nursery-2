const { verifyAccessToken } = require('../utils/jwt');
const db = require('../utils/db');

/**
 * Authentication middleware - validates JWT token
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided. Please include a valid JWT token in the Authorization header.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    // Fetch user with roles from database
    const userQuery = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.status,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id, u.email, u.full_name, u.status
    `;

    const result = await db.query(userQuery, [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Account is ${user.status}. Please contact administrator.`,
      });
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      roles: user.roles.filter(role => role !== null), // Remove null from array_agg
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.message.includes('Invalid access token')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

module.exports = { authenticate };
