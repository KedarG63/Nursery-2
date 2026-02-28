const bcrypt = require('bcrypt');
const db = require('../utils/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const BCRYPT_ROUNDS = 10;

/**
 * Register a new user
 */
async function register(req, res) {
  const { email, password, fullName, phone } = req.body;

  try {
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Start transaction
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id, email, full_name, status, created_at`,
        [email.toLowerCase(), passwordHash, fullName, phone || null]
      );

      const user = userResult.rows[0];

      // Get 'Warehouse' role ID (default role)
      const roleResult = await client.query(
        "SELECT id FROM roles WHERE name = 'Warehouse'"
      );

      if (roleResult.rows.length > 0) {
        // Assign default role
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, roleResult.rows[0].id]
        );
      }

      await client.query('COMMIT');

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id });

      console.log(`New user registered: ${user.email}`);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          status: user.status,
          createdAt: user.created_at,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register user',
    });
  }
}

/**
 * Login user
 */
async function login(req, res) {
  const { email, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  try {
    // Find user by email
    const userResult = await db.query(
      `SELECT
        u.id,
        u.email,
        u.password_hash,
        u.full_name,
        u.status,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE LOWER(u.email) = LOWER($1)
      GROUP BY u.id, u.email, u.password_hash, u.full_name, u.status`,
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log(`Failed login attempt for non-existent user: ${email} from ${clientIp}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

    const user = userResult.rows[0];

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      console.log(`Failed login attempt for ${email} from ${clientIp}: Invalid password`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

    // Check user status
    if (user.status !== 'active') {
      console.log(`Login attempt for ${user.status} account: ${email}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: `Account is ${user.status}. Please contact administrator.`,
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id });

    console.log(`Successful login: ${user.email}`);

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        status: user.status,
        roles: user.roles.filter(role => role !== null),
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process login',
    });
  }
}

/**
 * Refresh access token
 */
async function refresh(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Refresh token is required',
    });
  }

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Fetch user from database
    const userResult = await db.query(
      'SELECT id, email, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Account is ${user.status}`,
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken({ userId: user.id, email: user.email });
    const newRefreshToken = generateRefreshToken({ userId: user.id });

    res.status(200).json({
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
    });
  }
}

module.exports = {
  register,
  login,
  refresh,
};
