/**
 * Test Data Factories
 * Phase 19 - Testing Framework
 *
 * Factory functions to create consistent test data
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

/**
 * Create a test user
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} User object
 */
function createTestUser(overrides = {}) {
  return {
    id: uuidv4(),
    username: 'testuser_' + Date.now(),
    email: `test${Date.now()}@example.com`,
    password_hash: bcrypt.hashSync('Password123!', 10),
    first_name: 'Test',
    last_name: 'User',
    role: 'sales',
    phone: '9876543210',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test customer
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Customer object
 */
function createTestCustomer(overrides = {}) {
  return {
    id: uuidv4(),
    name: 'Test Customer ' + Date.now(),
    email: `customer${Date.now()}@example.com`,
    phone: '9876543210',
    business_name: 'Test Business',
    gst_number: 'GST' + Date.now(),
    credit_limit: 50000,
    credit_used: 0,
    payment_terms: 'net_30',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test customer address
 * @param {string} customerId - Customer ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Address object
 */
function createTestAddress(customerId, overrides = {}) {
  return {
    id: uuidv4(),
    customer_id: customerId,
    address_line1: '123 Test Street',
    address_line2: 'Test Area',
    city: 'Test City',
    state: 'Test State',
    postal_code: '123456',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.2090,
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test product
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Product object
 */
function createTestProduct(overrides = {}) {
  return {
    id: uuidv4(),
    name: 'Test Plant ' + Date.now(),
    category: 'Flowering',
    description: 'Test plant description',
    botanical_name: 'Plantus Testus',
    care_instructions: 'Water regularly',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test SKU
 * @param {string} productId - Product ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} SKU object
 */
function createTestSKU(productId, overrides = {}) {
  return {
    id: uuidv4(),
    product_id: productId,
    size: 'medium',
    pot_type: 'plastic',
    unit_price: 250,
    cost_price: 150,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test lot
 * @param {string} skuId - SKU ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Lot object
 */
function createTestLot(skuId, overrides = {}) {
  return {
    id: uuidv4(),
    sku_id: skuId,
    lot_number: 'LOT' + Date.now(),
    quantity: 100,
    available_quantity: 100,
    stage: 'ready',
    location: 'A1',
    planted_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    expected_ready_date: new Date(),
    qr_code: 'QR' + Date.now(),
    notes: 'Test lot',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test order
 * @param {string} customerId - Customer ID
 * @param {string} userId - User ID (created by)
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Order object
 */
function createTestOrder(customerId, userId, overrides = {}) {
  return {
    id: uuidv4(),
    order_number: 'ORD' + Date.now(),
    customer_id: customerId,
    status: 'pending',
    total_amount: 5000,
    discount_amount: 0,
    tax_amount: 900,
    net_amount: 5900,
    payment_status: 'pending',
    delivery_status: 'pending',
    notes: 'Test order',
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test order item
 * @param {string} orderId - Order ID
 * @param {string} skuId - SKU ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Order item object
 */
function createTestOrderItem(orderId, skuId, overrides = {}) {
  return {
    id: uuidv4(),
    order_id: orderId,
    sku_id: skuId,
    quantity: 10,
    unit_price: 250,
    discount_amount: 0,
    tax_rate: 18,
    tax_amount: 450,
    total_amount: 2950,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test payment
 * @param {string} orderId - Order ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Payment object
 */
function createTestPayment(orderId, overrides = {}) {
  return {
    id: uuidv4(),
    order_id: orderId,
    payment_method: 'upi',
    amount: 5900,
    transaction_id: 'TXN' + Date.now(),
    status: 'completed',
    payment_date: new Date(),
    notes: 'Test payment',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a test delivery
 * @param {string} orderId - Order ID
 * @param {string} driverId - Driver/User ID
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Delivery object
 */
function createTestDelivery(orderId, driverId, overrides = {}) {
  return {
    id: uuidv4(),
    order_id: orderId,
    driver_id: driverId,
    status: 'assigned',
    scheduled_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
    actual_delivery_date: null,
    delivery_notes: 'Test delivery',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Create a complete test order with all relations
 * Useful for integration tests
 * @returns {Promise<Object>} Complete order structure
 */
async function createCompleteTestOrder() {
  const user = createTestUser({ role: 'admin' });
  const customer = createTestCustomer();
  const address = createTestAddress(customer.id);
  const product = createTestProduct();
  const sku = createTestSKU(product.id);
  const lot = createTestLot(sku.id);
  const order = createTestOrder(customer.id, user.id);
  const orderItem = createTestOrderItem(order.id, sku.id);

  return {
    user,
    customer,
    address,
    product,
    sku,
    lot,
    order,
    orderItem
  };
}

/**
 * Create batch of test lots
 * @param {string} skuId - SKU ID
 * @param {number} count - Number of lots to create
 * @param {string} stage - Lot stage
 * @returns {Array<Object>} Array of lot objects
 */
function createTestLotBatch(skuId, count = 5, stage = 'ready') {
  return Array.from({ length: count }, (_, i) =>
    createTestLot(skuId, {
      lot_number: `LOT${Date.now()}_${i}`,
      quantity: 50 + i * 10,
      available_quantity: 50 + i * 10,
      stage,
      location: `A${i + 1}`
    })
  );
}

/**
 * Create test user credentials for login
 * @param {Object} overrides - Properties to override
 * @returns {Object} User with plain password for testing
 */
function createTestUserWithPassword(overrides = {}) {
  const password = 'Password123!';
  return {
    ...createTestUser({ ...overrides }),
    plain_password: password
  };
}

module.exports = {
  createTestUser,
  createTestCustomer,
  createTestAddress,
  createTestProduct,
  createTestSKU,
  createTestLot,
  createTestOrder,
  createTestOrderItem,
  createTestPayment,
  createTestDelivery,
  createCompleteTestOrder,
  createTestLotBatch,
  createTestUserWithPassword
};
