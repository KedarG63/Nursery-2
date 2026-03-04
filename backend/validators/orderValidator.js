/**
 * Order Validation Middleware
 * Validates order creation and update requests
 */

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'delivered',
  'cancelled',
];

const PAYMENT_TYPES = ['advance', 'installment', 'credit', 'cod'];

const DELIVERY_SLOTS = ['morning', 'afternoon', 'evening'];

// Define valid status transitions (state machine)
const VALID_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Validate create order request
 */
const validateCreateOrder = (req, res, next) => {
  const { customer_id, delivery_address_id, delivery_date, payment_type, items } = req.body;

  const errors = [];

  // Validate required fields
  if (!customer_id) {
    errors.push('customer_id is required');
  } else if (!isValidUUID(customer_id)) {
    errors.push('customer_id must be a valid UUID');
  }

  // Optional for walk-in / counter pickup orders
  if (delivery_address_id && !isValidUUID(delivery_address_id)) {
    errors.push('delivery_address_id must be a valid UUID');
  }

  if (delivery_date) {
    const deliveryDateObj = new Date(delivery_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(deliveryDateObj.getTime())) {
      errors.push('delivery_date must be a valid date');
    }
  }

  if (!payment_type) {
    errors.push('payment_type is required');
  } else if (!PAYMENT_TYPES.includes(payment_type)) {
    errors.push(`payment_type must be one of: ${PAYMENT_TYPES.join(', ')}`);
  }

  // Validate delivery_slot if provided
  if (req.body.delivery_slot && !DELIVERY_SLOTS.includes(req.body.delivery_slot)) {
    errors.push(`delivery_slot must be one of: ${DELIVERY_SLOTS.join(', ')}`);
  }

  // Validate items array
  if (!items || !Array.isArray(items)) {
    errors.push('items must be an array');
  } else if (items.length === 0) {
    errors.push('items array cannot be empty');
  } else {
    items.forEach((item, index) => {
      if (!item.sku_id) {
        errors.push(`items[${index}].sku_id is required`);
      } else if (!isValidUUID(item.sku_id)) {
        errors.push(`items[${index}].sku_id must be a valid UUID`);
      }

      if (item.quantity === undefined || item.quantity === null) {
        errors.push(`items[${index}].quantity is required`);
      } else if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`items[${index}].quantity must be a positive integer`);
      }

      // unit_price is optional on creation (will be fetched from SKU)
      if (item.unit_price !== undefined && item.unit_price !== null) {
        if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
          errors.push(`items[${index}].unit_price must be a non-negative number`);
        }
      }
    });
  }

  // Validate discount_amount if provided
  if (req.body.discount_amount !== undefined && req.body.discount_amount !== null) {
    if (typeof req.body.discount_amount !== 'number' || req.body.discount_amount < 0) {
      errors.push('discount_amount must be a non-negative number');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate update order status request
 */
const validateUpdateStatus = (req, res, next) => {
  const { status } = req.body;
  const errors = [];

  if (!status) {
    errors.push('status is required');
  } else if (!ORDER_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate allocate lots request
 */
const validateAllocateLots = (req, res, next) => {
  const { allocations } = req.body;
  const errors = [];

  if (!allocations || !Array.isArray(allocations)) {
    errors.push('allocations must be an array');
  } else if (allocations.length === 0) {
    errors.push('allocations array cannot be empty');
  } else {
    allocations.forEach((allocation, index) => {
      if (!allocation.item_id) {
        errors.push(`allocations[${index}].item_id is required`);
      } else if (!isValidUUID(allocation.item_id)) {
        errors.push(`allocations[${index}].item_id must be a valid UUID`);
      }

      if (!allocation.lot_id) {
        errors.push(`allocations[${index}].lot_id is required`);
      } else if (!isValidUUID(allocation.lot_id)) {
        errors.push(`allocations[${index}].lot_id must be a valid UUID`);
      }

      if (allocation.quantity === undefined || allocation.quantity === null) {
        errors.push(`allocations[${index}].quantity is required`);
      } else if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
        errors.push(`allocations[${index}].quantity must be a positive integer`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Validate list orders query parameters
 */
const validateListOrders = (req, res, next) => {
  const errors = [];
  const { customer_id, status, page, limit, sort_by, sort_order } = req.query;

  // Validate customer_id if provided
  if (customer_id && !isValidUUID(customer_id)) {
    errors.push('customer_id must be a valid UUID');
  }

  // Validate status if provided (can be comma-separated, case-insensitive)
  if (status) {
    const statuses = status.split(',');
    const invalidStatuses = statuses.filter((s) => !ORDER_STATUSES.includes(s.trim().toLowerCase()));
    if (invalidStatuses.length > 0) {
      errors.push(`Invalid status values: ${invalidStatuses.join(', ')}`);
    }
  }

  // Validate pagination
  if (page !== undefined) {
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.push('page must be a positive integer');
    }
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      errors.push('limit must be between 1 and 100');
    }
  }

  // Validate sorting
  const validSortFields = ['order_date', 'delivery_date', 'total_amount', 'status', 'created_at'];
  if (sort_by && !validSortFields.includes(sort_by)) {
    errors.push(`sort_by must be one of: ${validSortFields.join(', ')}`);
  }

  if (sort_order && !['asc', 'desc'].includes(sort_order.toLowerCase())) {
    errors.push('sort_order must be either asc or desc');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

/**
 * Check if status transition is valid
 */
const isValidStatusTransition = (currentStatus, newStatus) => {
  if (!VALID_STATUS_TRANSITIONS[currentStatus]) {
    return false;
  }
  return VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus);
};

/**
 * Helper function to validate UUID format
 */
const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

module.exports = {
  validateCreateOrder,
  validateUpdateStatus,
  validateAllocateLots,
  validateListOrders,
  isValidStatusTransition,
  VALID_STATUS_TRANSITIONS,
  ORDER_STATUSES,
  PAYMENT_TYPES,
  DELIVERY_SLOTS,
};
