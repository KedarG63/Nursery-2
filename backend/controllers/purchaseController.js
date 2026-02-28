/**
 * Purchase Controller
 * Phase 22: Purchase & Seeds Management
 */

const pool = require('../config/database');

/**
 * Create a new seed purchase
 * POST /api/purchases
 */
const createPurchase = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      vendor_id,
      product_id,
      sku_id,
      seed_lot_number,
      number_of_packets,
      seeds_per_packet,
      cost_per_packet,
      shipping_cost = 0,
      tax_amount = 0,
      other_charges = 0,
      germination_rate,
      purity_percentage,
      expiry_date,
      purchase_date,
      invoice_number,
      invoice_date,
      storage_location,
      storage_conditions,
      notes,
      quality_notes,
    } = req.body;

    const userId = req.user.id;

    await client.query('BEGIN');

    // Generate purchase number: PUR-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const countResult = await client.query(
      'SELECT COUNT(*) FROM seed_purchases WHERE purchase_number LIKE $1',
      [`PUR-${dateStr}-%`]
    );
    const sequence = String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');
    const purchase_number = `PUR-${dateStr}-${sequence}`;

    // Verify vendor exists
    const vendorCheck = await client.query(
      'SELECT id FROM vendors WHERE id = $1 AND deleted_at IS NULL',
      [vendor_id]
    );

    if (vendorCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    // Verify product exists
    const productCheck = await client.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Insert purchase (computed fields handled by trigger)
    const insertResult = await client.query(
      `INSERT INTO seed_purchases (
        purchase_number, vendor_id, product_id, sku_id, seed_lot_number,
        number_of_packets, seeds_per_packet, cost_per_packet,
        shipping_cost, tax_amount, other_charges,
        germination_rate, purity_percentage, expiry_date, purchase_date,
        invoice_number, invoice_date, storage_location, storage_conditions,
        notes, quality_notes, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $22
      ) RETURNING *`,
      [
        purchase_number, vendor_id, product_id, sku_id, seed_lot_number,
        number_of_packets, seeds_per_packet, cost_per_packet,
        shipping_cost, tax_amount, other_charges,
        germination_rate, purity_percentage, expiry_date, purchase_date,
        invoice_number, invoice_date, storage_location, storage_conditions,
        notes, quality_notes, userId,
      ]
    );

    await client.query('COMMIT');

    // Fetch complete data with relations
    const purchaseData = await pool.query(
      `SELECT
        sp.*,
        v.vendor_name,
        v.vendor_code,
        p.name as product_name,
        s.sku_code
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.id = $1`,
      [insertResult.rows[0].id]
    );

    res.status(201).json({
      success: true,
      message: 'Seed purchase created successfully',
      data: purchaseData.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get all purchases with pagination and filters
 * GET /api/purchases
 */
const listPurchases = async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      vendor_id,
      product_id,
      inventory_status,
      payment_status,
      search,
    } = req.query;

    let query = `
      SELECT
        sp.*,
        v.vendor_name,
        v.vendor_code,
        p.name as product_name,
        s.sku_code
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.deleted_at IS NULL
    `;
    const params = [];
    let paramCount = 0;

    // Filters
    if (vendor_id) {
      paramCount++;
      query += ` AND sp.vendor_id = $${paramCount}`;
      params.push(vendor_id);
    }

    if (product_id) {
      paramCount++;
      query += ` AND sp.product_id = $${paramCount}`;
      params.push(product_id);
    }

    if (inventory_status) {
      paramCount++;
      query += ` AND sp.inventory_status = $${paramCount}`;
      params.push(inventory_status);
    }

    if (payment_status) {
      paramCount++;
      query += ` AND sp.payment_status = $${paramCount}`;
      params.push(payment_status);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        sp.purchase_number ILIKE $${paramCount} OR
        sp.seed_lot_number ILIKE $${paramCount} OR
        sp.invoice_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Get total count - replace the entire SELECT clause up to FROM
    const countQuery = query.replace(
      /SELECT\s+[\s\S]+?\s+FROM/,
      'SELECT COUNT(*) FROM'
    );
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || 0);

    // Add ordering and pagination
    query += ` ORDER BY sp.purchase_date DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
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
    console.error('Error listing purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list purchases',
      error: error.message,
    });
  }
};

/**
 * Get purchase by ID with details
 * GET /api/purchases/:id
 */
const getPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        sp.*,
        v.vendor_name,
        v.vendor_code,
        v.contact_person,
        v.phone as vendor_phone,
        v.email as vendor_email,
        p.name as product_name,
        p.category as product_category,
        s.sku_code
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.id = $1 AND sp.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }

    // Get payment history
    const paymentsResult = await pool.query(
      `SELECT * FROM seed_purchase_payments
       WHERE seed_purchase_id = $1
       ORDER BY payment_date DESC`,
      [id]
    );

    // Get usage history
    const usageResult = await pool.query(
      `SELECT
        suh.*,
        l.lot_number,
        l.growth_stage,
        l.planted_date
      FROM seed_usage_history suh
      JOIN lots l ON suh.lot_id = l.id
      WHERE suh.seed_purchase_id = $1
      ORDER BY suh.allocated_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        payments: paymentsResult.rows,
        usage_history: usageResult.rows,
      },
    });
  } catch (error) {
    console.error('Error getting purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get purchase',
      error: error.message,
    });
  }
};

/**
 * Update purchase
 * PUT /api/purchases/:id
 */
const updatePurchase = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateFields = req.body;

    await client.query('BEGIN');

    // Check if purchase exists
    const existingPurchase = await client.query(
      'SELECT * FROM seed_purchases WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingPurchase.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }

    // Cannot modify if seeds already used
    if (existingPurchase.rows[0].seeds_used > 0) {
      // Only allow certain fields to be updated
      const restrictedFields = ['number_of_packets', 'seeds_per_packet', 'cost_per_packet'];
      const hasRestrictedUpdate = restrictedFields.some(field => field in updateFields);

      if (hasRestrictedUpdate) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Cannot modify quantity or cost fields after seeds have been used',
        });
      }
    }

    // Build update query
    const allowedFields = [
      'vendor_id', 'product_id', 'sku_id', 'seed_lot_number',
      'number_of_packets', 'seeds_per_packet', 'cost_per_packet',
      'shipping_cost', 'tax_amount', 'other_charges',
      'germination_rate', 'purity_percentage', 'expiry_date', 'purchase_date',
      'invoice_number', 'invoice_date', 'storage_location', 'storage_conditions',
      'notes', 'quality_notes',
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

    // Add purchase ID
    paramCount++;
    values.push(id);

    const query = `
      UPDATE seed_purchases
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, values);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Purchase updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update purchase',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Delete purchase (soft delete)
 * DELETE /api/purchases/:id
 */
const deletePurchase = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Check if any seeds have been used
    const purchaseCheck = await client.query(
      'SELECT seeds_used FROM seed_purchases WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (purchaseCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }

    if (purchaseCheck.rows[0].seeds_used > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot delete purchase with seeds already allocated to lots',
      });
    }

    // Soft delete
    const result = await client.query(
      `UPDATE seed_purchases
       SET deleted_at = NOW(), updated_by = $1
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Purchase deleted successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete purchase',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Check seed availability for lot creation
 * GET /api/purchases/check-availability
 */
const checkAvailability = async (req, res) => {
  try {
    const { product_id, sku_id, seeds_needed } = req.query;

    const query = `
      SELECT
        sp.*,
        v.vendor_name,
        p.name as product_name,
        s.sku_code
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.product_id = $1
        AND ($2::uuid IS NULL OR sp.sku_id = $2)
        AND sp.inventory_status = 'available'
        AND sp.expiry_date > CURRENT_DATE
        AND sp.seeds_remaining >= $3
        AND sp.deleted_at IS NULL
      ORDER BY sp.expiry_date ASC, sp.purchase_date ASC
    `;

    const result = await pool.query(query, [product_id, sku_id || null, seeds_needed]);

    res.json({
      success: true,
      available: result.rows.length > 0,
      data: result.rows,
      seeds_needed: parseInt(seeds_needed),
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: error.message,
    });
  }
};

/**
 * Get seeds expiring soon
 * GET /api/purchases/expiring-soon
 */
const getExpiringSoon = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await pool.query(
      `SELECT
        sp.*,
        v.vendor_name,
        p.name as product_name,
        s.sku_code,
        (sp.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.deleted_at IS NULL
        AND sp.inventory_status IN ('available', 'low_stock')
        AND sp.expiry_date > CURRENT_DATE
        AND sp.expiry_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
      ORDER BY sp.expiry_date ASC`,
      [days]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error getting expiring seeds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get expiring seeds',
      error: error.message,
    });
  }
};

/**
 * Get low stock alerts
 * GET /api/purchases/low-stock
 */
const getLowStock = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        sp.*,
        v.vendor_name,
        p.name as product_name,
        s.sku_code,
        ROUND((sp.seeds_remaining::DECIMAL / sp.total_seeds * 100)::NUMERIC, 2) as remaining_percentage
      FROM seed_purchases sp
      JOIN vendors v ON sp.vendor_id = v.id
      JOIN products p ON sp.product_id = p.id
      LEFT JOIN skus s ON sp.sku_id = s.id
      WHERE sp.deleted_at IS NULL
        AND sp.inventory_status = 'low_stock'
      ORDER BY remaining_percentage ASC`
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error getting low stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get low stock',
      error: error.message,
    });
  }
};

/**
 * Record payment for purchase
 * POST /api/purchases/:id/payments
 */
const recordPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { payment_date, amount, payment_method, transaction_reference, notes } = req.body;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Check if purchase exists
    const purchaseCheck = await client.query(
      'SELECT * FROM seed_purchases WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (purchaseCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }

    const purchase = purchaseCheck.rows[0];

    // Validate payment amount
    const remainingAmount = parseFloat(purchase.grand_total) - parseFloat(purchase.amount_paid);
    if (parseFloat(amount) > remainingAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment amount exceeds remaining balance of ${remainingAmount.toFixed(2)}`,
      });
    }

    // Insert payment
    const result = await client.query(
      `INSERT INTO seed_purchase_payments (
        seed_purchase_id, payment_date, amount, payment_method,
        transaction_reference, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [id, payment_date, amount, payment_method, transaction_reference, notes, userId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get purchase usage history
 * GET /api/purchases/:id/usage-history
 */
const getUsageHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        suh.*,
        l.lot_number,
        l.growth_stage,
        l.planted_date,
        l.expected_ready_date,
        p.name as product_name,
        s.sku_code,
        u.email as allocated_by_email
      FROM seed_usage_history suh
      JOIN lots l ON suh.lot_id = l.id
      JOIN skus s ON l.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      LEFT JOIN users u ON suh.allocated_by = u.id
      WHERE suh.seed_purchase_id = $1
      ORDER BY suh.allocated_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error getting usage history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get usage history',
      error: error.message,
    });
  }
};

module.exports = {
  createPurchase,
  listPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  checkAvailability,
  getExpiringSoon,
  getLowStock,
  recordPayment,
  getUsageHistory,
};
