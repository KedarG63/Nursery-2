const db = require('../utils/db');

/**
 * Generate SKU code from product name, variety, size, and container type
 * Format: PROD-VAR-SIZE-CONT (e.g., TOM-CHE-MED-POT)
 */
function generateSKUCode(productName, variety, size, containerType) {
  // Extract first 3-4 letters of product name
  const prodCode = productName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Extract first 3 letters of variety or use 'STD' for standard
  const varCode = variety
    ? variety.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')
    : 'STD';

  // Map size to code
  const sizeMap = {
    small: 'SML',
    medium: 'MED',
    large: 'LRG',
  };
  const sizeCode = sizeMap[size] || size.substring(0, 3).toUpperCase();

  // Map container type to code
  const containerMap = {
    tray: 'TRY',
    pot: 'POT',
    seedling_tray: 'STR',
    grow_bag: 'BAG',
  };
  const contCode = containerMap[containerType] || containerType.substring(0, 3).toUpperCase();

  return `${prodCode}-${varCode}-${sizeCode}-${contCode}`;
}

/**
 * Get all SKUs with filters
 */
async function getAllSKUs(req, res) {
  try {
    const {
      limit = 50,
      offset = 0,
      product_id = '',
      size = '',
      container_type = '',
      active = '',
    } = req.query;

    // Build query dynamically
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Exclude soft deleted SKUs and inactive products
    conditions.push('s.deleted_at IS NULL');
    conditions.push("p.deleted_at IS NULL");
    conditions.push("p.status = 'active'");

    // Filter by product_id
    if (product_id) {
      paramCount++;
      conditions.push(`s.product_id = $${paramCount}`);
      params.push(product_id);
    }

    // Filter by size
    if (size) {
      paramCount++;
      conditions.push(`s.size = $${paramCount}`);
      params.push(size);
    }

    // Filter by container_type
    if (container_type) {
      paramCount++;
      conditions.push(`s.container_type = $${paramCount}`);
      params.push(container_type);
    }

    // Filter by active status
    if (active !== '') {
      paramCount++;
      conditions.push(`s.active = $${paramCount}`);
      params.push(active === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count (with JOIN to products for filtering)
    const countQuery = `
      SELECT COUNT(*)
      FROM skus s
      INNER JOIN products p ON p.id = s.product_id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get SKUs with product details and current stock level (placeholder for now)
    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(parseInt(offset));

    const query = `
      SELECT
        s.id,
        s.sku_code,
        s.product_id,
        p.name as product_name,
        p.category as product_category,
        s.variety,
        CONCAT(s.variety, ' - ', s.size, ' - ', s.container_type) as name,
        s.size,
        s.container_type,
        s.price,
        s.cost,
        s.min_stock_level,
        s.max_stock_level,
        s.active,
        s.created_at,
        s.updated_at,
        -- Calculate current stock: seeds + ready saplings
        (
          -- Seeds from purchases (available and not expired)
          COALESCE(
            (SELECT SUM(sp.seeds_remaining)
             FROM seed_purchases sp
             WHERE sp.sku_id = s.id
               AND sp.deleted_at IS NULL
               AND sp.inventory_status IN ('available', 'low_stock')
               AND sp.expiry_date > CURRENT_DATE
            ), 0
          )
          +
          -- Ready saplings from lots
          COALESCE(
            (SELECT SUM(l.available_quantity)
             FROM lots l
             WHERE l.sku_id = s.id
               AND l.deleted_at IS NULL
               AND l.growth_stage = 'ready'
            ), 0
          )
        ) as current_stock
      FROM skus s
      INNER JOIN products p ON p.id = s.product_id
      ${whereClause}
      ORDER BY s.created_at DESC
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
    console.error('Error fetching SKUs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch SKUs',
    });
  }
}

/**
 * Get single SKU by ID
 */
async function getSKUById(req, res) {
  const { id } = req.params;

  try {
    const query = `
      SELECT
        s.id,
        s.sku_code,
        s.product_id,
        p.name as product_name,
        p.category as product_category,
        p.growth_period_days,
        s.variety,
        s.size,
        s.container_type,
        s.price,
        s.cost,
        s.min_stock_level,
        s.max_stock_level,
        s.active,
        s.created_at,
        s.updated_at,
        u.full_name as created_by_name,
        -- Total current stock
        (
          COALESCE(
            (SELECT SUM(sp.seeds_remaining)
             FROM seed_purchases sp
             WHERE sp.sku_id = s.id
               AND sp.deleted_at IS NULL
               AND sp.inventory_status IN ('available', 'low_stock')
               AND sp.expiry_date > CURRENT_DATE
            ), 0
          )
          +
          COALESCE(
            (SELECT SUM(l.available_quantity)
             FROM lots l
             WHERE l.sku_id = s.id
               AND l.deleted_at IS NULL
               AND l.growth_stage = 'ready'
            ), 0
          )
        ) as current_stock,
        -- Stock breakdown
        COALESCE(
          (SELECT SUM(sp.seeds_remaining)
           FROM seed_purchases sp
           WHERE sp.sku_id = s.id
             AND sp.deleted_at IS NULL
             AND sp.inventory_status IN ('available', 'low_stock')
             AND sp.expiry_date > CURRENT_DATE
          ), 0
        ) as seeds_available,
        COALESCE(
          (SELECT SUM(l.available_quantity)
           FROM lots l
           WHERE l.sku_id = s.id
             AND l.deleted_at IS NULL
             AND l.growth_stage = 'ready'
          ), 0
        ) as saplings_ready,
        COALESCE(
          (SELECT SUM(l.quantity)
           FROM lots l
           WHERE l.sku_id = s.id
             AND l.deleted_at IS NULL
             AND l.growth_stage IN ('seed', 'germination', 'seedling', 'transplant')
          ), 0
        ) as saplings_in_growth
      FROM skus s
      INNER JOIN products p ON p.id = s.product_id
      LEFT JOIN users u ON u.id = s.created_by
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'SKU not found',
      });
    }

    const sku = result.rows[0];

    // Add stock breakdown to response
    const response = {
      ...sku,
      stock_breakdown: {
        seeds_available: parseInt(sku.seeds_available || 0),
        saplings_ready: parseInt(sku.saplings_ready || 0),
        saplings_in_growth: parseInt(sku.saplings_in_growth || 0)
      }
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching SKU:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch SKU',
    });
  }
}

/**
 * Create a new SKU
 */
async function createSKU(req, res) {
  const {
    sku_code,
    product_id,
    variety,
    size,
    container_type,
    price,
    cost,
    min_stock_level,
    max_stock_level,
  } = req.body;
  const userId = req.user?.id;

  try {
    // Check if product exists
    const productResult = await db.query(
      'SELECT id, name FROM products WHERE id = $1 AND deleted_at IS NULL',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
    }

    const product = productResult.rows[0];

    // Generate SKU code if not provided
    const finalSKUCode =
      sku_code || generateSKUCode(product.name, variety, size || 'medium', container_type || 'pot');

    // Check if SKU code already exists
    const existingSKU = await db.query(
      'SELECT id FROM skus WHERE sku_code = $1 AND deleted_at IS NULL',
      [finalSKUCode]
    );

    if (existingSKU.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A SKU with this code already exists',
      });
    }

    // Insert new SKU
    const query = `
      INSERT INTO skus (
        sku_code, product_id, variety, size, container_type,
        price, cost, min_stock_level, max_stock_level, created_by, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING id, sku_code, product_id, variety, size, container_type,
                price, cost, min_stock_level, max_stock_level, active, created_at, updated_at
    `;

    const result = await db.query(query, [
      finalSKUCode,
      product_id,
      variety || null,
      size || 'medium',
      container_type || 'pot',
      price,
      cost,
      min_stock_level || 0,
      max_stock_level || 1000,
      userId || null,
    ]);

    res.status(201).json({
      success: true,
      message: 'SKU created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating SKU:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A SKU with this code already exists',
      });
    }

    // Handle foreign key violation
    if (error.code === '23503') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
    }

    // Handle check constraint violation (price > cost)
    if (error.code === '23514') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Price must be greater than cost',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create SKU',
    });
  }
}

/**
 * Update a SKU
 */
async function updateSKU(req, res) {
  const { id } = req.params;
  const {
    sku_code,
    variety,
    size,
    container_type,
    price,
    cost,
    min_stock_level,
    max_stock_level,
    active,
  } = req.body;

  try {
    // Check if SKU exists
    const existingSKU = await db.query(
      'SELECT id FROM skus WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingSKU.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'SKU not found',
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (sku_code !== undefined) {
      paramCount++;
      updates.push(`sku_code = $${paramCount}`);
      params.push(sku_code);
    }

    if (variety !== undefined) {
      paramCount++;
      updates.push(`variety = $${paramCount}`);
      params.push(variety);
    }

    if (size !== undefined) {
      paramCount++;
      updates.push(`size = $${paramCount}`);
      params.push(size);
    }

    if (container_type !== undefined) {
      paramCount++;
      updates.push(`container_type = $${paramCount}`);
      params.push(container_type);
    }

    if (price !== undefined) {
      paramCount++;
      updates.push(`price = $${paramCount}`);
      params.push(price);
    }

    if (cost !== undefined) {
      paramCount++;
      updates.push(`cost = $${paramCount}`);
      params.push(cost);
    }

    if (min_stock_level !== undefined) {
      paramCount++;
      updates.push(`min_stock_level = $${paramCount}`);
      params.push(min_stock_level);
    }

    if (max_stock_level !== undefined) {
      paramCount++;
      updates.push(`max_stock_level = $${paramCount}`);
      params.push(max_stock_level);
    }

    if (active !== undefined) {
      paramCount++;
      updates.push(`active = $${paramCount}`);
      params.push(active);
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
      UPDATE skus
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, sku_code, product_id, variety, size, container_type,
                price, cost, min_stock_level, max_stock_level, active, created_at, updated_at
    `;

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      message: 'SKU updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating SKU:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A SKU with this code already exists',
      });
    }

    // Handle check constraint violation
    if (error.code === '23514') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid data: ensure price > cost and stock levels are valid',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update SKU',
    });
  }
}

/**
 * Deactivate a SKU (soft delete)
 */
async function deleteSKU(req, res) {
  const { id } = req.params;

  try {
    // Check if SKU exists
    const existingSKU = await db.query(
      'SELECT id, sku_code FROM skus WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingSKU.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'SKU not found',
      });
    }

    // Deactivate SKU
    const query = `
      UPDATE skus
      SET active = false, deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, sku_code
    `;

    const result = await db.query(query, [id]);

    res.status(200).json({
      success: true,
      message: 'SKU deactivated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error deactivating SKU:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to deactivate SKU',
    });
  }
}

/**
 * Get detailed stock information for a SKU
 */
async function getSKUStockDetails(req, res) {
  const { id } = req.params;

  try {
    // Get SKU basic info
    const skuQuery = `
      SELECT s.id, s.sku_code, s.product_id, p.name as product_name
      FROM skus s
      INNER JOIN products p ON p.id = s.product_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `;
    const skuResult = await db.query(skuQuery, [id]);

    if (skuResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'SKU not found',
      });
    }

    const sku = skuResult.rows[0];

    // Get seed purchases contributing to stock
    const seedsQuery = `
      SELECT
        sp.id,
        sp.purchase_number,
        sp.seed_lot_number,
        sp.seeds_remaining,
        sp.expiry_date,
        sp.cost_per_seed,
        v.name as vendor_name,
        EXTRACT(DAY FROM (sp.expiry_date - CURRENT_DATE)) as days_until_expiry
      FROM seed_purchases sp
      LEFT JOIN vendors v ON sp.vendor_id = v.id
      WHERE sp.sku_id = $1
        AND sp.deleted_at IS NULL
        AND sp.seeds_remaining > 0
        AND sp.inventory_status IN ('available', 'low_stock')
        AND sp.expiry_date > CURRENT_DATE
      ORDER BY sp.expiry_date ASC
    `;
    const seedsResult = await db.query(seedsQuery, [id]);

    // Get lots contributing to stock
    const lotsQuery = `
      SELECT
        l.id,
        l.lot_number,
        l.quantity,
        l.available_quantity,
        l.allocated_quantity,
        l.growth_stage,
        l.current_location,
        l.expected_ready_date,
        EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
      FROM lots l
      WHERE l.sku_id = $1
        AND l.deleted_at IS NULL
        AND l.available_quantity > 0
      ORDER BY
        CASE l.growth_stage
          WHEN 'ready' THEN 1
          WHEN 'transplant' THEN 2
          WHEN 'seedling' THEN 3
          WHEN 'germination' THEN 4
          WHEN 'seed' THEN 5
        END,
        l.expected_ready_date ASC
    `;
    const lotsResult = await db.query(lotsQuery, [id]);

    // Calculate totals
    const totalSeedsAvailable = seedsResult.rows.reduce((sum, row) => sum + parseInt(row.seeds_remaining), 0);
    const totalSaplingsReady = lotsResult.rows
      .filter(row => row.growth_stage === 'ready')
      .reduce((sum, row) => sum + parseInt(row.available_quantity), 0);
    const totalSaplingsInGrowth = lotsResult.rows
      .filter(row => row.growth_stage !== 'ready')
      .reduce((sum, row) => sum + parseInt(row.quantity), 0);

    res.status(200).json({
      success: true,
      data: {
        sku: {
          id: sku.id,
          sku_code: sku.sku_code,
          product_id: sku.product_id,
          product_name: sku.product_name
        },
        summary: {
          total_stock: totalSeedsAvailable + totalSaplingsReady,
          seeds_available: totalSeedsAvailable,
          saplings_ready: totalSaplingsReady,
          saplings_in_growth: totalSaplingsInGrowth
        },
        seed_sources: seedsResult.rows.map(row => ({
          purchase_id: row.id,
          purchase_number: row.purchase_number,
          seed_lot_number: row.seed_lot_number,
          seeds_remaining: parseInt(row.seeds_remaining),
          expiry_date: row.expiry_date,
          days_until_expiry: parseInt(row.days_until_expiry || 0),
          cost_per_seed: parseFloat(row.cost_per_seed || 0),
          vendor_name: row.vendor_name
        })),
        lot_sources: lotsResult.rows.map(row => ({
          lot_id: row.id,
          lot_number: row.lot_number,
          quantity: parseInt(row.quantity),
          available_quantity: parseInt(row.available_quantity),
          allocated_quantity: parseInt(row.allocated_quantity),
          growth_stage: row.growth_stage,
          current_location: row.current_location,
          expected_ready_date: row.expected_ready_date,
          days_until_ready: parseInt(row.days_until_ready || 0)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching SKU stock details:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch SKU stock details',
    });
  }
}

module.exports = {
  getAllSKUs,
  getSKUById,
  createSKU,
  updateSKU,
  deleteSKU,
  getSKUStockDetails,
};
