/**
 * User Routes
 * API endpoints for user management
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/users
 * Get all users
 * Access: Admin, Manager
 */
router.get('/', authorize(['Admin', 'Manager']), userController.getUsers);

/**
 * GET /api/users/role/:roleName
 * Get users by role
 * Access: Admin, Manager
 */
router.get('/role/:roleName', authorize(['Admin', 'Manager']), userController.getUsersByRole);

/**
 * POST /api/users
 * Create a new user
 * Access: Admin, Manager
 */
router.post('/', authorize(['Admin', 'Manager']), userController.createUser);

/**
 * PUT /api/users/:id
 * Update user
 * Access: Admin, Manager
 */
router.put('/:id', authorize(['Admin', 'Manager']), userController.updateUser);

/**
 * DELETE /api/users/:id
 * Delete user (soft delete)
 * Access: Admin
 */
router.delete('/:id', authorize(['Admin']), userController.deleteUser);

module.exports = router;
