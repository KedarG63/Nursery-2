const pool = require('../config/database');

/**
 * Customer Controller
 * Issue: #20 - Create customer CRUD API endpoints
 */

// List customers with search and filters
const listCustomers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      customer_type,
      status,
      search,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;
    const queryParams = [];
    let paramCount = 1;

    // Base query with aggregated data
    let query = `
      SELECT
        c.*,
        COUNT(DISTINCT ca.id) as address_count,
        cc.credit_limit,
        cc.credit_used,
        cc.credit_available,
        cc.overdue_amount
      FROM customers c
      LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.deleted_at IS NULL
      LEFT JOIN customer_credit cc ON cc.customer_id = c.id
      WHERE c.deleted_at IS NULL
    `;

    // Apply filters
    if (customer_type) {
      query += ` AND c.customer_type = $${paramCount++}`;
      queryParams.push(customer_type);
    }

    if (status) {
      query += ` AND c.status = $${paramCount++}`;
      queryParams.push(status);
    }

    if (search) {
      query += ` AND (
        c.name ILIKE $${paramCount} OR
        c.email ILIKE $${paramCount} OR
        c.phone ILIKE $${paramCount} OR
        c.customer_code ILIKE $${paramCount}
      )`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Group by
    query += ` GROUP BY c.id, cc.credit_limit, cc.credit_used, cc.credit_available, cc.overdue_amount`;

    // Sorting
    const validSortColumns = ['created_at', 'name', 'customer_code', 'customer_type', 'status'];
    const sortColumn = validSortColumns.includes(sort_by) ? `c.${sort_by}` : 'c.created_at';
    const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortDirection}`;

    // Pagination
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount}`;
    queryParams.push(limit, offset);

    // Execute query
    const result = await pool.query(query, queryParams);

    // Count total
    let countQuery = 'SELECT COUNT(*) FROM customers c WHERE c.deleted_at IS NULL';
    const countParams = [];
    let countParamIndex = 1;

    if (customer_type) {
      countQuery += ` AND c.customer_type = $${countParamIndex++}`;
      countParams.push(customer_type);
    }

    if (status) {
      countQuery += ` AND c.status = $${countParamIndex++}`;
      countParams.push(status);
    }

    if (search) {
      countQuery += ` AND (
        c.name ILIKE $${countParamIndex} OR
        c.email ILIKE $${countParamIndex} OR
        c.phone ILIKE $${countParamIndex} OR
        c.customer_code ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customers'
    });
  }
};

// Get customer by ID with full details
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer details
    const customerQuery = `
      SELECT
        c.*,
        cc.credit_limit,
        cc.credit_used,
        cc.credit_available,
        cc.overdue_amount,
        cc.last_payment_date,
        cc.alert_threshold,
        created_user.full_name as created_by_name,
        updated_user.full_name as updated_by_name
      FROM customers c
      LEFT JOIN customer_credit cc ON cc.customer_id = c.id
      LEFT JOIN users created_user ON created_user.id = c.created_by
      LEFT JOIN users updated_user ON updated_user.id = c.updated_by
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `;

    const customerResult = await pool.query(customerQuery, [id]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const customer = customerResult.rows[0];

    // Get addresses
    const addressesQuery = `
      SELECT * FROM customer_addresses
      WHERE customer_id = $1 AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at DESC
    `;
    const addressesResult = await pool.query(addressesQuery, [id]);

    // Get recent credit transactions
    const transactionsQuery = `
      SELECT
        ct.*,
        u.full_name as created_by_name
      FROM credit_transactions ct
      LEFT JOIN users u ON u.id = ct.created_by
      WHERE ct.customer_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 10
    `;
    const transactionsResult = await pool.query(transactionsQuery, [id]);

    res.json({
      success: true,
      data: {
        customer,
        addresses: addressesResult.rows,
        credit_transactions: transactionsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer'
    });
  }
};

// Create new customer
const createCustomer = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      name,
      email,
      phone,
      whatsapp_number,
      customer_type = 'Retail',
      gst_number,
      credit_limit = 0,
      credit_days = 30,
      preferences = {},
      notes,
      addresses = []
    } = req.body;

    // Check for duplicate phone
    const duplicateCheck = await client.query(
      'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL',
      [phone]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Customer with this phone number already exists'
      });
    }

    // Check for soft-deleted customer with same phone — restore and overwrite with new details
    const softDeleted = await client.query(
      'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NOT NULL',
      [phone]
    );

    if (softDeleted.rows.length > 0) {
      const restoredId = softDeleted.rows[0].id;
      await client.query(
        `UPDATE customers SET
           deleted_at = NULL,
           deleted_by = NULL,
           status = 'active',
           name = $3,
           email = $4,
           whatsapp_number = $5,
           customer_type = $6,
           gst_number = $7,
           credit_limit = $8,
           credit_days = $9,
           notes = $10,
           updated_by = $1,
           updated_at = NOW()
         WHERE id = $2`,
        [
          req.user.id,
          restoredId,
          name,
          email || null,
          whatsapp_number || phone,
          customer_type,
          gst_number || null,
          credit_limit,
          credit_days,
          notes || null,
        ]
      );
      await client.query('COMMIT');
      const restored = await pool.query(
        `SELECT c.*,
          (SELECT json_agg(ca.*) FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.deleted_at IS NULL) as addresses
         FROM customers c WHERE c.id = $1`,
        [restoredId]
      );
      return res.status(200).json({
        success: true,
        data: restored.rows[0],
        message: 'Customer created successfully'
      });
    }

    // Insert customer
    const insertQuery = `
      INSERT INTO customers (
        name, email, phone, whatsapp_number, customer_type,
        gst_number, credit_limit, credit_days, preferences, notes,
        status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $11)
      RETURNING *
    `;

    const values = [
      name,
      email || null,
      phone,
      whatsapp_number || phone,
      customer_type,
      gst_number || null,
      credit_limit,
      credit_days,
      JSON.stringify(preferences),
      notes || null,
      req.user.id
    ];

    const result = await client.query(insertQuery, values);
    const customer = result.rows[0];

    // Insert addresses if provided
    if (addresses && addresses.length > 0) {
      // If an address has is_default, keep it; otherwise make first address default
      const hasDefault = addresses.some(addr => addr.is_default);

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        const isDefault = hasDefault ? (address.is_default || false) : (i === 0);

        await client.query(
          `INSERT INTO customer_addresses (
            customer_id, address_line1, address_line2, city, state, pincode,
            is_default
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            customer.id,
            address.address_line1,
            address.address_line2 || null,
            address.city,
            address.state,
            address.pincode || null,
            isDefault,
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch customer with addresses
    const customerWithAddresses = await pool.query(
      `SELECT c.*,
        (SELECT json_agg(ca.*) FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.deleted_at IS NULL) as addresses
       FROM customers c
       WHERE c.id = $1`,
      [customer.id]
    );

    res.status(201).json({
      success: true,
      data: customerWithAddresses.rows[0],
      message: 'Customer created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating customer:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A customer with this phone number already exists'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create customer',
      details: error.message
    });
  } finally {
    client.release();
  }
};

// Update customer
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      whatsapp_number,
      customer_type,
      gst_number,
      credit_limit,
      credit_days,
      status,
      preferences,
      notes
    } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (whatsapp_number !== undefined) {
      updates.push(`whatsapp_number = $${paramCount++}`);
      values.push(whatsapp_number);
    }
    if (customer_type !== undefined) {
      updates.push(`customer_type = $${paramCount++}`);
      values.push(customer_type);
    }
    if (gst_number !== undefined) {
      updates.push(`gst_number = $${paramCount++}`);
      values.push(gst_number || null);
    }
    if (credit_limit !== undefined) {
      updates.push(`credit_limit = $${paramCount++}`);
      values.push(credit_limit);
    }
    if (credit_days !== undefined) {
      updates.push(`credit_days = $${paramCount++}`);
      values.push(credit_days);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (preferences !== undefined) {
      updates.push(`preferences = $${paramCount++}`);
      values.push(JSON.stringify(preferences));
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_by = $${paramCount++}`);
    values.push(req.user.id);

    values.push(id);

    const query = `
      UPDATE customers
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Sync credit_limit to customer_credit table if it was changed
    if (credit_limit !== undefined) {
      await pool.query(
        `UPDATE customer_credit SET credit_limit = $1, updated_at = NOW()
         WHERE customer_id = $2`,
        [credit_limit, id]
      );
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Customer updated successfully'
    });
  } catch (error) {
    console.error('Error updating customer:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Phone number already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update customer'
    });
  }
};

// Deactivate customer (soft delete)
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete
    const result = await pool.query(
      `UPDATE customers
       SET deleted_at = NOW(), deleted_by = $2, updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete customer'
    });
  }
};

// Address Management Functions

// Create address
const createAddress = async (req, res) => {
  try {
    const {
      customer_id,
      address_type = 'both',
      address_line1,
      address_line2,
      landmark,
      city,
      state,
      pincode,
      gps_latitude,
      gps_longitude,
      is_default = false,
      delivery_instructions
    } = req.body;

    // Verify customer exists
    const customerCheck = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [customer_id]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const query = `
      INSERT INTO customer_addresses (
        customer_id, address_type, address_line1, address_line2,
        landmark, city, state, pincode, gps_latitude, gps_longitude,
        is_default, delivery_instructions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      customer_id,
      address_type,
      address_line1,
      address_line2 || null,
      landmark || null,
      city,
      state,
      pincode,
      gps_latitude || null,
      gps_longitude || null,
      is_default,
      delivery_instructions || null
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Address created successfully'
    });
  } catch (error) {
    console.error('Error creating address:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create address'
    });
  }
};

// Update address
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'address_type',
      'address_line1',
      'address_line2',
      'landmark',
      'city',
      'state',
      'pincode',
      'gps_latitude',
      'gps_longitude',
      'is_default',
      'delivery_instructions'
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount++}`);
        values.push(req.body[field]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    values.push(id);

    const query = `
      UPDATE customer_addresses
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Address updated successfully'
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update address'
    });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's the only address
    const addressCheck = await pool.query(
      `SELECT customer_id, is_default FROM customer_addresses
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (addressCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Address not found'
      });
    }

    const customerId = addressCheck.rows[0].customer_id;

    const countQuery = await pool.query(
      `SELECT COUNT(*) FROM customer_addresses
       WHERE customer_id = $1 AND deleted_at IS NULL`,
      [customerId]
    );

    if (parseInt(countQuery.rows[0].count) === 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the only address'
      });
    }

    // Soft delete
    await pool.query('UPDATE customer_addresses SET deleted_at = NOW() WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete address'
    });
  }
};

// Get customer credit details
const getCustomerCredit = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        cc.*,
        (SELECT COUNT(*) FROM credit_transactions WHERE customer_id = cc.customer_id) as transaction_count,
        CASE
          WHEN cc.credit_limit > 0 THEN (cc.credit_used / cc.credit_limit * 100)
          ELSE 0
        END as credit_usage_percentage
      FROM customer_credit cc
      WHERE cc.customer_id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer credit record not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching customer credit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve credit details'
    });
  }
};

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createAddress,
  updateAddress,
  deleteAddress,
  getCustomerCredit
};
