/**
 * Test Data Fixtures
 * Phase 19 - Issue #93
 *
 * Complete test data sets for integration testing
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

/**
 * Create complete test dataset with all relationships
 * @returns {Object} Complete test data
 */
async function createCompleteTestDataset() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Users
  const users = {
    admin: {
      id: uuidv4(),
      email: 'admin@test.com',
      password_hash: passwordHash,
      full_name: 'Test Admin',
      phone: '9876543210',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    },
    manager: {
      id: uuidv4(),
      email: 'manager@test.com',
      password_hash: passwordHash,
      full_name: 'Test Manager',
      phone: '9876543211',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    },
    sales: {
      id: uuidv4(),
      email: 'sales@test.com',
      password_hash: passwordHash,
      full_name: 'Test Sales',
      phone: '9876543212',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  // Roles
  const roles = {
    admin: {
      id: uuidv4(),
      name: 'Admin',
      description: 'Administrator role',
      created_at: new Date()
    },
    manager: {
      id: uuidv4(),
      name: 'Manager',
      description: 'Manager role',
      created_at: new Date()
    },
    sales: {
      id: uuidv4(),
      name: 'Sales',
      description: 'Sales role',
      created_at: new Date()
    }
  };

  // Customers
  const customers = {
    customer1: {
      id: uuidv4(),
      name: 'Test Customer 1',
      email: 'customer1@test.com',
      phone: '9876543220',
      business_name: 'Test Business 1',
      gst_number: 'GST001',
      credit_limit: 100000,
      credit_used: 0,
      payment_terms: 'net_30',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    customer2: {
      id: uuidv4(),
      name: 'Test Customer 2',
      email: 'customer2@test.com',
      phone: '9876543221',
      business_name: 'Test Business 2',
      gst_number: 'GST002',
      credit_limit: 50000,
      credit_used: 0,
      payment_terms: 'cod',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  // Customer Addresses
  const addresses = {
    address1: {
      id: uuidv4(),
      customer_id: customers.customer1.id,
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
      updated_at: new Date()
    },
    address2: {
      id: uuidv4(),
      customer_id: customers.customer2.id,
      address_line1: '456 Test Avenue',
      address_line2: 'Test Block',
      city: 'Test City',
      state: 'Test State',
      postal_code: '123457',
      country: 'India',
      latitude: 28.7041,
      longitude: 77.1025,
      is_default: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  // Products
  const products = {
    rose: {
      id: uuidv4(),
      name: 'Rose Plant',
      category: 'Flowering',
      description: 'Beautiful rose plant',
      botanical_name: 'Rosa',
      care_instructions: 'Water regularly, needs sunlight',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    tulsi: {
      id: uuidv4(),
      name: 'Tulsi Plant',
      category: 'Medicinal',
      description: 'Holy basil plant',
      botanical_name: 'Ocimum tenuiflorum',
      care_instructions: 'Water daily, full sun',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    fern: {
      id: uuidv4(),
      name: 'Boston Fern',
      category: 'Foliage',
      description: 'Lush green fern',
      botanical_name: 'Nephrolepis exaltata',
      care_instructions: 'Keep soil moist, indirect light',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  // SKUs
  const skus = {
    roseSmall: {
      id: uuidv4(),
      product_id: products.rose.id,
      sku_code: 'ROSE-SM-01',
      name: 'Rose Small',
      size: 'small',
      pot_type: 'plastic',
      unit_price: 150,
      cost_price: 80,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    roseMedium: {
      id: uuidv4(),
      product_id: products.rose.id,
      sku_code: 'ROSE-MD-01',
      name: 'Rose Medium',
      size: 'medium',
      pot_type: 'ceramic',
      unit_price: 300,
      cost_price: 150,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    tulsiSmall: {
      id: uuidv4(),
      product_id: products.tulsi.id,
      sku_code: 'TULSI-SM-01',
      name: 'Tulsi Small',
      size: 'small',
      pot_type: 'plastic',
      unit_price: 100,
      cost_price: 50,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    fernMedium: {
      id: uuidv4(),
      product_id: products.fern.id,
      sku_code: 'FERN-MD-01',
      name: 'Fern Medium',
      size: 'medium',
      pot_type: 'hanging',
      unit_price: 250,
      cost_price: 120,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  // Lots
  const lots = {
    roseSmallLot1: {
      id: uuidv4(),
      sku_id: skus.roseSmall.id,
      lot_number: 'LOT-ROSE-SM-001',
      quantity: 100,
      allocated_quantity: 0,
      available_quantity: 100,
      growth_stage: 'ready',
      current_location: 'A1',
      planted_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      expected_ready_date: new Date(),
      qr_code: 'QR-ROSE-SM-001',
      notes: 'Ready for sale',
      created_at: new Date(),
      updated_at: new Date()
    },
    roseMediumLot1: {
      id: uuidv4(),
      sku_id: skus.roseMedium.id,
      lot_number: 'LOT-ROSE-MD-001',
      quantity: 50,
      allocated_quantity: 0,
      available_quantity: 50,
      growth_stage: 'ready',
      current_location: 'A2',
      planted_date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      expected_ready_date: new Date(),
      qr_code: 'QR-ROSE-MD-001',
      notes: 'Premium quality',
      created_at: new Date(),
      updated_at: new Date()
    },
    tulsiSmallLot1: {
      id: uuidv4(),
      sku_id: skus.tulsiSmall.id,
      lot_number: 'LOT-TULSI-SM-001',
      quantity: 200,
      allocated_quantity: 0,
      available_quantity: 200,
      growth_stage: 'ready',
      current_location: 'B1',
      planted_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      expected_ready_date: new Date(),
      qr_code: 'QR-TULSI-SM-001',
      notes: 'High quality',
      created_at: new Date(),
      updated_at: new Date()
    },
    fernMediumLot1: {
      id: uuidv4(),
      sku_id: skus.fernMedium.id,
      lot_number: 'LOT-FERN-MD-001',
      quantity: 75,
      allocated_quantity: 0,
      available_quantity: 75,
      growth_stage: 'transplant',
      current_location: 'C1',
      planted_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      expected_ready_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      qr_code: 'QR-FERN-MD-001',
      notes: 'Growing well',
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  return {
    users,
    roles,
    customers,
    addresses,
    products,
    skus,
    lots
  };
}

/**
 * Insert test data into database
 * @param {Object} client - Database client
 * @param {Object} data - Test data to insert
 */
async function insertTestData(client, data) {
  // Insert roles
  for (const role of Object.values(data.roles)) {
    await client.query(
      `INSERT INTO roles (id, name, description, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [role.id, role.name, role.description, role.created_at]
    );
  }

  // Insert users
  for (const user of Object.values(data.users)) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, user.email, user.password_hash, user.full_name, user.phone, user.status, user.created_at, user.updated_at]
    );
  }

  // Assign roles to users
  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, (SELECT id FROM roles WHERE name = 'Admin' LIMIT 1))`,
    [data.users.admin.id]
  );

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, (SELECT id FROM roles WHERE name = 'Manager' LIMIT 1))`,
    [data.users.manager.id]
  );

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, (SELECT id FROM roles WHERE name = 'Sales' LIMIT 1))`,
    [data.users.sales.id]
  );

  // Insert customers
  for (const customer of Object.values(data.customers)) {
    await client.query(
      `INSERT INTO customers (id, name, email, phone, business_name, gst_number, credit_limit, credit_used, payment_terms, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [customer.id, customer.name, customer.email, customer.phone, customer.business_name, customer.gst_number,
       customer.credit_limit, customer.credit_used, customer.payment_terms, customer.is_active, customer.created_at, customer.updated_at]
    );
  }

  // Insert addresses
  for (const address of Object.values(data.addresses)) {
    await client.query(
      `INSERT INTO customer_addresses (id, customer_id, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [address.id, address.customer_id, address.address_line1, address.address_line2, address.city, address.state,
       address.postal_code, address.country, address.latitude, address.longitude, address.is_default, address.created_at, address.updated_at]
    );
  }

  // Insert products
  for (const product of Object.values(data.products)) {
    await client.query(
      `INSERT INTO products (id, name, category, description, botanical_name, care_instructions, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [product.id, product.name, product.category, product.description, product.botanical_name,
       product.care_instructions, product.is_active, product.created_at, product.updated_at]
    );
  }

  // Insert SKUs
  for (const sku of Object.values(data.skus)) {
    await client.query(
      `INSERT INTO skus (id, product_id, sku_code, name, size, pot_type, unit_price, cost_price, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [sku.id, sku.product_id, sku.sku_code, sku.name, sku.size, sku.pot_type,
       sku.unit_price, sku.cost_price, sku.is_active, sku.created_at, sku.updated_at]
    );
  }

  // Insert lots
  for (const lot of Object.values(data.lots)) {
    await client.query(
      `INSERT INTO lots (id, sku_id, lot_number, quantity, allocated_quantity, available_quantity, growth_stage, current_location, planted_date, expected_ready_date, qr_code, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [lot.id, lot.sku_id, lot.lot_number, lot.quantity, lot.allocated_quantity, lot.available_quantity,
       lot.growth_stage, lot.current_location, lot.planted_date, lot.expected_ready_date, lot.qr_code, lot.notes, lot.created_at, lot.updated_at]
    );
  }
}

module.exports = {
  createCompleteTestDataset,
  insertTestData
};
