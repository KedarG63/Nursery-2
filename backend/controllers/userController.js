/**
 * User Controller
 * Handles user management operations
 */

const pool = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * Get all users
 * GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.status,
        u.created_at,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.email, u.full_name, u.phone, u.status, u.created_at
      ORDER BY u.created_at DESC
    `);

    res.status(200).json({
      success: true,
      users: result.rows.map(user => ({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        status: user.status,
        roles: user.roles.filter(role => role !== null),
        createdAt: user.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};

/**
 * Get users by role
 * GET /api/users/role/:roleName
 */
const getUsersByRole = async (req, res) => {
  try {
    const { roleName } = req.params;

    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.status,
        u.created_at,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.email, u.full_name, u.phone, u.status, u.created_at
      HAVING $1 = ANY(array_agg(r.name))
      ORDER BY u.created_at DESC
    `, [roleName]);

    res.status(200).json({
      success: true,
      users: result.rows.map(user => ({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        status: user.status,
        roles: user.roles.filter(role => role !== null),
        createdAt: user.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users by role',
      error: error.message,
    });
  }
};

/**
 * Create a new user (driver)
 * POST /api/users
 */
const createUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const { email, password, full_name, phone, role, license_number, license_expiry } = req.body;

    await client.query('BEGIN');

    // Check if user already exists
    const userCheck = await client.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password, full_name, phone, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, email, full_name, phone, status, created_at`,
      [email, hashedPassword, full_name, phone]
    );

    const user = userResult.rows[0];

    // Assign role
    const roleResult = await client.query(
      'SELECT id FROM roles WHERE name = $1',
      [role || 'Delivery']
    );

    if (roleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Role '${role}' not found`,
      });
    }

    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [user.id, roleResult.rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        status: user.status,
        roles: [role || 'Delivery'],
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Update user
 * PUT /api/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, license_number, license_expiry } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id, email, full_name, phone, status, created_at`,
      [full_name, phone, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        fullName: result.rows[0].full_name,
        phone: result.rows[0].phone,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message,
    });
  }
};

/**
 * Delete user (soft delete)
 * DELETE /api/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE users
       SET deleted_at = NOW(), status = 'inactive'
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message,
    });
  }
};

/**
 * Update user role
 * PUT /api/users/:id/role
 * Access: Admin only
 */
const updateRole = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    const userCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: `Role '${role}' not found` });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [id, roleResult.rows[0].id]);
    await client.query('COMMIT');

    res.status(200).json({ success: true, message: 'Role updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating role:', error);
    res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Reset user password (Admin only)
 * PUT /api/users/:id/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    const result = await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id',
      [hashedPassword, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

/**
 * Toggle user status (activate / deactivate)
 * PUT /api/users/:id/status
 * Access: Admin only
 */
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'" });
    }

    const result = await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id, status',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'Status updated', status: result.rows[0].status });
  } catch (error) {
    console.error('Error toggling status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

module.exports = {
  getUsers,
  getUsersByRole,
  createUser,
  updateUser,
  deleteUser,
  updateRole,
  resetPassword,
  toggleStatus,
};
