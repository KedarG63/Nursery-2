/**
 * Service Order Controller
 * Feature: Service / Grow-Only orders
 * Customers bring their own seeds; the nursery charges a flat service fee to
 * grow them. Tracked separately from product orders (no SKUs/lots/inventory).
 */

const pool = require('../config/database');

const VALID_STATUSES = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];

// Allowed status transitions
const STATUS_TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Create a service order
 * POST /api/service-orders
 */
const createServiceOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id,
      description,
      quantity = null,
      service_fee,
      advance_amount = 0,
      advance_method = 'cash',
      start_date = null,
      expected_ready_date = null,
      notes = null,
      order_date = null,
    } = req.body;

    if (!customer_id || !description || service_fee === undefined || service_fee === null) {
      return res.status(400).json({
        success: false,
        message: 'customer_id, description and service_fee are required',
      });
    }

    if (parseFloat(service_fee) < 0) {
      return res.status(400).json({
        success: false,
        message: 'service_fee cannot be negative',
      });
    }

    if (advance_amount && parseFloat(advance_amount) > parseFloat(service_fee)) {
      return res.status(400).json({
        success: false,
        message: 'Advance amount cannot exceed the service fee',
      });
    }

    const userId = req.user?.id;

    await client.query('BEGIN');

    // Validate customer exists and is active
    const customerResult = await client.query(
      `SELECT id, status FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (customerResult.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Customer status is ${customerResult.rows[0].status}`,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO service_orders (
         customer_id, description, quantity, service_fee, order_date,
         start_date, expected_ready_date, notes, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        customer_id,
        description,
        quantity || null,
        service_fee,
        order_date || new Date().toISOString().split('T')[0],
        start_date || null,
        expected_ready_date || null,
        notes,
        userId,
      ]
    );

    const serviceOrder = orderResult.rows[0];

    // Optional advance payment recorded at creation
    if (advance_amount && parseFloat(advance_amount) > 0) {
      await client.query(
        `INSERT INTO service_order_payments (
           service_order_id, amount, payment_method, notes, received_by
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [serviceOrder.id, advance_amount, advance_method, 'Advance at creation', userId]
      );
    }

    await client.query('COMMIT');

    const complete = await getServiceOrderById(serviceOrder.id);

    res.status(201).json({
      success: true,
      message: 'Service order created successfully',
      data: complete,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating service order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service order',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * List service orders with filters and pagination
 * GET /api/service-orders
 */
const listServiceOrders = async (req, res) => {
  try {
    const {
      customer_id,
      status,
      search,
      page = 1,
      limit = 20,
      sort_by = 'order_date',
      sort_order = 'desc',
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    const whereClauses = ['so.deleted_at IS NULL'];

    if (customer_id) {
      params.push(customer_id);
      whereClauses.push(`so.customer_id = $${params.length}`);
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim().toLowerCase());
      params.push(statuses);
      whereClauses.push(`so.status = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(
        `(so.service_order_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`
      );
    }

    const whereClause = whereClauses.join(' AND ');

    const sortField = ['order_date', 'status', 'service_fee', 'created_at'].includes(sort_by)
      ? sort_by
      : 'order_date';
    const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM service_orders so
      JOIN customers c ON so.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(limit, offset);
    const ordersQuery = `
      SELECT
        so.id, so.service_order_number, so.customer_id, so.description,
        so.quantity, so.service_fee, so.paid_amount, so.balance_amount,
        so.status, so.order_date, so.start_date, so.expected_ready_date,
        c.name as customer_name, c.phone as customer_phone
      FROM service_orders so
      JOIN customers c ON so.customer_id = c.id
      WHERE ${whereClause}
      ORDER BY so.${sortField} ${sortDirection}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const ordersResult = await pool.query(ordersQuery, params);

    res.json({
      success: true,
      data: ordersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing service orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service orders',
      error: error.message,
    });
  }
};

/**
 * Helper: fetch a service order by id with customer + payments
 */
const getServiceOrderById = async (id) => {
  const orderResult = await pool.query(
    `SELECT
       so.*,
       c.name as customer_name, c.email as customer_email,
       c.phone as customer_phone, c.whatsapp_number
     FROM service_orders so
     JOIN customers c ON so.customer_id = c.id
     WHERE so.id = $1 AND so.deleted_at IS NULL`,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const serviceOrder = orderResult.rows[0];

  const paymentsResult = await pool.query(
    `SELECT
       sop.*,
       u.full_name as received_by_name
     FROM service_order_payments sop
     LEFT JOIN users u ON sop.received_by = u.id
     WHERE sop.service_order_id = $1
     ORDER BY sop.payment_date DESC`,
    [id]
  );

  serviceOrder.payments = paymentsResult.rows;

  return serviceOrder;
};

/**
 * Get a single service order
 * GET /api/service-orders/:id
 */
const getServiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceOrder = await getServiceOrderById(id);

    if (!serviceOrder) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    res.json({ success: true, data: serviceOrder });
  } catch (error) {
    console.error('Error fetching service order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service order',
      error: error.message,
    });
  }
};

/**
 * Update service order details
 * PUT /api/service-orders/:id
 */
const updateServiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const {
      description,
      quantity,
      service_fee,
      start_date,
      expected_ready_date,
      notes,
    } = req.body;

    const existing = await pool.query(
      `SELECT id, paid_amount FROM service_orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    if (
      service_fee !== undefined &&
      parseFloat(service_fee) < parseFloat(existing.rows[0].paid_amount)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Service fee cannot be less than the amount already paid',
      });
    }

    const fields = [];
    const params = [];
    let i = 1;

    const setField = (col, val) => {
      fields.push(`${col} = $${i}`);
      params.push(val);
      i++;
    };

    if (description !== undefined) setField('description', description);
    if (quantity !== undefined) setField('quantity', quantity || null);
    if (service_fee !== undefined) setField('service_fee', service_fee);
    if (start_date !== undefined) setField('start_date', start_date || null);
    if (expected_ready_date !== undefined)
      setField('expected_ready_date', expected_ready_date || null);
    if (notes !== undefined) setField('notes', notes);

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    setField('updated_by', userId);

    params.push(id);
    await pool.query(
      `UPDATE service_orders SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
      params
    );

    const updated = await getServiceOrderById(id);
    res.json({ success: true, message: 'Service order updated', data: updated });
  } catch (error) {
    console.error('Error updating service order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service order',
      error: error.message,
    });
  }
};

/**
 * Update service order status
 * PUT /api/service-orders/:id/status
 */
const updateServiceOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    const existing = await pool.query(
      `SELECT status FROM service_orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    const currentStatus = existing.rows[0].status;

    if (currentStatus === status) {
      return res.status(400).json({ success: false, message: `Already ${status}` });
    }

    if (!STATUS_TRANSITIONS[currentStatus].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${currentStatus} to ${status}`,
      });
    }

    await pool.query(
      `UPDATE service_orders SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [status, userId, id]
    );

    const updated = await getServiceOrderById(id);
    res.json({ success: true, message: 'Status updated', data: updated });
  } catch (error) {
    console.error('Error updating service order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message,
    });
  }
};

/**
 * Record a payment against a service order
 * POST /api/service-orders/:id/payments
 */
const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_method = 'cash', notes = null } = req.body;
    const userId = req.user?.id;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'A positive amount is required' });
    }

    const existing = await pool.query(
      `SELECT service_fee, paid_amount FROM service_orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    const { service_fee, paid_amount } = existing.rows[0];
    const remaining = parseFloat(service_fee) - parseFloat(paid_amount);

    if (parseFloat(amount) > remaining + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Payment exceeds the outstanding balance of ${remaining.toFixed(2)}`,
      });
    }

    // Trigger keeps service_orders.paid_amount in sync
    await pool.query(
      `INSERT INTO service_order_payments (
         service_order_id, amount, payment_method, notes, received_by
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [id, amount, payment_method, notes, userId]
    );

    const updated = await getServiceOrderById(id);
    res.status(201).json({ success: true, message: 'Payment recorded', data: updated });
  } catch (error) {
    console.error('Error recording service order payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
};

/**
 * Soft-delete a service order
 * DELETE /api/service-orders/:id
 */
const deleteServiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await pool.query(
      `SELECT status FROM service_orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    if (existing.rows[0].status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a completed service order',
      });
    }

    await pool.query(
      `UPDATE service_orders SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: 'Service order deleted successfully' });
  } catch (error) {
    console.error('Error deleting service order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service order',
      error: error.message,
    });
  }
};

module.exports = {
  createServiceOrder,
  listServiceOrders,
  getServiceOrder,
  updateServiceOrder,
  updateServiceOrderStatus,
  recordPayment,
  deleteServiceOrder,
};
