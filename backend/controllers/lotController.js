/**
 * Lot Controller
 * Issues #15, #16, #17: Lot management with QR codes and scanning
 */

const pool = require('../config/database');
const { generateQRCode } = require('../utils/qrCodeGenerator');
const { extractLotNumber } = require('../utils/qrCodeGenerator');
const { checkAndAllocateSeed, recordSeedUsage, getLotLineage } = require('../services/traceabilityService');

// Growth stage transition rules
const STAGE_TRANSITIONS = {
  seed: ['germination'],
  germination: ['seedling', 'seed'], // Can go back if failed
  seedling: ['transplant', 'germination'],
  transplant: ['ready', 'seedling'],
  ready: ['sold', 'transplant'],
  sold: [], // Terminal stage
};

// In-memory cache for scan endpoint (consider Redis for production)
const scanCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Create a new lot with QR code
 * POST /api/lots
 * Phase 22 Enhanced: Now checks seed availability and allocates seeds
 */
const createLot = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      sku_id,
      quantity = 1000,
      growth_stage = 'seed',
      current_location = 'greenhouse',
      planted_date,
      notes,
      seed_purchase_id = null,   // User-selected seed purchase (overrides auto-allocation)
      skip_seed_check = false,   // Allow skipping for backward compatibility
    } = req.body;

    const userId = req.user.id;

    await client.query('BEGIN');

    // Get SKU and Product details for QR code and growth period
    const skuResult = await client.query(
      `SELECT s.sku_code, s.variety, s.product_id, p.growth_period_days, p.name as product_name
       FROM skus s
       JOIN products p ON s.product_id = p.id
       WHERE s.id = $1 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [sku_id]
    );

    if (skuResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'SKU not found',
      });
    }

    const { sku_code, variety, product_id, growth_period_days = 120, product_name } = skuResult.rows[0];

    // Resolve seed allocation — user-selected purchase takes priority over auto-allocation
    let seedAllocation = null;

    if (seed_purchase_id) {
      // Load the specific purchase the user chose
      const purchaseResult = await client.query(
        `SELECT sp.*, v.vendor_name
         FROM seed_purchases sp
         JOIN vendors v ON v.id = sp.vendor_id
         WHERE sp.id = $1 AND sp.deleted_at IS NULL`,
        [seed_purchase_id]
      );

      if (purchaseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Selected seed purchase not found' });
      }

      const purchase = purchaseResult.rows[0];
      if (purchase.seeds_remaining < quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Selected purchase only has ${purchase.seeds_remaining} seeds remaining, but ${quantity} are needed`,
        });
      }

      seedAllocation = {
        available: true,
        seeds_allocated: quantity,
        cost_per_seed: purchase.total_seeds > 0 ? (purchase.grand_total / purchase.total_seeds) : null,
        seedPurchase: purchase,
      };
    } else if (!skip_seed_check) {
      // Auto-allocate from best available purchase
      seedAllocation = await checkAndAllocateSeed(product_id, sku_id, quantity, client);

      if (!seedAllocation.available) {
        console.warn(`Seed allocation skipped for lot: ${seedAllocation.message}. product_id=${product_id}, sku_id=${sku_id}, quantity=${quantity}`);
        seedAllocation = null;
      }
    }

    // Generate lot number:
    // With seed lot: {seed_lot_number}-001, -002, ... (per vendor seed lot)
    // Without seed:  LOT-YYYYMMDD-XXXX (fallback)
    let lot_number;
    const seedLotNumber = seedAllocation ? seedAllocation.seedPurchase.seed_lot_number : null;
    if (seedLotNumber) {
      const countResult = await client.query(
        'SELECT COUNT(*) FROM lots WHERE lot_number LIKE $1',
        [`${seedLotNumber}-%`]
      );
      const sequence = String(parseInt(countResult.rows[0].count) + 1).padStart(3, '0');
      lot_number = `${seedLotNumber}-${sequence}`;
    } else {
      // Use planted_date for the date part so past-dated lots are numbered correctly
      const refDate = planted_date ? new Date(planted_date) : new Date();
      const dateStr = refDate.toISOString().split('T')[0].replace(/-/g, '');
      const countResult = await client.query(
        'SELECT COUNT(*) FROM lots WHERE lot_number LIKE $1',
        [`LOT-${dateStr}-%`]
      );
      const sequence = String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');
      lot_number = `LOT-${dateStr}-${sequence}`;
    }

    // Calculate expected ready date using product's growth period (needed for QR)
    const planted_dt = planted_date ? new Date(planted_date) : new Date();
    const expected_ready_dt = new Date(planted_dt);
    expected_ready_dt.setDate(expected_ready_dt.getDate() + growth_period_days);

    // Generate QR code with seed traceability
    const { qr_code, qr_code_url } = await generateQRCode({
      lot_number,
      sku_code,
      variety,
      product_name,
      planted_date: planted_dt.toISOString(),
      expected_ready_date: expected_ready_dt.toISOString(),
      seed_lot_number: seedAllocation ? seedAllocation.seedPurchase.seed_lot_number : null,
      vendor_name: seedAllocation ? seedAllocation.seedPurchase.vendor_name : null,
      seed_expiry_date: seedAllocation ? seedAllocation.seedPurchase.expiry_date : null,
    });

    const expected_ready_date = expected_ready_dt;

    // Insert lot with seed traceability data (Phase 22 enhanced)
    const insertResult = await client.query(
      `INSERT INTO lots (
        lot_number, sku_id, quantity, growth_stage, qr_code, qr_code_url,
        current_location, planted_date, expected_ready_date, notes,
        seed_purchase_id, seeds_used_count, seed_cost_per_unit,
        created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
      RETURNING *`,
      [
        lot_number,
        sku_id,
        quantity,
        growth_stage,
        qr_code,
        qr_code_url,
        current_location,
        planted_date,
        expected_ready_date,
        notes,
        seedAllocation ? seedAllocation.seedPurchase.id : null,
        seedAllocation ? seedAllocation.seeds_allocated : 0,
        seedAllocation ? seedAllocation.cost_per_seed : null,
        userId,
      ]
    );

    const lotId = insertResult.rows[0].id;

    // Phase 22: Record seed usage in history
    if (seedAllocation && seedAllocation.available) {
      await recordSeedUsage(
        seedAllocation.seedPurchase.id,
        lotId,
        seedAllocation.seeds_allocated,
        seedAllocation.cost_per_seed,
        userId,
        client,
        `Allocated for lot ${lot_number}`
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        ...insertResult.rows[0],
        seed_allocation: seedAllocation
          ? {
              vendor: seedAllocation.seedPurchase.vendor_name,
              seed_lot: seedAllocation.seedPurchase.seed_lot_number,
              seeds_allocated: seedAllocation.seeds_allocated,
              cost_per_seed: seedAllocation.cost_per_seed,
              total_seed_cost: seedAllocation.total_seed_cost,
            }
          : null,
      },
      message: 'Lot created successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create Lot Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create lot',
    });
  } finally {
    client.release();
  }
};

/**
 * List lots with filters and pagination
 * GET /api/lots
 */
const listLots = async (req, res) => {
  try {
    const {
      sku_id,
      growth_stage,
      stage,
      current_location,
      location,
      from_date,
      to_date,
      ready_date_from,
      ready_date_to,
      search,
      overdue,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    // Build WHERE clause
    const conditions = ['l.deleted_at IS NULL'];
    const params = [];
    let paramCount = 1;

    if (sku_id) {
      conditions.push(`l.sku_id = $${paramCount++}`);
      params.push(sku_id);
    }

    // Handle both growth_stage and stage parameters (frontend sends stage)
    const stageParam = growth_stage || stage;
    if (stageParam) {
      // Handle comma-separated stages for multi-select
      const stages = stageParam.split(',').map(s => s.trim()).filter(s => s);
      if (stages.length > 0) {
        conditions.push(`l.growth_stage = ANY($${paramCount++})`);
        params.push(stages);
      }
    }

    // Handle both current_location and location parameters (frontend sends location)
    const locationParam = current_location || location;
    if (locationParam) {
      conditions.push(`l.current_location = $${paramCount++}`);
      params.push(locationParam);
    }

    if (from_date) {
      conditions.push(`l.planted_date >= $${paramCount++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`l.planted_date <= $${paramCount++}`);
      params.push(to_date);
    }

    if (ready_date_from) {
      conditions.push(`l.expected_ready_date >= $${paramCount++}`);
      params.push(ready_date_from);
    }

    if (ready_date_to) {
      conditions.push(`l.expected_ready_date <= $${paramCount++}`);
      params.push(ready_date_to);
    }

    if (search) {
      conditions.push(`l.lot_number ILIKE $${paramCount++}`);
      params.push(`%${search}%`);
    }

    // Handle overdue filter
    if (overdue === 'true' || overdue === true) {
      conditions.push(`l.expected_ready_date < NOW()::date AND l.growth_stage != 'sold'`);
    }

    // available_only: only lots that can be allocated (not sold, has stock)
    const { available_only } = req.query;
    if (available_only === 'true') {
      conditions.push(`l.growth_stage != 'sold' AND l.available_quantity > 0`);
    }

    const whereClause = conditions.join(' AND ');

    // Validate sort parameters
    const validSortFields = [
      'created_at',
      'lot_number',
      'growth_stage',
      'expected_ready_date',
      'planted_date',
    ];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM lots l WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Fetch lots with optional seed traceability (Phase 22)
    // Using subqueries instead of LEFT JOIN to avoid errors if tables don't exist
    const lotsResult = await pool.query(
      `SELECT
        l.*,
        s.sku_code,
        s.variety,
        s.product_id,
        p.name as product_name,
        u1.full_name as created_by_name,
        u2.full_name as updated_by_name,
        (
          SELECT sp.seed_lot_number
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_lot_number,
        (
          SELECT v.vendor_name
          FROM seed_purchases sp
          JOIN vendors v ON sp.vendor_id = v.id
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
            AND v.deleted_at IS NULL
          LIMIT 1
        ) as seed_vendor_name,
        (
          SELECT sp.expiry_date
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_expiry_date,
        (
          SELECT sp.purchase_date
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_purchase_date,
        (l.quantity - COALESCE(l.allocated_quantity, 0)) as available_quantity
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN users u1 ON l.created_by = u1.id
       LEFT JOIN users u2 ON l.updated_by = u2.id
       WHERE ${whereClause}
       ORDER BY l.${sortField} ${sortDirection}
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      [...params, limitNum, offset]
    ).catch(err => {
      // If error is due to missing tables, fall back to query without seed traceability
      if (err.message.includes('relation') && (err.message.includes('seed_purchases') || err.message.includes('vendors'))) {
        console.warn('Seed purchases tables not yet migrated, fetching lots without seed traceability');
        return pool.query(
          `SELECT
            l.*,
            s.sku_code,
            s.variety,
            s.product_id,
            p.name as product_name,
            u1.full_name as created_by_name,
            u2.full_name as updated_by_name,
            NULL as seed_lot_number,
            NULL as seed_vendor_name,
            NULL as seed_expiry_date,
            NULL as seed_purchase_date,
            (l.quantity - COALESCE(l.allocated_quantity, 0)) as available_quantity
           FROM lots l
           JOIN skus s ON l.sku_id = s.id
           JOIN products p ON s.product_id = p.id
           LEFT JOIN users u1 ON l.created_by = u1.id
           LEFT JOIN users u2 ON l.updated_by = u2.id
           WHERE ${whereClause}
           ORDER BY l.${sortField} ${sortDirection}
           LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
          [...params, limitNum, offset]
        );
      }
      throw err;
    });

    res.json({
      success: true,
      data: lotsResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List Lots Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lots',
    });
  }
};

/**
 * Get lot details with movement history
 * GET /api/lots/:id
 */
const getLotDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Get lot details with optional seed traceability (Phase 22)
    // Using subqueries to avoid errors if tables don't exist
    const lotResult = await pool.query(
      `SELECT
        l.*,
        s.sku_code,
        s.variety,
        s.product_id,
        p.name as product_name,
        p.description as product_description,
        u1.full_name as created_by_name,
        u2.full_name as updated_by_name,
        (
          SELECT sp.seed_lot_number
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_lot_number,
        (
          SELECT v.vendor_name
          FROM seed_purchases sp
          JOIN vendors v ON sp.vendor_id = v.id
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
            AND v.deleted_at IS NULL
          LIMIT 1
        ) as seed_vendor_name,
        (
          SELECT sp.expiry_date
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_expiry_date,
        (
          SELECT sp.purchase_date
          FROM seed_purchases sp
          WHERE sp.id = l.seed_purchase_id
            AND sp.deleted_at IS NULL
          LIMIT 1
        ) as seed_purchase_date,
        (l.quantity - COALESCE(l.allocated_quantity, 0)) as available_quantity
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN users u1 ON l.created_by = u1.id
       LEFT JOIN users u2 ON l.updated_by = u2.id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    ).catch(err => {
      // If error is due to missing tables, fall back to query without seed traceability
      if (err.message.includes('relation') && (err.message.includes('seed_purchases') || err.message.includes('vendors'))) {
        console.warn('Seed purchases tables not yet migrated, fetching lot details without seed traceability');
        return pool.query(
          `SELECT
            l.*,
            s.sku_code,
            s.variety,
            s.product_id,
            p.name as product_name,
            p.description as product_description,
            u1.full_name as created_by_name,
            u2.full_name as updated_by_name,
            NULL as seed_lot_number,
            NULL as seed_vendor_name,
            NULL as seed_expiry_date,
            NULL as seed_purchase_date,
            (l.quantity - COALESCE(l.allocated_quantity, 0)) as available_quantity
           FROM lots l
           JOIN skus s ON l.sku_id = s.id
           JOIN products p ON s.product_id = p.id
           LEFT JOIN users u1 ON l.created_by = u1.id
           LEFT JOIN users u2 ON l.updated_by = u2.id
           WHERE l.id = $1 AND l.deleted_at IS NULL`,
          [id]
        );
      }
      throw err;
    });

    if (lotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found',
      });
    }

    // Get movement history
    const movementsResult = await pool.query(
      `SELECT
        lm.*,
        u.full_name as moved_by_name
       FROM lot_movements lm
       LEFT JOIN users u ON lm.moved_by = u.id
       WHERE lm.lot_id = $1
       ORDER BY lm.moved_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        lot: lotResult.rows[0],
        movements: movementsResult.rows,
      },
    });
  } catch (error) {
    console.error('Get Lot Details Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot details',
    });
  }
};

/**
 * Update lot growth stage
 * PUT /api/lots/:id/stage
 */
const updateLotStage = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { new_stage, reason } = req.body;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Get current lot
    const lotResult = await client.query(
      'SELECT * FROM lots WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (lotResult.rows.length === 0) {
      throw new Error('Lot not found');
    }

    const lot = lotResult.rows[0];
    const current_stage = lot.growth_stage;

    // Validate stage transition
    if (!STAGE_TRANSITIONS[current_stage].includes(new_stage)) {
      throw new Error(
        `Invalid stage transition from ${current_stage} to ${new_stage}. ` +
          `Valid transitions: ${STAGE_TRANSITIONS[current_stage].join(', ') || 'none'}`
      );
    }

    // Update lot stage
    const updateResult = await client.query(
      `UPDATE lots
       SET growth_stage = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [new_stage, userId, id]
    );

    // Create movement record
    await client.query(
      `INSERT INTO lot_movements (
        lot_id, from_stage, to_stage, stage_changed,
        moved_by, reason, from_location, to_location
      ) VALUES ($1, $2, $3, true, $4, $5, $6, $6)`,
      [id, current_stage, new_stage, userId, reason, lot.current_location]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: `Stage updated from ${current_stage} to ${new_stage}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update Stage Error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update stage',
    });
  } finally {
    client.release();
  }
};

/**
 * Update lot location
 * PUT /api/lots/:id/location
 */
const updateLotLocation = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { new_location, reason, gps_latitude, gps_longitude } = req.body;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Get current lot
    const lotResult = await client.query(
      'SELECT * FROM lots WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (lotResult.rows.length === 0) {
      throw new Error('Lot not found');
    }

    const lot = lotResult.rows[0];
    const current_location = lot.current_location;

    if (current_location === new_location) {
      throw new Error('New location must be different from current location');
    }

    // Update lot location
    const updateResult = await client.query(
      `UPDATE lots
       SET current_location = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [new_location, userId, id]
    );

    // Create movement record
    await client.query(
      `INSERT INTO lot_movements (
        lot_id, from_location, to_location, from_stage, to_stage,
        stage_changed, moved_by, reason, gps_latitude, gps_longitude
      ) VALUES ($1, $2, $3, $4, $4, false, $5, $6, $7, $8)`,
      [id, current_location, new_location, lot.growth_stage, userId, reason, gps_latitude, gps_longitude]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: `Location updated from ${current_location} to ${new_location}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update Location Error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update location',
    });
  } finally {
    client.release();
  }
};

/**
 * Regenerate QR code for a lot
 * PUT /api/lots/:id/regenerate-qr
 */
const regenerateQRCode = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    // Get lot details
    const lotResult = await client.query(
      `SELECT l.*, s.sku_code, s.variety, p.name AS product_name,
              sp.seed_lot_number, v.vendor_name, sp.expiry_date AS seed_expiry_date
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN seed_purchases sp ON sp.id = l.seed_purchase_id
       LEFT JOIN vendors v ON v.id = sp.vendor_id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );

    if (lotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found',
      });
    }

    const lot = lotResult.rows[0];

    // Generate new QR code
    const { qr_code, qr_code_url } = await generateQRCode({
      lot_number: lot.lot_number,
      sku_code: lot.sku_code,
      variety: lot.variety,
      product_name: lot.product_name,
      planted_date: lot.planted_date,
      expected_ready_date: lot.expected_ready_date,
      seed_lot_number: lot.seed_lot_number,
      vendor_name: lot.vendor_name,
      seed_expiry_date: lot.seed_expiry_date,
    });

    // Update lot
    const updateResult = await client.query(
      `UPDATE lots
       SET qr_code = $1, qr_code_url = $2, updated_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [qr_code, qr_code_url, req.user.id, id]
    );

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'QR code regenerated successfully',
    });
  } catch (error) {
    console.error('Regenerate QR Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate QR code',
    });
  } finally {
    client.release();
  }
};

/**
 * Download QR code
 * GET /api/lots/:id/qr
 */
const downloadQRCode = async (req, res) => {
  try {
    const { id } = req.params;

    const lotResult = await pool.query(
      `SELECT l.lot_number, l.qr_code_url, l.planted_date, l.expected_ready_date,
              s.sku_code, s.variety, p.name AS product_name,
              sp.seed_lot_number, v.vendor_name, sp.expiry_date AS seed_expiry_date
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN seed_purchases sp ON sp.id = l.seed_purchase_id
       LEFT JOIN vendors v ON v.id = sp.vendor_id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );

    if (lotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found',
      });
    }

    const lot = lotResult.rows[0];

    // Always regenerate from current DB data so the QR reflects the latest lot info
    const { generateQRData } = require('../utils/qrCodeGenerator');
    const QRCode = require('qrcode');
    const qrData = generateQRData({
      lot_number: lot.lot_number,
      sku_code: lot.sku_code,
      variety: lot.variety,
      product_name: lot.product_name,
      planted_date: lot.planted_date,
      expected_ready_date: lot.expected_ready_date,
      seed_lot_number: lot.seed_lot_number,
      vendor_name: lot.vendor_name,
      seed_expiry_date: lot.seed_expiry_date,
    });

    // Generate QR code as PNG buffer
    const qrCodeBuffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 400,
      margin: 3,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Send as PNG image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="lot-${lot.lot_number}-qr.png"`);
    res.send(qrCodeBuffer);
  } catch (error) {
    console.error('Download QR Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download QR code',
    });
  }
};

/**
 * Soft delete lot
 * DELETE /api/lots/:id
 */
const deleteLot = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if lot has allocated quantity
    const lotResult = await pool.query(
      'SELECT allocated_quantity, seed_purchase_id, seeds_used_count FROM lots WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (lotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found',
      });
    }

    // COALESCE guards against NULL allocated_quantity (older lots before column existed)
    if (parseInt(lotResult.rows[0].allocated_quantity || 0) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete lot with allocated quantity',
      });
    }

    const lot = lotResult.rows[0];

    // Use a transaction so seed restoration and deletion are atomic
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Soft delete the lot
      await client.query(
        `UPDATE lots SET deleted_at = NOW(), deleted_by = $1, updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [userId, id]
      );

      // Restore seeds to the seed purchase if linked
      const seedsToRestore = parseInt(lot.seeds_used_count || 0);
      if (lot.seed_purchase_id && seedsToRestore > 0) {
        await client.query(
          `UPDATE seed_purchases
           SET seeds_used      = GREATEST(0, COALESCE(seeds_used, 0) - $1),
               seeds_remaining = COALESCE(seeds_remaining, 0) + $1,
               inventory_status = CASE
                 WHEN (COALESCE(seeds_remaining, 0) + $1) <= 0 THEN 'exhausted'::seed_inventory_status_enum
                 WHEN (COALESCE(seeds_remaining, 0) + $1)::DECIMAL / NULLIF(total_seeds, 0) < 0.1 THEN 'low_stock'::seed_inventory_status_enum
                 ELSE 'available'::seed_inventory_status_enum
               END,
               updated_at = NOW()
           WHERE id = $2 AND deleted_at IS NULL`,
          [seedsToRestore, lot.seed_purchase_id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: 'Lot deleted successfully',
    });
  } catch (error) {
    console.error('Delete Lot Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete lot',
    });
  }
};

/**
 * Scan lot by QR code (optimized for mobile)
 * POST /api/lots/scan
 * Issue #17
 */
const scanLot = async (req, res) => {
  const startTime = Date.now();

  try {
    const { qr_data, lot_number, scan_method = 'qr_camera', device_info, gps_latitude, gps_longitude } =
      req.body;

    const userId = req.user.id;

    // Determine lot_number from QR data or direct input
    let lotNumber;

    if (qr_data) {
      lotNumber = extractLotNumber(qr_data);
    } else if (lot_number) {
      lotNumber = lot_number;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either qr_data or lot_number is required',
      });
    }

    // Check cache first
    const cacheKey = `lot:${lotNumber}`;
    if (scanCache.has(cacheKey)) {
      const cached = scanCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        // Log scan event asynchronously
        setImmediate(() => logScanEvent(cached.data.lot.id, userId, scan_method, device_info, gps_latitude, gps_longitude));

        const responseTime = Date.now() - startTime;
        return res.json({
          ...cached.data,
          response_time_ms: responseTime,
          cached: true,
        });
      } else {
        scanCache.delete(cacheKey);
      }
    }

    // Fetch lot from database
    const lotResult = await pool.query(
      `SELECT
        l.id,
        l.lot_number,
        l.growth_stage,
        l.current_location,
        l.quantity,
        l.allocated_quantity,
        l.available_quantity,
        l.expected_ready_date,
        l.planted_date,
        s.sku_code,
        s.id as sku_id,
        p.name as product_name,
        p.id as product_id
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE l.lot_number = $1 AND l.deleted_at IS NULL`,
      [lotNumber]
    );

    if (lotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found',
        response_time_ms: Date.now() - startTime,
      });
    }

    const lot = lotResult.rows[0];

    // Get next valid stages for quick actions
    const nextStages = STAGE_TRANSITIONS[lot.growth_stage] || [];

    // Prepare response data
    const responseData = {
      success: true,
      data: {
        lot: {
          id: lot.id,
          lot_number: lot.lot_number,
          growth_stage: lot.growth_stage,
          current_location: lot.current_location,
          quantity: lot.quantity,
          allocated_quantity: lot.allocated_quantity,
          available_quantity: lot.available_quantity,
          expected_ready_date: lot.expected_ready_date,
          planted_date: lot.planted_date,
        },
        product: {
          id: lot.product_id,
          name: lot.product_name,
          sku_id: lot.sku_id,
          sku_code: lot.sku_code,
        },
        quick_actions: {
          next_stages: nextStages.map((stage) => ({
            value: stage,
            label: stage.charAt(0).toUpperCase() + stage.slice(1),
          })),
          locations: ['greenhouse', 'field', 'warehouse', 'transit']
            .filter((loc) => loc !== lot.current_location)
            .map((loc) => ({
              value: loc,
              label: loc.charAt(0).toUpperCase() + loc.slice(1),
            })),
        },
      },
    };

    // Cache the response
    scanCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
    });

    // Log scan event asynchronously
    setImmediate(() => logScanEvent(lot.id, userId, scan_method, device_info, gps_latitude, gps_longitude));

    const responseTime = Date.now() - startTime;
    res.json({
      ...responseData,
      response_time_ms: responseTime,
      cached: false,
    });
  } catch (error) {
    console.error('Scan Lot Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan lot',
      response_time_ms: Date.now() - startTime,
    });
  }
};

/**
 * Log scan event (async, non-blocking)
 */
const logScanEvent = async (lotId, scannedBy, scanMethod, deviceInfo, gpsLat, gpsLon) => {
  try {
    await pool.query(
      `INSERT INTO scan_logs (
        lot_id, scanned_by, scan_method, device_info,
        gps_latitude, gps_longitude, action_taken
      ) VALUES ($1, $2, $3, $4, $5, $6, 'view')`,
      [lotId, scannedBy, scanMethod, deviceInfo ? JSON.stringify(deviceInfo) : null, gpsLat, gpsLon]
    );
  } catch (error) {
    console.error('Log Scan Event Error:', error);
    // Don't throw - this is a background task
  }
};

/**
 * Get scan statistics for a lot
 * GET /api/lots/:id/scan-stats
 */
const getLotScanStats = async (req, res) => {
  try {
    const { id } = req.params;

    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_scans,
        COUNT(DISTINCT scanned_by) as unique_scanners,
        MAX(scanned_at) as last_scanned,
        MIN(scanned_at) as first_scanned,
        COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '24 hours') as scans_last_24h,
        COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '7 days') as scans_last_7d
       FROM scan_logs
       WHERE lot_id = $1`,
      [id]
    );

    const recentScansResult = await pool.query(
      `SELECT
        sl.scanned_at,
        sl.scan_method,
        sl.action_taken,
        u.full_name as scanned_by_name
       FROM scan_logs sl
       LEFT JOIN users u ON sl.scanned_by = u.id
       WHERE sl.lot_id = $1
       ORDER BY sl.scanned_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        stats: statsResult.rows[0],
        recent_scans: recentScansResult.rows,
      },
    });
  } catch (error) {
    console.error('Get Scan Stats Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scan statistics',
    });
  }
};

/**
 * Get lot growth status with timeline
 * GET /api/lots/:id/growth-status
 * Phase 21 - Part 1
 */
const getLotGrowthStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        l.*,
        p.growth_period_days,
        p.name as product_name,
        s.sku_code,
        s.id as sku_id,
        EXTRACT(DAY FROM (NOW() - l.planted_date)) as days_since_planted,
        EXTRACT(DAY FROM (l.expected_ready_date - NOW())) as days_until_ready,
        CASE
          WHEN NOW() < l.planted_date + INTERVAL '7 days' THEN 'seed'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.3)::int * INTERVAL '1 day' THEN 'germination'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.6)::int * INTERVAL '1 day' THEN 'seedling'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.9)::int * INTERVAL '1 day' THEN 'transplant'
          WHEN NOW() >= l.expected_ready_date THEN 'ready'
          ELSE 'growing'
        END as calculated_stage,
        ROUND((EXTRACT(DAY FROM (NOW() - l.planted_date))::float / NULLIF(p.growth_period_days, 0)) * 100, 2) as growth_percentage
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found'
      });
    }

    const lot = result.rows[0];

    res.json({
      success: true,
      data: {
        lotId: lot.id,
        lotNumber: lot.lot_number,
        productName: lot.product_name,
        skuCode: lot.sku_code,
        skuId: lot.sku_id,
        currentStage: lot.growth_stage,
        calculatedStage: lot.calculated_stage,
        plantedDate: lot.planted_date,
        expectedReadyDate: lot.expected_ready_date,
        daysSincePlanted: parseInt(lot.days_since_planted || 0),
        daysUntilReady: parseInt(lot.days_until_ready || 0),
        growthPercentage: parseFloat(lot.growth_percentage || 0),
        growthPeriodDays: parseInt(lot.growth_period_days),
        quantity: parseInt(lot.quantity),
        allocatedQuantity: parseInt(lot.allocated_quantity),
        availableQuantity: parseInt(lot.available_quantity),
        currentLocation: lot.current_location,
        isReady: lot.growth_stage === 'ready' || new Date() >= new Date(lot.expected_ready_date),
        isOverdue: lot.growth_stage !== 'ready' && new Date() >= new Date(lot.expected_ready_date)
      }
    });
  } catch (error) {
    console.error('Get lot growth status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot growth status',
      message: error.message
    });
  }
};

/**
 * Get lot seed lineage - trace back to seed purchase
 * GET /api/lots/:id/seed-lineage
 * Phase 22: New endpoint
 */
const getLotSeedLineage = async (req, res) => {
  try {
    const { id } = req.params;

    const lineage = await getLotLineage(id);

    if (!lineage) {
      return res.status(404).json({
        success: false,
        message: 'Lot not found',
      });
    }

    res.json({
      success: true,
      data: lineage,
    });
  } catch (error) {
    console.error('Get lot lineage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot lineage',
      message: error.message,
    });
  }
};

/**
 * Get lots created from a specific seed purchase
 * GET /api/lots/by-purchase/:purchaseId
 * Workflow enhancement - Shows usage history for seed purchases
 */
const getLotsByPurchase = async (req, res) => {
  try {
    const { purchaseId } = req.params;

    const result = await pool.query(
      `SELECT
        l.id,
        l.lot_number,
        l.quantity,
        l.growth_stage,
        l.current_location,
        l.planted_date,
        l.expected_ready_date,
        l.allocated_quantity,
        l.available_quantity,
        suh.seeds_allocated as seeds_used_count,
        suh.seed_cost_per_unit,
        suh.total_seed_cost,
        suh.created_at as usage_date,
        s.sku_code,
        p.name as product_name
       FROM lots l
       LEFT JOIN seed_usage_history suh ON l.id = suh.lot_id
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE suh.seed_purchase_id = $1
       AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC`,
      [purchaseId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get lots by purchase error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lots by purchase',
      message: error.message,
    });
  }
};

module.exports = {
  createLot,
  listLots,
  getLotDetails,
  updateLotStage,
  updateLotLocation,
  regenerateQRCode,
  downloadQRCode,
  deleteLot,
  scanLot,
  getLotScanStats,
  getLotGrowthStatus,
  getLotSeedLineage, // Phase 22
  getLotsByPurchase, // Workflow enhancement
};
