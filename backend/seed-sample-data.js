/**
 * Seed Sample Data for Reports
 * Creates orders and payments spanning 90 days for better chart visualization
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n=== SEEDING SAMPLE DATA FOR REPORTS ===\n');

    // Get existing data
    const skusRes = await client.query('SELECT id, price FROM skus WHERE deleted_at IS NULL LIMIT 10');
    const customersRes = await client.query(`
      SELECT c.id, ca.id as address_id
      FROM customers c
      JOIN customer_addresses ca ON ca.customer_id = c.id
      WHERE c.deleted_at IS NULL
      LIMIT 5
    `);
    const usersRes = await client.query('SELECT id FROM users LIMIT 1');

    if (skusRes.rows.length === 0 || customersRes.rows.length === 0) {
      console.log('❌ Need at least 1 SKU and 1 customer. Create them first.');
      await client.query('ROLLBACK');
      return;
    }

    const skus = skusRes.rows;
    const customers = customersRes.rows;
    const userId = usersRes.rows[0].id;

    console.log(`Found ${skus.length} SKUs and ${customers.length} customers`);
    console.log('Creating 30 orders over 90-day period...\n');

    let ordersCreated = 0;
    let paymentsCreated = 0;

    // Create 30 orders over 90 days
    for (let i = 0; i < 30; i++) {
      const daysAgo = 90 - (i * 3); // Spread over 90 days
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - daysAgo);

      const customer = customers[i % customers.length];
      const sku = skus[i % skus.length];

      const price = parseFloat(sku.price);
      const quantity = Math.floor(Math.random() * 10) + 1;
      const total = price * quantity;

      // Random status
      const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      // Delivery date (1-5 days after order)
      const deliveryDate = new Date(orderDate);
      deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 5) + 1);

      // Create order
      const orderRes = await client.query(`
        INSERT INTO orders (
          customer_id, delivery_address_id, status, delivery_date,
          total_amount, paid_amount, balance_amount, created_by,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $8)
        RETURNING id, created_at
      `, [
        customer.id,
        customer.address_id,
        status,
        deliveryDate,
        total,
        total,
        userId,
        orderDate
      ]);

      const orderId = orderRes.rows[0].id;
      ordersCreated++;

      // Create order item
      await client.query(`
        INSERT INTO order_items (
          order_id, sku_id, quantity, unit_price, subtotal
        ) VALUES ($1, $2, $3, $4, $5)
      `, [orderId, sku.id, quantity, price, total]);

      // Create payment (80% of orders get paid)
      if (Math.random() > 0.2) {
        const paymentDate = new Date(orderDate);
        paymentDate.setDate(paymentDate.getDate() + Math.floor(Math.random() * 5));

        const paymentMethods = ['cash', 'upi', 'card', 'bank_transfer'];
        const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

        // Random partial or full payment
        const paymentAmount = Math.random() > 0.3 ? total : total * 0.5;

        await client.query(`
          INSERT INTO payments (
            order_id, amount, payment_method, payment_date,
            status, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          orderId,
          paymentAmount,
          method,
          paymentDate,
          'success',
          userId
        ]);

        // Update order balance
        const newBalance = total - paymentAmount;
        await client.query(`
          UPDATE orders
          SET paid_amount = $1, balance_amount = $2
          WHERE id = $3
        `, [paymentAmount, newBalance, orderId]);

        paymentsCreated++;
      }

      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`  Created ${i + 1}/30 orders...`);
      }
    }

    await client.query('COMMIT');

    console.log('\n✓ Seeding complete!');
    console.log(`  Orders created: ${ordersCreated}`);
    console.log(`  Payments created: ${paymentsCreated}`);
    console.log('\n=== NEXT STEPS ===');
    console.log('1. Refresh the Reports page in your browser');
    console.log('2. Select date range: "Last 30 Days" or "All Time"');
    console.log('3. Click "Apply" button');
    console.log('4. Charts should now display data!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error seeding data:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
