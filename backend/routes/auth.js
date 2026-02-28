const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validateRegistration, validateLogin } = require('../validators/authValidator');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// Public routes with strict rate limiting
router.post('/register', authRateLimiter, validateRegistration, authController.register);
router.post('/login', authRateLimiter, validateLogin, authController.login);
router.post('/refresh', authRateLimiter, authController.refresh);

// Protected route - Get current user profile
router.get('/profile', authenticate, (req, res) => {
  res.status(200).json({
    user: req.user,
  });
});

// Protected route - Example: Get all users (Admin only)
router.get('/users', authenticate, authorize(['Admin', 'Manager']), async (req, res) => {
  const db = require('../utils/db');

  try {
    const result = await db.query(`
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
      GROUP BY u.id, u.email, u.full_name, u.phone, u.status, u.created_at
      ORDER BY u.created_at DESC
    `);

    res.status(200).json({
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
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
    });
  }
});

module.exports = router;
