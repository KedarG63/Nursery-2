const db = require('../utils/db');

/**
 * Get all products with pagination and filters
 */
async function getAllProducts(req, res) {
  try {
    const {
      limit = 50,
      offset = 0,
      search = '',
      category = '',
      status = '',
      is_active = '',
    } = req.query;

    // Build query dynamically
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Exclude soft deleted products
    conditions.push('p.deleted_at IS NULL');

    // Filter by status (support both 'status' and 'is_active' params for backward compatibility)
    if (status) {
      paramCount++;
      conditions.push(`p.status = $${paramCount}`);
      params.push(status);
    } else if (is_active !== '') {
      paramCount++;
      // Convert boolean to status enum
      const statusValue = is_active === 'true' ? 'active' : 'inactive';
      conditions.push(`p.status = $${paramCount}`);
      params.push(statusValue);
    }

    // Filter by category
    if (category) {
      paramCount++;
      conditions.push(`p.category = $${paramCount}`);
      params.push(category);
    }

    // Search by name or description
    if (search) {
      paramCount++;
      conditions.push(`(LOWER(p.name) LIKE $${paramCount} OR LOWER(p.description) LIKE $${paramCount})`);
      params.push(`%${search.toLowerCase()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get products with SKU count
    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(parseInt(offset));

    const query = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.category,
        p.status,
        p.growth_period_days,
        p.lot_size,
        p.image_url,
        p.created_at,
        p.updated_at,
        COUNT(s.id) as sku_count
      FROM products p
      LEFT JOIN skus s ON s.product_id = p.id AND s.deleted_at IS NULL
      ${whereClause}
      GROUP BY p.id, p.name, p.description, p.category, p.status, p.growth_period_days, p.lot_size, p.image_url, p.created_at, p.updated_at
      ORDER BY p.created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch products',
    });
  }
}

/**
 * Get single product by ID
 */
async function getProductById(req, res) {
  const { id } = req.params;

  try {
    const query = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.category,
        p.status,
        p.growth_period_days,
        p.lot_size,
        p.image_url,
        p.created_at,
        p.updated_at,
        u.full_name as created_by_name,
        COUNT(s.id) as sku_count
      FROM products p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN skus s ON s.product_id = p.id AND s.deleted_at IS NULL
      WHERE p.id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.description, p.category, p.status, p.growth_period_days, p.lot_size, p.image_url, p.created_at, p.updated_at, u.full_name
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch product',
    });
  }
}

/**
 * Create a new product
 */
async function createProduct(req, res) {
  const { name, description, category, growth_period_days, lot_size, image_url } = req.body;
  const userId = req.user?.id;

  try {
    // Check if product with same name already exists
    const existingProduct = await db.query(
      'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL',
      [name]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A product with this name already exists',
      });
    }

    // Insert new product
    const query = `
      INSERT INTO products (name, description, category, growth_period_days, lot_size, image_url, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING id, name, description, category, status, growth_period_days, lot_size, image_url, created_at, updated_at
    `;

    const result = await db.query(query, [
      name,
      description || null,
      category,
      growth_period_days,
      lot_size || 1000,
      image_url || null,
      userId || null,
    ]);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating product:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A product with this name already exists',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create product',
    });
  }
}

/**
 * Update a product
 */
async function updateProduct(req, res) {
  const { id } = req.params;
  const { name, description, category, growth_period_days, lot_size, image_url, status } = req.body;

  try {
    // Check if product exists
    const existingProduct = await db.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }

    if (category !== undefined) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      params.push(category);
    }

    if (growth_period_days !== undefined) {
      paramCount++;
      updates.push(`growth_period_days = $${paramCount}`);
      params.push(growth_period_days);
    }

    if (lot_size !== undefined) {
      paramCount++;
      updates.push(`lot_size = $${paramCount}`);
      params.push(lot_size);
    }

    if (image_url !== undefined) {
      paramCount++;
      updates.push(`image_url = $${paramCount}`);
      params.push(image_url);
    }

    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No fields to update',
      });
    }

    paramCount++;
    params.push(id);

    const query = `
      UPDATE products
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, name, description, category, status, growth_period_days, lot_size, image_url, created_at, updated_at
    `;

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating product:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A product with this name already exists',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update product',
    });
  }
}

/**
 * Soft delete a product
 */
async function deleteProduct(req, res) {
  const { id } = req.params;

  try {
    // Check if product exists
    const existingProduct = await db.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
    }

    // Soft delete by setting deleted_at timestamp
    const query = `
      UPDATE products
      SET deleted_at = CURRENT_TIMESTAMP, status = 'discontinued'
      WHERE id = $1
      RETURNING id, name
    `;

    const result = await db.query(query, [id]);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete product',
    });
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
