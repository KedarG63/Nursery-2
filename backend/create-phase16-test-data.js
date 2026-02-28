/**
 * Phase 16 Test Data Creation Script
 * Creates comprehensive test data for all Phase 16 automation features
 */

require('dotenv').config();
const db = require('./utils/db');
const pool = require('./config/database');

async function createPhase16TestData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n🚀 Creating Phase 16 Test Data...\n');

    // Get admin user ID
    const adminResult = await client.query(
      "SELECT id FROM users WHERE email = 'admin@nursery.com'"
    );
    const adminId = adminResult.rows[0]?.id;

    if (!adminId) {
      throw new Error('Admin user not found. Please create admin user first.');
    }

    console.log('✓ Admin user found:', adminId);

    // 1. Create test customers
    console.log('\n📋 Creating test customers...');

    const customer1 = await client.query(
      `INSERT INTO customers (name, email, phone, whatsapp_number, customer_type, credit_limit, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      ['Test Customer 1', 'test1@example.com', '+919876543210', '+919876543210', 'retailer', 50000, adminId]
    );

    const customer2 = await client.query(
      `INSERT INTO customers (name, email, phone, whatsapp_number, customer_type, credit_limit, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      ['Test Customer 2', 'test2@example.com', '+919876543211', '+919876543211', 'farmer', 100000, adminId]
    );

    const customerId1 = customer1.rows[0].id;
    const customerId2 = customer2.rows[0].id;

    console.log('✓ Customers created:', customerId1, customerId2);

    // 2. Create delivery addresses
    console.log('📍 Creating delivery addresses...');

    const address1 = await client.query(
      `INSERT INTO customer_addresses (customer_id, address_type, address_line1, city, state, pincode, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [customerId1, 'delivery', '123 Test Street', 'Mumbai', 'Maharashtra', '400001', true]
    );

    const address2 = await client.query(
      `INSERT INTO customer_addresses (customer_id, address_type, address_line1, city, state, pincode, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [customerId2, 'delivery', '456 Farm Road', 'Pune', 'Maharashtra', '411001', true]
    );

    const addressId1 = address1.rows[0].id;
    const addressId2 = address2.rows[0].id;

    console.log('✓ Addresses created');

    // 3. Create test products and SKUs
    console.log('🌱 Creating products and SKUs...');

    const product1 = await client.query(
      `INSERT INTO products (name, description, category, growth_period_days, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Tomato Plant', 'Fresh tomato plants', 'fruiting', 60, 'active', adminId]
    );

    const product2 = await client.query(
      `INSERT INTO products (name, description, category, growth_period_days, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Lettuce', 'Green lettuce', 'leafy_greens', 30, 'active', adminId]
    );

    const productId1 = product1.rows[0].id;
    const productId2 = product2.rows[0].id;

    const sku1 = await client.query(
      `INSERT INTO skus (sku_code, product_id, size, container_type, price, cost, min_stock_level, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      ['SKU-TEST-001', productId1, 'medium', 'pot', 50.00, 30.00, 100, adminId]
    );

    const sku2 = await client.query(
      `INSERT INTO skus (sku_code, product_id, size, container_type, price, cost, min_stock_level, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      ['SKU-TEST-002', productId2, 'small', 'tray', 25.00, 15.00, 200, adminId]
    );

    const skuId1 = sku1.rows[0].id;
    const skuId2 = sku2.rows[0].id;

    console.log('✓ Products and SKUs created');

    // 4. Create test lots (some ready tomorrow, some growing)
    console.log('📦 Creating test lots...');

    // Lot 1: Ready tomorrow (for Issue #75 testing)
    const lot1 = await client.query(
      `INSERT INTO lots (lot_number, sku_id, quantity, available_quantity, growth_stage,
                         planted_date, expected_ready_date, ready_notification_sent, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      ['LOT-001', skuId1, 100, 100, 'ready',
       new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
       new Date(Date.now() + 24 * 60 * 60 * 1000), false, adminId]
    );

    // Lot 2: Ready today (for Issue #75 testing)
    const lot2 = await client.query(
      `INSERT INTO lots (lot_number, sku_id, quantity, available_quantity, growth_stage,
                         planted_date, expected_ready_date, ready_notification_sent, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      ['LOT-002', skuId2, 50, 50, 'ready',
       new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
       new Date(), false, adminId]
    );

    // Lot 3: Already ready (low stock for Issue #78 testing)
    const lot3 = await client.query(
      `INSERT INTO lots (lot_number, sku_id, quantity, available_quantity, growth_stage,
                         planted_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      ['LOT-003', skuId1, 20, 20, 'ready',
       new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), adminId]
    );

    console.log('✓ Lots created');

    // 5. Create test orders
    console.log('📝 Creating test orders...');

    const order1 = await client.query(
      `INSERT INTO orders (order_number, customer_id, delivery_address_id, delivery_date,
                           payment_type, status, subtotal_amount, tax_amount, total_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      ['ORD-001', customerId1, addressId1, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
       'credit', 'confirmed', 5000, 900, 5900, adminId]
    );

    const orderId1 = order1.rows[0].id;

    // Create order items linking to lots for ready notification testing
    await client.query(
      `INSERT INTO order_items (order_id, sku_id, quantity, unit_price, line_total, lot_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId1, skuId1, 30, 150, 4500, lot1.rows[0].id, 'allocated']
    );

    await client.query(
      `INSERT INTO order_items (order_id, sku_id, quantity, unit_price, line_total, lot_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId1, skuId2, 20, 70, 1400, lot2.rows[0].id, 'allocated']
    );

    console.log('✓ Orders and order items created');

    // 6. Create payment installments for Issue #76 testing
    console.log('💰 Creating payment installments...');

    // Upcoming payment (3 days from now)
    await client.query(
      `INSERT INTO payment_installments (order_id, installment_number, total_installments, amount, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId1, 1, 3, 2000, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), 'pending']
    );

    // Overdue payment (5 days ago)
    await client.query(
      `INSERT INTO payment_installments (order_id, installment_number, total_installments, amount, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId1, 2, 3, 1900, new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), 'overdue']
    );

    // Severely overdue payment (35 days ago)
    await client.query(
      `INSERT INTO payment_installments (order_id, installment_number, total_installments, amount, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId1, 3, 3, 2000, new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), 'overdue']
    );

    console.log('✓ Payment installments created');

    // 7. Create delivery route and stops for Issue #79 testing
    console.log('🚚 Creating delivery routes...');

    const route = await client.query(
      `INSERT INTO delivery_routes (route_number, driver_id, vehicle_id, route_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['RT-TEST-001', adminId, null, new Date(), 'planned']
    );

    const routeId = route.rows[0].id;

    const stop = await client.query(
      `INSERT INTO route_stops (route_id, order_id, stop_sequence, delivery_address, latitude, longitude,
                                status, customer_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [routeId, orderId1, 1, '123 Test Street, Mumbai', 19.0760, 72.8777,
       'pending', '+919876543210']
    );

    console.log('✓ Delivery routes created');

    await client.query('COMMIT');

    console.log('\n✅ Phase 16 test data created successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - Customers: 2`);
    console.log(`   - Products: 2`);
    console.log(`   - SKUs: 2`);
    console.log(`   - Lots: 3 (1 ready today, 1 ready tomorrow, 1 already ready)`);
    console.log(`   - Orders: 1`);
    console.log(`   - Payment Installments: 3 (upcoming, overdue, severely overdue)`);
    console.log(`   - Delivery Routes: 1`);
    console.log('\n🧪 Ready for Phase 16 testing!\n');

    client.release();
    await db.closePool();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('❌ Error creating test data:', error);
    await db.closePool();
    process.exit(1);
  }
}

createPhase16TestData();
