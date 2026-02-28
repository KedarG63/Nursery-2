/**
 * Notifications Routes
 * API endpoints for in-app notifications
 * Issue #80: Create in-app notification API endpoints
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get notifications for current user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { unreadOnly = false, limit = 50 } = req.query;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    let query = `
      SELECT *
      FROM notifications
      WHERE (user_id = $1 OR role_name = ANY($2))
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    const params = [userId, userRoles];

    if (unreadOnly === 'true') {
      query += ` AND read = FALSE`;
    }

    query += ` ORDER BY created_at DESC LIMIT $3`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    const countQuery = `
      SELECT COUNT(*) as unread_count
      FROM notifications
      WHERE (user_id = $1 OR role_name = ANY($2))
        AND read = FALSE
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    const result = await pool.query(countQuery, [userId, userRoles]);

    res.json({
      success: true,
      unreadCount: parseInt(result.rows[0].unread_count)
    });

  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, userId]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    await pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE (user_id = $1 OR role_name = ANY($2))
         AND read = FALSE`,
      [userId, userRoles]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Only allow user to delete their own notifications
    await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, userId]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * GET /api/notifications/by-type/:type
 * Get notifications by type
 */
router.get('/by-type/:type', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;
    const { limit = 20 } = req.query;

    // Get user roles
    const rolesQuery = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows.map(r => r.name);

    const query = `
      SELECT *
      FROM notifications
      WHERE (user_id = $1 OR role_name = ANY($2))
        AND notification_type = $3
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY created_at DESC
      LIMIT $4
    `;

    const result = await pool.query(query, [userId, userRoles, type, parseInt(limit)]);

    res.json({
      success: true,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Error fetching notifications by type:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

module.exports = router;
