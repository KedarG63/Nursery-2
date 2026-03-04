/**
 * Payment Controller
 * Handles all payment-related operations
 */

const pool = require('../config/database');
const PaymentGateway = require('../services/payments');
const notificationEvents = require('../events/notificationEvents');

/**
 * Get all payments with filters
 * GET /api/payments
 */
const getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      payment_method,
      status,
      start_date,
      end_date,
      search,
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    const conditions = ['p.deleted_at IS NULL'];
    let paramCount = 0;

    // Filter by payment method
    if (payment_method) {
      paramCount++;
      conditions.push(`p.payment_method = $${paramCount}`);
      params.push(payment_method);
    }

    // Filter by status
    if (status) {
      paramCount++;
      conditions.push(`p.status = $${paramCount}`);
      params.push(status);
    }

    // Filter by date range
    if (start_date) {
      paramCount++;
      conditions.push(`p.payment_date >= $${paramCount}`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      conditions.push(`p.payment_date <= $${paramCount}`);
      params.push(end_date);
    }

    // Search by order number or transaction ID
    if (search) {
      paramCount++;
      conditions.push(`(
        o.order_number ILIKE $${paramCount} OR
        p.transaction_id ILIKE $${paramCount} OR
        p.gateway_transaction_id ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get payments with pagination
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const query = `
      SELECT
        p.*,
        o.order_number,
        c.name as customer_name,
        c.phone as customer_phone,
        u.full_name as created_by_name
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE ${whereClause}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    params.push(parseInt(limit), offset);
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message,
    });
  }
};

/**
 * Initiate online payment
 * POST /api/payments/initiate
 */
const initiatePayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const { order_id, amount, payment_method = 'upi' } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // Fetch order details
    const orderResult = await client.query(
      `SELECT id, customer_id, total_amount, paid_amount, balance_amount, status
       FROM orders
       WHERE id = $1 AND deleted_at IS NULL`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const order = orderResult.rows[0];

    // Validate payment amount
    if (amount > order.balance_amount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed balance amount (₹${order.balance_amount})`,
      });
    }

    // Get payment provider
    const paymentProvider = PaymentGateway.getPaymentProvider();
    const providerName = PaymentGateway.getProviderName();

    // Create payment order with gateway
    const gatewayOrder = await paymentProvider.createPaymentOrder({
      orderId: order_id,
      amount,
      currency: 'INR',
      customerId: order.customer_id,
    });

    if (!gatewayOrder.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: gatewayOrder.error,
      });
    }

    // Create payment record in database
    const paymentResult = await client.query(
      `INSERT INTO payments (
         order_id, customer_id, payment_method, payment_gateway,
         amount, gateway_order_id, status, gateway_response, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        order_id,
        order.customer_id,
        payment_method,
        providerName,
        amount,
        gatewayOrder.gatewayOrderId,
        'pending',
        JSON.stringify(gatewayOrder.metadata),
        userId,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        payment: paymentResult.rows[0],
        gateway: {
          provider: providerName,
          orderId: gatewayOrder.gatewayOrderId,
          amount: gatewayOrder.amount,
          currency: gatewayOrder.currency,
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Verify payment callback
 * POST /api/payments/verify
 */
const verifyPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const paymentData = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // Get payment provider
    const paymentProvider = PaymentGateway.getPaymentProvider();

    // Verify payment with gateway
    const verification = await paymentProvider.verifyPayment(paymentData);

    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        error: {
          code: verification.errorCode,
          message: verification.errorMessage,
        },
      });
    }

    // Find payment record by gateway order ID
    const gatewayOrderId =
      paymentData.razorpay_order_id || paymentData.gatewayOrderId;

    const paymentResult = await client.query(
      `SELECT * FROM payments
       WHERE gateway_order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [gatewayOrderId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    const payment = paymentResult.rows[0];

    // Update payment record
    await client.query(
      `UPDATE payments
       SET status = $1,
           gateway_transaction_id = $2,
           payment_date = NOW(),
           gateway_response = $3,
           updated_by = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        verification.status,
        verification.transactionId,
        JSON.stringify(verification.metadata),
        userId,
        payment.id,
      ]
    );

    // Update order paid_amount and balance_amount (only if payment successful)
    if (verification.status === 'success') {
      await client.query(
        `UPDATE orders
         SET paid_amount = paid_amount + $1,
             balance_amount = balance_amount - $1,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = $3`,
        [payment.amount, userId, payment.order_id]
      );
    }

    // If installment order, mark first pending installment as paid
    await client.query(
      `UPDATE payment_installments
       SET payment_id = $1,
           status = 'paid',
           paid_date = NOW(),
           paid_amount = $2
       WHERE order_id = $3
         AND status = 'pending'
       ORDER BY installment_number
       LIMIT 1`,
      [payment.id, payment.amount, payment.order_id]
    );

    await client.query('COMMIT');

    // TODO: Send WhatsApp notification

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        payment_id: payment.id,
        transaction_id: verification.transactionId,
        status: verification.status,
        amount: verification.amount,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Record offline payment (cash, bank transfer, etc.)
 * POST /api/payments/record
 */
const recordOfflinePayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const { order_id, amount, payment_method, receipt_number, notes } =
      req.body;
    const userId = req.user?.id;

    console.log('=== RECORD PAYMENT START ===');
    console.log('User ID:', userId);
    console.log('Request body:', {
      order_id,
      amount,
      amount_type: typeof amount,
      payment_method,
      receipt_number,
      notes: notes ? 'Present' : 'None'
    });

    // Enhanced validation logging
    if (!order_id) {
      console.error('Validation failed: Missing order_id');
    }
    if (!amount) {
      console.error('Validation failed: Missing amount');
    }
    if (!payment_method) {
      console.error('Validation failed: Missing payment_method');
    }

    await client.query('BEGIN');

    // Fetch order with row lock to prevent race conditions
    // Fetch total_amount and paid_amount (source of truth) not just balance_amount
    const orderResult = await client.query(
      `SELECT id, customer_id, total_amount, paid_amount FROM orders
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const order = orderResult.rows[0];

    // Compute from source of truth (consistent with DB trigger)
    const totalAmount = parseFloat(order.total_amount);
    const currentPaid = parseFloat(order.paid_amount);
    const orderBalance = Math.round((totalAmount - currentPaid) * 100) / 100;
    const paymentAmount = Math.round(parseFloat(amount) * 100) / 100;
    const finalBalance = Math.max(0, Math.round((orderBalance - paymentAmount) * 100) / 100);

    // Validate amount is positive
    if (paymentAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment amount must be greater than zero. Received: ₹${amount}`,
      });
    }

    // Validate amount against real balance (total - paid)
    if (paymentAmount > orderBalance + 0.005) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${paymentAmount.toFixed(2)}) exceeds outstanding balance (₹${orderBalance.toFixed(2)})`,
      });
    }

    // Cap effective payment to prevent floating-point overflow past total_amount
    const effectivePayment = Math.min(paymentAmount, orderBalance);

    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
         order_id, customer_id, payment_method, payment_gateway,
         amount, status, payment_date, receipt_number, received_by,
         notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
       RETURNING *`,
      [
        order_id,
        order.customer_id,
        payment_method,
        'manual',
        effectivePayment,
        'success',
        receipt_number,
        userId,
        notes,
        userId,
      ]
    );

    // Update order — use LEAST(total_amount, ...) so paid_amount can never
    // exceed total_amount regardless of floating-point rounding
    await client.query(
      `UPDATE orders
       SET paid_amount = LEAST(total_amount, paid_amount + $1),
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $3`,
      [effectivePayment, userId, order_id]
    );

    await client.query('COMMIT');

    // Trigger WhatsApp notification for payment received (Phase 9)
    try {
      notificationEvents.emit('payment:received', {
        paymentId: paymentResult.rows[0].id
      });
    } catch (notificationError) {
      console.error('Error emitting payment notification:', notificationError.message);
      // Don't fail the payment recording if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Offline payment recorded successfully',
      data: paymentResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    // Enhanced error logging
    console.error('=== PAYMENT RECORDING ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error hint:', error.hint);
    console.error('Request details:', {
      userId: req.user?.id,
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });
    console.error('Stack trace:', error.stack);
    console.error('=== END ERROR ===');

    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        errorCode: error.code,
        errorDetail: error.detail,
        errorHint: error.hint
      })
    });
  } finally {
    client.release();
  }
};

/**
 * Get order payments
 * GET /api/payments/order/:orderId
 */
const getOrderPayments = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT
         p.*,
         u.full_name as received_by_name
       FROM payments p
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.order_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
      [orderId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching order payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message,
    });
  }
};

/**
 * Get customer payment history
 * GET /api/payments/customer/:customerId
 */
const getCustomerPayments = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
         p.*,
         o.order_number,
         u.full_name as received_by_name
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.customer_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [customerId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM payments
       WHERE customer_id = $1 AND deleted_at IS NULL`,
      [customerId]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message,
    });
  }
};

/**
 * Process refund
 * POST /api/payments/refund
 */
const processRefund = async (req, res) => {
  const client = await pool.connect();

  try {
    const { payment_id, amount, reason } = req.body;
    const userId = req.user?.id;

    await client.query('BEGIN');

    // Fetch payment
    const paymentResult = await client.query(
      `SELECT * FROM payments
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const payment = paymentResult.rows[0];

    // Validate refund amount
    const maxRefundable = payment.amount - payment.refund_amount;
    if (amount > maxRefundable) {
      return res.status(400).json({
        success: false,
        message: `Maximum refundable amount is ₹${maxRefundable}`,
      });
    }

    // Process refund with gateway
    const paymentProvider = PaymentGateway.getPaymentProvider();
    const refundResult = await paymentProvider.processRefund({
      paymentId: payment.gateway_transaction_id,
      amount,
      reason,
    });

    if (!refundResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Refund processing failed',
        error: refundResult.error,
      });
    }

    // Update payment record
    await client.query(
      `UPDATE payments
       SET refund_amount = refund_amount + $1,
           refund_reference = $2,
           refund_reason = $3,
           refunded_at = NOW(),
           status = CASE
             WHEN refund_amount + $1 >= amount THEN 'refunded'
             ELSE status
           END,
           updated_by = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [amount, refundResult.refundId, reason, userId, payment_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refund_id: refundResult.refundId,
        amount,
        status: refundResult.status,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get payment summary for dashboard
 * GET /api/payments/summary
 */
const getPaymentSummary = async (req, res) => {
  try {
    const { period = 'month' } = req.query; // month, week, all

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = `AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                    AND EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`;
    } else if (period === 'week') {
      dateFilter = `AND p.payment_date >= CURRENT_DATE - INTERVAL '7 days'`;
    }

    // Payment summary
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_payments,
         SUM(amount) as total_collected,
         COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_count,
         SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_amount,
         COUNT(CASE WHEN payment_method = 'upi' THEN 1 END) as upi_count,
         SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END) as upi_amount,
         COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_count,
         SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END) as card_amount
       FROM payments p
       WHERE p.deleted_at IS NULL
       AND p.status = 'success'
       ${dateFilter}`
    );

    // Outstanding amounts
    const outstandingResult = await pool.query(
      `SELECT
         COUNT(*) as orders_with_balance,
         SUM(balance_amount) as total_outstanding,
         SUM(CASE WHEN delivery_date < CURRENT_DATE THEN balance_amount ELSE 0 END) as overdue_amount,
         COUNT(CASE WHEN delivery_date < CURRENT_DATE THEN 1 END) as overdue_count
       FROM orders
       WHERE balance_amount > 0
       AND status != 'cancelled'
       AND deleted_at IS NULL`
    );

    // Payment installments upcoming
    const installmentsResult = await pool.query(
      `SELECT COUNT(*) as count, SUM(installment_amount) as amount
       FROM payment_installments
       WHERE status = 'pending'
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
    );

    res.json({
      success: true,
      data: {
        collected: {
          totalPayments: parseInt(summaryResult.rows[0].total_payments),
          totalAmount: parseFloat(summaryResult.rows[0].total_collected || 0),
          byMethod: {
            cash: {
              count: parseInt(summaryResult.rows[0].cash_count),
              amount: parseFloat(summaryResult.rows[0].cash_amount || 0)
            },
            upi: {
              count: parseInt(summaryResult.rows[0].upi_count),
              amount: parseFloat(summaryResult.rows[0].upi_amount || 0)
            },
            card: {
              count: parseInt(summaryResult.rows[0].card_count),
              amount: parseFloat(summaryResult.rows[0].card_amount || 0)
            }
          }
        },
        outstanding: {
          ordersWithBalance: parseInt(outstandingResult.rows[0].orders_with_balance),
          totalOutstanding: parseFloat(outstandingResult.rows[0].total_outstanding || 0),
          overdueAmount: parseFloat(outstandingResult.rows[0].overdue_amount || 0),
          overdueCount: parseInt(outstandingResult.rows[0].overdue_count)
        },
        upcomingInstallments: {
          count: parseInt(installmentsResult.rows[0]?.count || 0),
          amount: parseFloat(installmentsResult.rows[0]?.amount || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get payment summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment summary',
      error: error.message
    });
  }
};

/**
 * Get upcoming payment reminders
 * GET /api/payments/upcoming
 */
const getUpcomingPayments = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         c.name as customer_name,
         c.phone as customer_phone,
         c.whatsapp_number,
         o.total_amount,
         o.paid_amount,
         o.balance_amount,
         o.delivery_date,
         o.payment_type,
         EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE)) as days_until_due
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.balance_amount > 0
       AND o.delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::interval
       AND o.status IN ('confirmed', 'preparing', 'ready', 'dispatched', 'delivered')
       AND o.deleted_at IS NULL
       ORDER BY o.delivery_date ASC`,
      [`${days} days`]
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        orderId: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        whatsappNumber: row.whatsapp_number,
        totalAmount: parseFloat(row.total_amount),
        paidAmount: parseFloat(row.paid_amount),
        balanceAmount: parseFloat(row.balance_amount),
        deliveryDate: row.delivery_date,
        paymentType: row.payment_type,
        daysUntilDue: parseInt(row.days_until_due),
        urgency: parseInt(row.days_until_due) <= 2 ? 'high' : 'normal'
      }))
    });
  } catch (error) {
    console.error('Get upcoming payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming payments',
      error: error.message
    });
  }
};

/**
 * Get payment installments for an order
 * GET /api/payments/installments/:orderId
 */
const getOrderInstallments = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT
         pi.*,
         p.payment_date,
         p.payment_method,
         p.receipt_number
       FROM payment_installments pi
       LEFT JOIN payments p ON pi.payment_id = p.id
       WHERE pi.order_id = $1
       ORDER BY pi.installment_number ASC`,
      [orderId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get order installments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch installments',
      error: error.message
    });
  }
};

/**
 * Generate payment receipt
 * GET /api/payments/:id/receipt
 */
const generateReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch payment details with related information
    const query = `
      SELECT
        p.*,
        o.order_number,
        o.order_date,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.gst_number,
        ca.address_line1,
        ca.address_line2,
        ca.city,
        ca.state,
        ca.pincode,
        u.full_name as received_by_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN customer_addresses ca ON o.delivery_address_id = ca.id
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const payment = result.rows[0];

    // Generate simple HTML receipt
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Payment Receipt - ${payment.receipt_number || payment.transaction_id}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #2e7d32; }
          .header p { margin: 5px 0; color: #666; }
          .section { margin: 20px 0; }
          .section h2 { font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; }
          .info-label { font-weight: bold; color: #555; }
          .info-value { color: #333; }
          .amount { font-size: 24px; color: #2e7d32; font-weight: bold; text-align: center; padding: 20px; background: #f5f5f5; margin: 20px 0; }
          .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Vasundhara Seedlings</h1>
          <p>Payment Receipt</p>
        </div>

        <div class="section">
          <h2>Receipt Details</h2>
          <div class="info-row">
            <span class="info-label">Receipt Number:</span>
            <span class="info-value">${payment.receipt_number || payment.transaction_id || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Date:</span>
            <span class="info-value">${new Date(payment.payment_date).toLocaleDateString('en-IN')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Method:</span>
            <span class="info-value">${payment.payment_method.toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">${payment.status.toUpperCase()}</span>
          </div>
        </div>

        <div class="section">
          <h2>Customer Details</h2>
          <div class="info-row">
            <span class="info-label">Name:</span>
            <span class="info-value">${payment.customer_name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Phone:</span>
            <span class="info-value">${payment.customer_phone}</span>
          </div>
          ${payment.customer_email ? `
          <div class="info-row">
            <span class="info-label">Email:</span>
            <span class="info-value">${payment.customer_email}</span>
          </div>
          ` : ''}
          ${payment.gst_number ? `
          <div class="info-row">
            <span class="info-label">GST Number:</span>
            <span class="info-value">${payment.gst_number}</span>
          </div>
          ` : ''}
        </div>

        <div class="section">
          <h2>Order Details</h2>
          <div class="info-row">
            <span class="info-label">Order Number:</span>
            <span class="info-value">${payment.order_number}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Order Date:</span>
            <span class="info-value">${new Date(payment.order_date).toLocaleDateString('en-IN')}</span>
          </div>
        </div>

        <div class="amount">
          Amount Paid: ₹${parseFloat(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        ${payment.notes ? `
        <div class="section">
          <h2>Notes</h2>
          <p>${payment.notes}</p>
        </div>
        ` : ''}

        ${payment.received_by_name ? `
        <div class="section">
          <div class="info-row">
            <span class="info-label">Received By:</span>
            <span class="info-value">${payment.received_by_name}</span>
          </div>
        </div>
        ` : ''}

        <div class="footer">
          <p>This is a computer-generated receipt and does not require a signature.</p>
          <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
        </div>

        <script>
          // Auto-print when opened
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(receiptHtml);
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate receipt',
      error: error.message,
    });
  }
};

module.exports = {
  getAllPayments,
  initiatePayment,
  verifyPayment,
  recordOfflinePayment,
  getOrderPayments,
  getCustomerPayments,
  processRefund,
  getPaymentSummary,
  getUpcomingPayments,
  getOrderInstallments,
  generateReceipt
};
