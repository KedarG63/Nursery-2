/**
 * Vendor Controller
 * Phase 22: Purchase & Seeds Management
 */

const pool = require('../config/database');

/**
 * Create a new vendor
 * POST /api/vendors
 */
const createVendor = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      vendor_name,
      vendor_code,
      contact_person,
      phone,
      email,
      address,
      gst_number,
      payment_terms = 30,
      status = 'active',
      notes,
    } = req.body;

    const userId = req.user.id;

    await client.query('BEGIN');

    // Generate vendor code if not provided
    let finalVendorCode = vendor_code;
    if (!finalVendorCode) {
      const countResult = await client.query('SELECT COUNT(*) FROM vendors WHERE deleted_at IS NULL');
      const sequence = String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');
      finalVendorCode = `VEN-${sequence}`;
    }

    // Check if vendor code already exists
    const existingVendor = await client.query(
      'SELECT id FROM vendors WHERE vendor_code = $1 AND deleted_at IS NULL',
      [finalVendorCode]
    );

    if (existingVendor.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Vendor code already exists',
      });
    }

    // Insert vendor
    const insertResult = await client.query(
      `INSERT INTO vendors (
        vendor_code, vendor_name, contact_person, phone, email, address,
        gst_number, payment_terms, status, notes, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *`,
      [
        finalVendorCode,
        vendor_name,
        contact_person,
        phone,
        email,
        address,
        gst_number,
        payment_terms,
        status,
        notes,
        userId,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: insertResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get all vendors with pagination and filters
 * GET /api/vendors
 */
const listVendors = async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
      search,
    } = req.query;

    let query = `
      SELECT *
      FROM vendors
      WHERE deleted_at IS NULL
    `;
    const params = [];
    let paramCount = 0;

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    // Search by name, code, or contact person
    if (search) {
      paramCount++;
      query += ` AND (
        vendor_name ILIKE $${paramCount} OR
        vendor_code ILIKE $${paramCount} OR
        contact_person ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || 0);

    // Add ordering and pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < total,
      },
    });
  } catch (error) {
    console.error('Error listing vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list vendors',
      error: error.message,
    });
  }
};

/**
 * Get vendor by ID
 * GET /api/vendors/:id
 */
const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    // Get purchase statistics
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_purchases,
        COALESCE(SUM(grand_total), 0) as total_spent,
        COALESCE(SUM(grand_total - amount_paid), 0) as outstanding_amount
      FROM seed_purchases
      WHERE vendor_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        statistics: statsResult.rows[0],
      },
    });
  } catch (error) {
    console.error('Error getting vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor',
      error: error.message,
    });
  }
};

/**
 * Update vendor
 * PUT /api/vendors/:id
 */
const updateVendor = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateFields = req.body;

    await client.query('BEGIN');

    // Check if vendor exists
    const existingVendor = await client.query(
      'SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingVendor.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    // Build update query
    const allowedFields = [
      'vendor_name', 'vendor_code', 'contact_person', 'phone', 'email',
      'address', 'gst_number', 'payment_terms', 'status', 'notes',
    ];

    const updates = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updateFields).forEach((key) => {
      if (allowedFields.includes(key)) {
        paramCount++;
        updates.push(`${key} = $${paramCount}`);
        values.push(updateFields[key]);
      }
    });

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
    }

    // Add updated_by
    paramCount++;
    updates.push(`updated_by = $${paramCount}`);
    values.push(userId);

    // Add vendor ID
    paramCount++;
    values.push(id);

    const query = `
      UPDATE vendors
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, values);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Vendor updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Delete vendor (soft delete)
 * DELETE /api/vendors/:id
 */
const deleteVendor = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Check if vendor has any purchases
    const purchasesResult = await client.query(
      'SELECT COUNT(*) FROM seed_purchases WHERE vendor_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (parseInt(purchasesResult.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot delete vendor with existing purchases. Consider marking as inactive instead.',
      });
    }

    // Soft delete
    const result = await client.query(
      `UPDATE vendors
       SET deleted_at = NOW(), updated_by = $1
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Vendor deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vendor',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get vendor purchase history
 * GET /api/vendors/:id/purchases
 */
const getVendorPurchases = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT
        sp.*,
        p.name as product_name,
        s.sku_code
      FROM seed_purchases sp
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.vendor_id = $1 AND sp.deleted_at IS NULL
      ORDER BY sp.purchase_date DESC
      LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM seed_purchases WHERE vendor_id = $1 AND deleted_at IS NULL',
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error('Error getting vendor purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor purchases',
      error: error.message,
    });
  }
};

module.exports = {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  getVendorPurchases,
};
