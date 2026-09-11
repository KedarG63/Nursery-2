/**
 * Service Order Controller
 * Feature: Service / Grow-Only orders
 * Customers bring their own seeds; the nursery charges a flat service fee to
 * grow them. Tracked separately from product orders (no SKUs/lots/inventory).
 */

const pool = require('../config/database');
const { postSourceCredit, reverseSourceEntries } = require('./expenseController');

const VALID_STATUSES = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];

// Ledger source type for money received against a service order. Deliberately
// distinct from 'customer_payment': the ledgers have a partial unique index on
// (source_type, source_id), and service_order_payments.id must not share a
// namespace with payments.id.
const SOURCE_TYPE = 'service_payment';

// Validate the {payment_source, bank_account_id, cash_account_id} triple.
// Returns an error string, or null when it is well formed. The account is
// always required — money that names no account reaches no ledger.
function validatePaymentTarget({ payment_source, bank_account_id, cash_account_id }) {
  if (!['cash', 'bank'].includes(payment_source)) return 'payment_source must be cash or bank';
  if (payment_source === 'bank' && !bank_account_id) return 'bank_account_id is required when paid into bank';
  if (payment_source === 'cash' && !cash_account_id) return 'cash_account_id is required when paid in cash';
  return null;
}

// Confirm the chosen account exists and is active, so a bad id fails cleanly
// rather than as a foreign-key error mid-transaction.
async function assertAccountUsable(client, { payment_source, bank_account_id, cash_account_id }) {
  if (payment_source === 'bank') {
    const r = await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [bank_account_id]);
    return r.rows.length > 0 ? null : 'Bank account not found or inactive';
  }
  const r = await client.query(`SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [cash_account_id]);
  return r.rows.length > 0 ? null : 'Cash account not found or inactive';
}

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
      advance_payment_source = null,
      advance_bank_account_id = null,
      advance_cash_account_id = null,
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

    // An advance taken at creation must name the account it landed in, or it
    // never reaches the Cash Book / Bank Ledger.
    const advanceTarget = {
      payment_source: advance_payment_source,
      bank_account_id: advance_bank_account_id,
      cash_account_id: advance_cash_account_id,
    };
    if (advance_amount && parseFloat(advance_amount) > 0) {
      const err = validatePaymentTarget(advanceTarget);
      if (err) return res.status(400).json({ success: false, message: `Advance: ${err}` });
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
      const acctErr = await assertAccountUsable(client, advanceTarget);
      if (acctErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Advance: ${acctErr}` });
      }

      const advIns = await client.query(
        `INSERT INTO service_order_payments (
           service_order_id, amount, payment_method, notes, received_by,
           payment_source, bank_account_id, cash_account_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, payment_date`,
        [
          serviceOrder.id, advance_amount, advance_method, 'Advance at creation', userId,
          advance_payment_source,
          advance_payment_source === 'bank' ? advance_bank_account_id : null,
          advance_payment_source === 'cash' ? advance_cash_account_id : null,
        ]
      );

      // Post the matching CREDIT so the money shows up in the balances.
      const custName = await client.query(`SELECT name FROM customers WHERE id = $1`, [customer_id]);
      await postSourceCredit(client, {
        paymentSource: advance_payment_source,
        bankAccountId: advance_payment_source === 'bank' ? advance_bank_account_id : null,
        cashAccountId: advance_payment_source === 'cash' ? advance_cash_account_id : null,
        entryDate: (order_date || new Date().toISOString().split('T')[0]),
        amount: parseFloat(advance_amount),
        partyName: custName.rows[0]?.name || 'Customer',
        narration: `Service order advance ${serviceOrder.service_order_number}`,
        referenceNumber: serviceOrder.service_order_number,
        sourceType: SOURCE_TYPE,
        sourceId: advIns.rows[0].id,
        userId,
      });
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
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      amount, payment_method = 'cash', notes = null,
      payment_source, bank_account_id = null, cash_account_id = null,
    } = req.body;
    const userId = req.user?.id;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'A positive amount is required' });
    }

    // Money received must name the account it landed in, or it reaches no ledger.
    const target = { payment_source, bank_account_id, cash_account_id };
    const targetErr = validatePaymentTarget(target);
    if (targetErr) return res.status(400).json({ success: false, message: targetErr });

    // The payment row and its ledger entry must land together or not at all.
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT so.service_fee, so.paid_amount, so.service_order_number,
              COALESCE(c.name, 'Customer') AS customer_name
       FROM service_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       WHERE so.id = $1 AND so.deleted_at IS NULL
       FOR UPDATE OF so`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    const { service_fee, paid_amount, service_order_number, customer_name } = existing.rows[0];
    const remaining = parseFloat(service_fee) - parseFloat(paid_amount);

    if (parseFloat(amount) > remaining + 0.001) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment exceeds the outstanding balance of ${remaining.toFixed(2)}`,
      });
    }

    const acctErr = await assertAccountUsable(client, target);
    if (acctErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: acctErr });
    }

    // Trigger keeps service_orders.paid_amount in sync
    const payIns = await client.query(
      `INSERT INTO service_order_payments (
         service_order_id, amount, payment_method, notes, received_by,
         payment_source, bank_account_id, cash_account_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, payment_date`,
      [
        id, amount, payment_method, notes, userId,
        payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
      ]
    );

    // Post the matching CREDIT so the money appears in the Cash Book / Bank Ledger.
    await postSourceCredit(client, {
      paymentSource: payment_source,
      bankAccountId: payment_source === 'bank' ? bank_account_id : null,
      cashAccountId: payment_source === 'cash' ? cash_account_id : null,
      entryDate: new Date(payIns.rows[0].payment_date).toISOString().split('T')[0],
      amount: parseFloat(amount),
      partyName: customer_name,
      narration: `Service order payment ${service_order_number}`,
      referenceNumber: service_order_number,
      sourceType: SOURCE_TYPE,
      sourceId: payIns.rows[0].id,
      userId,
    });

    await client.query('COMMIT');

    const updated = await getServiceOrderById(id);
    res.status(201).json({ success: true, message: 'Payment recorded', data: updated });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording service order payment:', error);
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
 * Soft-delete a service order
 * DELETE /api/service-orders/:id
 */
const deleteServiceOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT status FROM service_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    if (existing.rows[0].status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a completed service order',
      });
    }

    // This is a SOFT delete, so ON DELETE CASCADE never fires and the
    // paid_amount trigger never reverses. Any ledger credits posted for this
    // order's payments would otherwise be orphaned, permanently inflating the
    // cash/bank balance. Reverse them explicitly, in the same transaction.
    const payments = await client.query(
      `SELECT id FROM service_order_payments WHERE service_order_id = $1`, [id]
    );
    for (const p of payments.rows) {
      await reverseSourceEntries(client, SOURCE_TYPE, p.id, userId);
    }

    await client.query(
      `UPDATE service_orders SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Service order deleted successfully${payments.rows.length > 0
        ? `; ${payments.rows.length} ledger entr${payments.rows.length === 1 ? 'y' : 'ies'} reversed` : ''}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting service order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service order',
      error: error.message,
    });
  } finally {
    client.release();
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
