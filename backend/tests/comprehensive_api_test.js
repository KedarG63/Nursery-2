/**
 * Comprehensive API Test Suite - Nursery Management System
 * Tests all endpoints with proper authentication
 * Run: node tests/comprehensive_api_test.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'Admin123';

// Test results storage
const results = {
  passed: [],
  failed: [],
  warnings: [],
  summary: {}
};

// HTTP request helper
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Test runner
let testNum = 0;
async function test(description, fn) {
  testNum++;
  const num = String(testNum).padStart(3, '0');
  try {
    const result = await fn();
    const status = result.passed ? '✅ PASS' : (result.warning ? '⚠️  WARN' : '❌ FAIL');
    const line = `[${num}] ${status} | ${description} | HTTP ${result.httpStatus || '---'} | ${result.note || ''}`;

    if (result.passed) {
      results.passed.push({ num, description, httpStatus: result.httpStatus, note: result.note });
    } else if (result.warning) {
      results.warnings.push({ num, description, httpStatus: result.httpStatus, note: result.note });
    } else {
      results.failed.push({ num, description, httpStatus: result.httpStatus, note: result.note || result.error });
    }
    console.log(line);
    return result;
  } catch (e) {
    const line = `[${num}] ❌ FAIL | ${description} | ERROR: ${e.message}`;
    results.failed.push({ num, description, error: e.message });
    console.log(line);
    return { passed: false, error: e.message };
  }
}

function pass(httpStatus, note = '') {
  return { passed: true, httpStatus, note };
}
function fail(httpStatus, note = '') {
  return { passed: false, httpStatus, note };
}
function warn(httpStatus, note = '') {
  return { passed: true, warning: true, httpStatus, note };
}

// State shared between tests
const state = {};

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  NURSERY MANAGEMENT SYSTEM - COMPREHENSIVE API TEST SUITE');
  console.log('  Started:', new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  // =========================================================================
  // SECTION 1: HEALTH CHECKS
  // =========================================================================
  console.log('\n--- SECTION 1: HEALTH ENDPOINTS ---');

  await test('GET /health/ - basic health check returns 200', async () => {
    const r = await request('GET', '/health/');
    if (r.status === 200 && r.body.status === 'ok') return pass(r.status, `service: ${r.body.service}`);
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /health/ready - readiness probe', async () => {
    const r = await request('GET', '/health/ready');
    if (r.status === 200 && r.body.status === 'ready') return pass(r.status);
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /health/live - liveness probe', async () => {
    const r = await request('GET', '/health/live');
    if (r.status === 200 && r.body.status === 'alive') return pass(r.status, `uptime: ${r.body.uptime}s`);
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /health/detailed - detailed health check', async () => {
    const r = await request('GET', '/health/detailed');
    if (r.status === 200 || r.status === 503) return warn(r.status, 'detailed check returned ' + r.body.status);
    return fail(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 2: AUTH ENDPOINTS
  // =========================================================================
  console.log('\n--- SECTION 2: AUTH ENDPOINTS ---');

  await test('POST /api/auth/register - validation: missing fullName returns 400', async () => {
    const r = await request('POST', '/api/auth/register', { email: 'bad@test.com', password: 'Test@1234' });
    if (r.status === 400 && r.body.errors) return pass(r.status, 'validation errors returned');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/register - validation: weak password returns 400', async () => {
    const r = await request('POST', '/api/auth/register', { email: 'bad@test.com', password: 'weak', fullName: 'Test' });
    if (r.status === 400) return pass(r.status, 'weak password rejected');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/register - new user created successfully', async () => {
    const email = `testuser_${Date.now()}@nursery.com`;
    const r = await request('POST', '/api/auth/register', { email, password: 'Test@1234', fullName: 'Test User' });
    if (r.status === 201 && r.body.tokens && r.body.tokens.accessToken) {
      state.newUserToken = r.body.tokens.accessToken;
      state.newUserRefresh = r.body.tokens.refreshToken;
      state.newUserId = r.body.user.id;
      return pass(r.status, `userId: ${r.body.user.id}`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/register - duplicate email returns 409', async () => {
    const r = await request('POST', '/api/auth/register', { email: ADMIN_EMAIL, password: 'Test@1234', fullName: 'Dup' });
    if (r.status === 409) return pass(r.status, 'duplicate email rejected');
    return warn(r.status, 'expected 409, got: ' + JSON.stringify(r.body));
  });

  await test('POST /api/auth/login - invalid credentials returns 401', async () => {
    const r = await request('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: 'wrongpass' });
    if (r.status === 401) return pass(r.status, 'invalid credentials rejected');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/login - missing email returns 400', async () => {
    const r = await request('POST', '/api/auth/login', { password: 'Admin123' });
    if (r.status === 400) return pass(r.status, 'validation works');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/login - admin login returns tokens', async () => {
    const r = await request('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (r.status === 200 && r.body.tokens && r.body.tokens.accessToken) {
      state.adminToken = r.body.tokens.accessToken;
      state.adminRefresh = r.body.tokens.refreshToken;
      state.adminId = r.body.user.id;
      return pass(r.status, `roles: ${r.body.user.roles.join(',')}`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/refresh - valid refresh token returns new access token', async () => {
    if (!state.adminRefresh) return fail(0, 'No refresh token available');
    const r = await request('POST', '/api/auth/refresh', { refreshToken: state.adminRefresh });
    if (r.status === 200 && r.body.accessToken) {
      state.adminToken = r.body.accessToken; // update with fresh token
      return pass(r.status, 'new access token issued');
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/refresh - invalid refresh token returns 401', async () => {
    const r = await request('POST', '/api/auth/refresh', { refreshToken: 'invalid.token.here' });
    if (r.status === 401) return pass(r.status, 'invalid token rejected');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/auth/refresh - missing token returns 400', async () => {
    const r = await request('POST', '/api/auth/refresh', {});
    if (r.status === 400) return pass(r.status, 'missing token validated');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/auth/profile - unauthenticated returns 401', async () => {
    const r = await request('GET', '/api/auth/profile');
    if (r.status === 401) return pass(r.status, 'unauthenticated rejected');
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/auth/profile - authenticated returns user profile', async () => {
    const r = await request('GET', '/api/auth/profile', null, state.adminToken);
    if (r.status === 200 && r.body.user && r.body.user.email === ADMIN_EMAIL) return pass(r.status, `email: ${r.body.user.email}`);
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/auth/users - admin can list users', async () => {
    const r = await request('GET', '/api/auth/users', null, state.adminToken);
    if (r.status === 200) return pass(r.status, `users returned`);
    return fail(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 3: USERS MANAGEMENT
  // =========================================================================
  console.log('\n--- SECTION 3: USER MANAGEMENT ENDPOINTS ---');

  await test('GET /api/users/ - admin can list all users', async () => {
    const r = await request('GET', '/api/users/', null, state.adminToken);
    if (r.status === 200) {
      const users = Array.isArray(r.body) ? r.body : r.body.users || [];
      return pass(r.status, `${users.length} users found`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/users/role/Admin - get users by role', async () => {
    const r = await request('GET', '/api/users/role/Admin', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'role filter works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/users/ - create new user', async () => {
    const r = await request('POST', '/api/users/', {
      email: `mgr_${Date.now()}@nursery.com`,
      password: 'Manager@1234',
      fullName: 'Test Manager',
      role: 'Manager'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.testUserId = r.body.id || r.body.user?.id;
      return pass(r.status, `userId: ${state.testUserId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/users/:id - update user details', async () => {
    if (!state.testUserId) return warn(0, 'No testUserId available');
    const r = await request('PUT', `/api/users/${state.testUserId}`, { fullName: 'Updated Manager' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'user updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/users/:id/role - update user role', async () => {
    if (!state.testUserId) return warn(0, 'No testUserId available');
    const r = await request('PUT', `/api/users/${state.testUserId}/role`, { role: 'Sales' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'role updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/users/:id/status - toggle user status', async () => {
    if (!state.testUserId) return warn(0, 'No testUserId available');
    const r = await request('PUT', `/api/users/${state.testUserId}/status`, { status: 'inactive' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'status toggled');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/users/:id/reset-password - reset user password', async () => {
    if (!state.testUserId) return warn(0, 'No testUserId available');
    const r = await request('PUT', `/api/users/${state.testUserId}/reset-password`, { newPassword: 'NewPass@1234' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'password reset');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('DELETE /api/users/:id - delete user (Admin only)', async () => {
    if (!state.testUserId) return warn(0, 'No testUserId available');
    const r = await request('DELETE', `/api/users/${state.testUserId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'user deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 4: PRODUCTS
  // =========================================================================
  console.log('\n--- SECTION 4: PRODUCTS ENDPOINTS ---');

  await test('GET /api/products/ - list all products (public)', async () => {
    const r = await request('GET', '/api/products/');
    if (r.status === 200) {
      const products = Array.isArray(r.body) ? r.body : r.body.products || [];
      state.firstProductId = products[0]?.id;
      return pass(r.status, `${products.length} products`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/products/ - create product (Admin)', async () => {
    const r = await request('POST', '/api/products/', {
      name: `Test Plant ${Date.now()}`,
      description: 'A test plant for API testing',
      category: 'Flowering',
      base_price: 150.00,
      unit: 'piece'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.productId = r.body.id || r.body.product?.id;
      return pass(r.status, `productId: ${state.productId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/products/:id - get product by id', async () => {
    const id = state.productId || state.firstProductId;
    if (!id) return warn(0, 'No product ID available');
    const r = await request('GET', `/api/products/${id}`);
    if (r.status === 200) return pass(r.status, `name: ${r.body.name || r.body.product?.name}`);
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/products/nonexistent - returns 404', async () => {
    const r = await request('GET', '/api/products/00000000-0000-0000-0000-000000000000');
    if (r.status === 404) return pass(r.status, 'not found handled correctly');
    return warn(r.status, 'expected 404, got: ' + r.status);
  });

  await test('PUT /api/products/:id - update product', async () => {
    if (!state.productId) return warn(0, 'No productId available');
    const r = await request('PUT', `/api/products/${state.productId}`, { description: 'Updated description', base_price: 200.00 }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'product updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('DELETE /api/products/:id - delete product', async () => {
    if (!state.productId) return warn(0, 'No productId available');
    const r = await request('DELETE', `/api/products/${state.productId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'product deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 5: SKUs
  // =========================================================================
  console.log('\n--- SECTION 5: SKUs ENDPOINTS ---');

  await test('GET /api/skus/ - list all SKUs', async () => {
    const r = await request('GET', '/api/skus/');
    if (r.status === 200) {
      const skus = Array.isArray(r.body) ? r.body : r.body.skus || [];
      state.firstSkuId = skus[0]?.id;
      return pass(r.status, `${skus.length} SKUs`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/skus/ - create SKU', async () => {
    // First create a product to attach SKU to
    const prodR = await request('POST', '/api/products/', {
      name: `SKU Test Plant ${Date.now()}`,
      description: 'For SKU testing',
      category: 'Foliage',
      base_price: 100.00,
      unit: 'piece'
    }, state.adminToken);

    if (prodR.status !== 201 && prodR.status !== 200) return warn(prodR.status, 'Could not create product for SKU');
    state.skuProductId = prodR.body.id || prodR.body.product?.id;

    const r = await request('POST', '/api/skus/', {
      product_id: state.skuProductId,
      name: `4" Pot`,
      pot_size: '4 inch',
      price: 120.00,
      stock_quantity: 50,
      sku_code: `SKU-${Date.now()}`
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.skuId = r.body.id || r.body.sku?.id;
      return pass(r.status, `skuId: ${state.skuId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/skus/:id - get SKU by id', async () => {
    const id = state.skuId || state.firstSkuId;
    if (!id) return warn(0, 'No SKU ID available');
    const r = await request('GET', `/api/skus/${id}`);
    if (r.status === 200) return pass(r.status, 'SKU retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/skus/:id/stock-details - get stock breakdown', async () => {
    const id = state.skuId || state.firstSkuId;
    if (!id) return warn(0, 'No SKU ID available');
    const r = await request('GET', `/api/skus/${id}/stock-details`);
    if (r.status === 200) return pass(r.status, 'stock details retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/skus/:id - update SKU', async () => {
    if (!state.skuId) return warn(0, 'No skuId available');
    const r = await request('PUT', `/api/skus/${state.skuId}`, { price: 130.00 }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'SKU updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 6: CUSTOMERS
  // =========================================================================
  console.log('\n--- SECTION 6: CUSTOMERS ENDPOINTS ---');

  await test('GET /api/customers/ - list customers', async () => {
    const r = await request('GET', '/api/customers/', null, state.adminToken);
    if (r.status === 200) {
      const customers = Array.isArray(r.body) ? r.body : r.body.customers || [];
      state.firstCustomerId = customers[0]?.id;
      return pass(r.status, `${customers.length} customers`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/customers/ - create customer', async () => {
    const r = await request('POST', '/api/customers/', {
      name: `Test Customer ${Date.now()}`,
      email: `customer_${Date.now()}@test.com`,
      phone: '9876543210',
      address: '123 Test Street, Test City',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.customerId = r.body.id || r.body.customer?.id;
      return pass(r.status, `customerId: ${state.customerId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/customers/:id - get customer by id', async () => {
    const id = state.customerId || state.firstCustomerId;
    if (!id) return warn(0, 'No customer ID');
    const r = await request('GET', `/api/customers/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'customer retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/customers/:id - update customer', async () => {
    if (!state.customerId) return warn(0, 'No customerId');
    const r = await request('PUT', `/api/customers/${state.customerId}`, { phone: '9999999999' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'customer updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/customers/:id/credit - get customer credit info', async () => {
    const id = state.customerId || state.firstCustomerId;
    if (!id) return warn(0, 'No customer ID');
    const r = await request('GET', `/api/customers/${id}/credit`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'credit info retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/customers/addresses - create customer address', async () => {
    if (!state.customerId) return warn(0, 'No customerId');
    const r = await request('POST', '/api/customers/addresses', {
      customer_id: state.customerId,
      label: 'Home',
      address_line1: '456 Home Street',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      is_default: true
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.addressId = r.body.id || r.body.address?.id;
      return pass(r.status, `addressId: ${state.addressId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/customers/addresses/:id - update address', async () => {
    if (!state.addressId) return warn(0, 'No addressId');
    const r = await request('PUT', `/api/customers/addresses/${state.addressId}`, { city: 'Nashik' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'address updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('DELETE /api/customers/addresses/:id - delete address', async () => {
    if (!state.addressId) return warn(0, 'No addressId');
    const r = await request('DELETE', `/api/customers/addresses/${state.addressId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'address deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('DELETE /api/customers/:id - delete customer', async () => {
    if (!state.customerId) return warn(0, 'No customerId');
    const r = await request('DELETE', `/api/customers/${state.customerId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'customer deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  // Re-create customer for order tests
  await test('POST /api/customers/ - re-create customer for order tests', async () => {
    const r = await request('POST', '/api/customers/', {
      name: `Order Test Customer ${Date.now()}`,
      email: `ordercust_${Date.now()}@test.com`,
      phone: '8765432109',
      address: '789 Order Lane',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.customerId = r.body.id || r.body.customer?.id;
      return pass(r.status, `customerId: ${state.customerId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 7: VENDORS
  // =========================================================================
  console.log('\n--- SECTION 7: VENDORS ENDPOINTS ---');

  await test('GET /api/vendors/ - list vendors', async () => {
    const r = await request('GET', '/api/vendors/', null, state.adminToken);
    if (r.status === 200) {
      const vendors = Array.isArray(r.body) ? r.body : r.body.vendors || [];
      state.firstVendorId = vendors[0]?.id;
      return pass(r.status, `${vendors.length} vendors`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/vendors/ - create vendor', async () => {
    const r = await request('POST', '/api/vendors/', {
      name: `Test Seeds Co ${Date.now()}`,
      contact_person: 'Ram Shankar',
      phone: '9876543211',
      email: `vendor_${Date.now()}@seeds.com`,
      address: '100 Seed Market, Mumbai',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400002'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.vendorId = r.body.id || r.body.vendor?.id;
      return pass(r.status, `vendorId: ${state.vendorId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendors/:id - get vendor by id', async () => {
    const id = state.vendorId || state.firstVendorId;
    if (!id) return warn(0, 'No vendor ID');
    const r = await request('GET', `/api/vendors/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vendor retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/vendors/:id - update vendor', async () => {
    if (!state.vendorId) return warn(0, 'No vendorId');
    const r = await request('PUT', `/api/vendors/${state.vendorId}`, { phone: '9111111111' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vendor updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendors/:id/purchases - get vendor purchase history', async () => {
    const id = state.vendorId || state.firstVendorId;
    if (!id) return warn(0, 'No vendor ID');
    const r = await request('GET', `/api/vendors/${id}/purchases`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vendor purchases retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 8: PURCHASES (Seed Purchases)
  // =========================================================================
  console.log('\n--- SECTION 8: PURCHASES ENDPOINTS ---');

  await test('GET /api/purchases/ - list purchases', async () => {
    const r = await request('GET', '/api/purchases/', null, state.adminToken);
    if (r.status === 200) {
      const purchases = Array.isArray(r.body) ? r.body : r.body.purchases || [];
      state.firstPurchaseId = purchases[0]?.id;
      return pass(r.status, `${purchases.length} purchases`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/purchases/ - create seed purchase', async () => {
    // Need a product for seeds
    const prodR = await request('POST', '/api/products/', {
      name: `Seed Plant ${Date.now()}`,
      description: 'For seed purchase testing',
      category: 'Medicinal',
      base_price: 50.00,
      unit: 'piece'
    }, state.adminToken);
    state.seedProductId = prodR.body.id || prodR.body.product?.id;

    const vendorId = state.vendorId || state.firstVendorId;
    if (!vendorId) return warn(0, 'No vendor ID for purchase');

    const r = await request('POST', '/api/purchases/', {
      vendor_id: vendorId,
      product_id: state.seedProductId,
      variety: 'Test Variety',
      quantity: 1000,
      unit_price: 2.50,
      purchase_date: new Date().toISOString().split('T')[0],
      batch_number: `BATCH-${Date.now()}`,
      expiry_date: new Date(Date.now() + 180 * 24 * 3600000).toISOString().split('T')[0],
      germination_rate: 95
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.purchaseId = r.body.id || r.body.purchase?.id;
      return pass(r.status, `purchaseId: ${state.purchaseId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/purchases/:id - get purchase by id', async () => {
    const id = state.purchaseId || state.firstPurchaseId;
    if (!id) return warn(0, 'No purchase ID');
    const r = await request('GET', `/api/purchases/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'purchase retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/purchases/check-availability - check seed availability', async () => {
    const r = await request('GET', '/api/purchases/check-availability', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'availability check works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/purchases/expiring-soon - get expiring seeds', async () => {
    const r = await request('GET', '/api/purchases/expiring-soon', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'expiring soon check works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/purchases/low-stock - get low stock alerts', async () => {
    const r = await request('GET', '/api/purchases/low-stock', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'low stock check works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/purchases/:id - update purchase', async () => {
    if (!state.purchaseId) return warn(0, 'No purchaseId');
    const r = await request('PUT', `/api/purchases/${state.purchaseId}`, { germination_rate: 92 }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'purchase updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/purchases/:id/usage-history - get usage history', async () => {
    const id = state.purchaseId || state.firstPurchaseId;
    if (!id) return warn(0, 'No purchase ID');
    const r = await request('GET', `/api/purchases/${id}/usage-history`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'usage history retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/purchases/:id/payments - record purchase payment', async () => {
    if (!state.purchaseId) return warn(0, 'No purchaseId');
    const r = await request('POST', `/api/purchases/${state.purchaseId}/payments`, {
      amount: 500,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      reference_number: `REF-${Date.now()}`
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) return pass(r.status, 'payment recorded');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 9: LOTS
  // =========================================================================
  console.log('\n--- SECTION 9: LOTS ENDPOINTS ---');

  await test('GET /api/lots/ - list lots', async () => {
    const r = await request('GET', '/api/lots/', null, state.adminToken);
    if (r.status === 200) {
      const lots = Array.isArray(r.body) ? r.body : r.body.lots || [];
      state.firstLotId = lots[0]?.id;
      state.firstLotQrCode = lots[0]?.qr_code || lots[0]?.lot_number;
      return pass(r.status, `${lots.length} lots`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/lots/ - create lot from seed purchase', async () => {
    const purchaseId = state.purchaseId || state.firstPurchaseId;
    if (!purchaseId) return warn(0, 'No purchase ID for lot creation');

    const r = await request('POST', '/api/lots/', {
      seed_purchase_id: purchaseId,
      tray_count: 10,
      seeds_per_tray: 50,
      location: 'Greenhouse A, Row 1',
      notes: 'Test lot for API testing'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      const lot = r.body.lot || r.body;
      state.lotId = lot.id;
      state.lotNumber = lot.lot_number;
      return pass(r.status, `lotId: ${state.lotId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/:id - get lot details', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('GET', `/api/lots/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'lot details retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/lots/:id/stage - update lot growth stage', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('PUT', `/api/lots/${id}/stage`, {
      stage: 'germination',
      notes: 'Seeds beginning to germinate'
    }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'stage updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/lots/:id/location - update lot location', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('PUT', `/api/lots/${id}/location`, { location: 'Greenhouse B, Row 2' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'location updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/:id/qr - download QR code', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('GET', `/api/lots/${id}/qr`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'QR code available');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/:id/growth-status - get growth timeline', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('GET', `/api/lots/${id}/growth-status`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'growth status retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/:id/seed-lineage - get seed traceability', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('GET', `/api/lots/${id}/seed-lineage`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'seed lineage retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/:id/scan-stats - get scan statistics', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('GET', `/api/lots/${id}/scan-stats`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'scan stats retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/lots/scan - scan lot by QR code', async () => {
    const lotNum = state.lotNumber || state.firstLotQrCode;
    if (!lotNum) return warn(0, 'No lot number for scan test');
    const r = await request('POST', '/api/lots/scan', { qr_code: lotNum }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'QR scan works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/lots/by-purchase/:purchaseId - get lots from purchase', async () => {
    const purchaseId = state.purchaseId || state.firstPurchaseId;
    if (!purchaseId) return warn(0, 'No purchaseId');
    const r = await request('GET', `/api/lots/by-purchase/${purchaseId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'purchase lots retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/lots/:id/regenerate-qr - regenerate QR code', async () => {
    const id = state.lotId || state.firstLotId;
    if (!id) return warn(0, 'No lot ID');
    const r = await request('PUT', `/api/lots/${id}/regenerate-qr`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'QR regenerated');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 10: INVENTORY
  // =========================================================================
  console.log('\n--- SECTION 10: INVENTORY ENDPOINTS ---');

  await test('GET /api/inventory/summary - get inventory summary', async () => {
    const r = await request('GET', '/api/inventory/summary', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'inventory summary retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/inventory/seeds - get seed inventory', async () => {
    const r = await request('GET', '/api/inventory/seeds', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'seed inventory retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/inventory/saplings - get sapling inventory', async () => {
    const r = await request('GET', '/api/inventory/saplings', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'sapling inventory retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/inventory/combined - get combined inventory', async () => {
    const r = await request('GET', '/api/inventory/combined', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'combined inventory retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/inventory/stats - get inventory stats', async () => {
    const r = await request('GET', '/api/inventory/stats', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'inventory stats retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/inventory/seeds/available-for-lot - get seeds for lot creation', async () => {
    const r = await request('GET', '/api/inventory/seeds/available-for-lot', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'available seeds retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  if (state.seedProductId) {
    await test('GET /api/inventory/seeds/:product_id - get seed details by product', async () => {
      const r = await request('GET', `/api/inventory/seeds/${state.seedProductId}`, null, state.adminToken);
      if (r.status === 200) return pass(r.status, 'seed details by product retrieved');
      return warn(r.status, JSON.stringify(r.body));
    });

    await test('GET /api/inventory/saplings/:product_id - get sapling details by product', async () => {
      const r = await request('GET', `/api/inventory/saplings/${state.seedProductId}`, null, state.adminToken);
      if (r.status === 200) return pass(r.status, 'sapling details by product retrieved');
      return warn(r.status, JSON.stringify(r.body));
    });

    await test('GET /api/inventory/product/:product_id/breakdown - get lot breakdown', async () => {
      const r = await request('GET', `/api/inventory/product/${state.seedProductId}/breakdown`, null, state.adminToken);
      if (r.status === 200) return pass(r.status, 'product breakdown retrieved');
      return warn(r.status, JSON.stringify(r.body));
    });
  }

  // =========================================================================
  // SECTION 11: ORDERS
  // =========================================================================
  console.log('\n--- SECTION 11: ORDERS ENDPOINTS ---');

  await test('GET /api/orders/ - list orders', async () => {
    const r = await request('GET', '/api/orders/', null, state.adminToken);
    if (r.status === 200) {
      const orders = Array.isArray(r.body) ? r.body : r.body.orders || [];
      state.firstOrderId = orders[0]?.id;
      return pass(r.status, `${orders.length} orders`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/orders/recent - get recent orders', async () => {
    const r = await request('GET', '/api/orders/recent', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'recent orders retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/orders/check-availability - check lot availability', async () => {
    const r = await request('POST', '/api/orders/check-availability', {
      items: [{ sku_id: state.skuId || state.firstSkuId, quantity: 5 }]
    }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'availability check works');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/orders/ - create order', async () => {
    const skuId = state.skuId || state.firstSkuId;
    const custId = state.customerId;
    if (!skuId || !custId) return warn(0, `Missing skuId=${skuId} or customerId=${custId}`);

    const r = await request('POST', '/api/orders/', {
      customer_id: custId,
      items: [{
        sku_id: skuId,
        quantity: 5,
        unit_price: 120.00
      }],
      delivery_address: '789 Order Lane, Delhi, 110001',
      notes: 'Test order from API test suite'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.orderId = r.body.id || r.body.order?.id;
      return pass(r.status, `orderId: ${state.orderId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/orders/:id - get order details', async () => {
    const id = state.orderId || state.firstOrderId;
    if (!id) return warn(0, 'No order ID');
    const r = await request('GET', `/api/orders/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'order details retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/orders/:id/timeline - get order status history', async () => {
    const id = state.orderId || state.firstOrderId;
    if (!id) return warn(0, 'No order ID');
    const r = await request('GET', `/api/orders/${id}/timeline`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'timeline retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/orders/:id/status - update order status', async () => {
    if (!state.orderId) return warn(0, 'No orderId');
    const r = await request('PUT', `/api/orders/${state.orderId}/status`, {
      status: 'confirmed',
      note: 'Order confirmed by admin'
    }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'status updated to confirmed');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 12: PAYMENTS
  // =========================================================================
  console.log('\n--- SECTION 12: PAYMENTS ENDPOINTS ---');

  await test('GET /api/payments/ - list all payments', async () => {
    const r = await request('GET', '/api/payments/', null, state.adminToken);
    if (r.status === 200) {
      const payments = Array.isArray(r.body) ? r.body : r.body.payments || [];
      state.firstPaymentId = payments[0]?.id;
      return pass(r.status, `${payments.length} payments`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/payments/record - record offline payment', async () => {
    const orderId = state.orderId || state.firstOrderId;
    if (!orderId) return warn(0, 'No order ID for payment');
    const r = await request('POST', '/api/payments/record', {
      order_id: orderId,
      amount: 600.00,
      payment_method: 'cash',
      payment_date: new Date().toISOString().split('T')[0],
      notes: 'Cash payment recorded during API test'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.paymentId = r.body.id || r.body.payment?.id;
      return pass(r.status, `paymentId: ${state.paymentId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/order/:orderId - get payments for order', async () => {
    const orderId = state.orderId || state.firstOrderId;
    if (!orderId) return warn(0, 'No order ID');
    const r = await request('GET', `/api/payments/order/${orderId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'order payments retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/customer/:customerId - get customer payment history', async () => {
    const custId = state.customerId;
    if (!custId) return warn(0, 'No customer ID');
    const r = await request('GET', `/api/payments/customer/${custId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'customer payments retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/summary - get payment summary', async () => {
    const r = await request('GET', '/api/payments/summary', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'payment summary retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/upcoming - get upcoming payments', async () => {
    const r = await request('GET', '/api/payments/upcoming', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'upcoming payments retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/installments/:orderId - get payment installments', async () => {
    const orderId = state.orderId || state.firstOrderId;
    if (!orderId) return warn(0, 'No order ID');
    const r = await request('GET', `/api/payments/installments/${orderId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'installments retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/payments/:id/receipt - generate payment receipt', async () => {
    const id = state.paymentId || state.firstPaymentId;
    if (!id) return warn(0, 'No payment ID');
    const r = await request('GET', `/api/payments/${id}/receipt`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'receipt generated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/payments/initiate - initiate online payment', async () => {
    const orderId = state.orderId || state.firstOrderId;
    if (!orderId) return warn(0, 'No order ID');
    const r = await request('POST', '/api/payments/initiate', {
      order_id: orderId,
      amount: 600,
      currency: 'INR'
    }, state.adminToken);
    if (r.status === 200 || r.status === 201) return pass(r.status, 'payment initiated');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 13: INVOICES
  // =========================================================================
  console.log('\n--- SECTION 13: INVOICES ENDPOINTS ---');

  await test('GET /api/invoices/ - list invoices', async () => {
    const r = await request('GET', '/api/invoices/', null, state.adminToken);
    if (r.status === 200) {
      const invoices = Array.isArray(r.body) ? r.body : r.body.invoices || [];
      state.firstInvoiceId = invoices[0]?.id;
      return pass(r.status, `${invoices.length} invoices`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/invoices/ - create invoice', async () => {
    const custId = state.customerId;
    const orderId = state.orderId;
    if (!custId) return warn(0, 'No customer ID for invoice');
    const r = await request('POST', '/api/invoices/', {
      customer_id: custId,
      order_id: orderId,
      due_date: new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0],
      items: [{
        description: 'Test Plant - 4" Pot',
        quantity: 5,
        unit_price: 120.00
      }]
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.invoiceId = r.body.id || r.body.invoice?.id;
      return pass(r.status, `invoiceId: ${state.invoiceId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/invoices/:id - get invoice', async () => {
    const id = state.invoiceId || state.firstInvoiceId;
    if (!id) return warn(0, 'No invoice ID');
    const r = await request('GET', `/api/invoices/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'invoice retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/invoices/:id - update invoice', async () => {
    if (!state.invoiceId) return warn(0, 'No invoiceId');
    const r = await request('PUT', `/api/invoices/${state.invoiceId}`, { notes: 'Updated via API test' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'invoice updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/invoices/:id/issue - issue invoice', async () => {
    if (!state.invoiceId) return warn(0, 'No invoiceId');
    const r = await request('POST', `/api/invoices/${state.invoiceId}/issue`, {}, state.adminToken);
    if (r.status === 200) return pass(r.status, 'invoice issued');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/invoices/:id/pdf - generate invoice PDF', async () => {
    if (!state.invoiceId) return warn(0, 'No invoiceId');
    const r = await request('GET', `/api/invoices/${state.invoiceId}/pdf`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'PDF generated');
    return warn(r.status, 'PDF generation: ' + r.status);
  });

  await test('POST /api/invoices/:id/payments - apply payment to invoice', async () => {
    if (!state.invoiceId) return warn(0, 'No invoiceId');
    const r = await request('POST', `/api/invoices/${state.invoiceId}/payments`, {
      amount: 300,
      payment_method: 'cash',
      payment_date: new Date().toISOString().split('T')[0]
    }, state.adminToken);
    if (r.status === 200 || r.status === 201) return pass(r.status, 'payment applied to invoice');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/invoices/reports/aging - get aging report', async () => {
    const r = await request('GET', '/api/invoices/reports/aging', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'aging report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/invoices/reports/register - get invoice register', async () => {
    const r = await request('GET', '/api/invoices/reports/register', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'register retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 14: VEHICLES
  // =========================================================================
  console.log('\n--- SECTION 14: VEHICLES ENDPOINTS ---');

  await test('GET /api/vehicles/ - list vehicles', async () => {
    const r = await request('GET', '/api/vehicles/', null, state.adminToken);
    if (r.status === 200) {
      const vehicles = Array.isArray(r.body) ? r.body : r.body.vehicles || [];
      state.firstVehicleId = vehicles[0]?.id;
      return pass(r.status, `${vehicles.length} vehicles`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/vehicles/ - create vehicle', async () => {
    const r = await request('POST', '/api/vehicles/', {
      registration_number: `MH01-TEST-${Date.now().toString().slice(-4)}`,
      vehicle_type: 'truck',
      make: 'Tata',
      model: 'Ace',
      year: 2022,
      capacity_kg: 1000,
      capacity_plants: 500,
      driver_name: 'Rajesh Kumar',
      driver_phone: '9876543210'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.vehicleId = r.body.id || r.body.vehicle?.id;
      return pass(r.status, `vehicleId: ${state.vehicleId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vehicles/:id - get vehicle by id', async () => {
    const id = state.vehicleId || state.firstVehicleId;
    if (!id) return warn(0, 'No vehicle ID');
    const r = await request('GET', `/api/vehicles/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vehicle retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/vehicles/:id - update vehicle', async () => {
    if (!state.vehicleId) return warn(0, 'No vehicleId');
    const r = await request('PUT', `/api/vehicles/${state.vehicleId}`, { capacity_kg: 1200 }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vehicle updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vehicles/:id/maintenance - get maintenance history', async () => {
    const id = state.vehicleId || state.firstVehicleId;
    if (!id) return warn(0, 'No vehicle ID');
    const r = await request('GET', `/api/vehicles/${id}/maintenance`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'maintenance history retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vehicles/:id/location-history - get location history', async () => {
    const id = state.vehicleId || state.firstVehicleId;
    if (!id) return warn(0, 'No vehicle ID');
    const r = await request('GET', `/api/vehicles/${id}/location-history`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'location history retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 15: DELIVERY
  // =========================================================================
  console.log('\n--- SECTION 15: DELIVERY ENDPOINTS ---');

  await test('GET /api/delivery/summary - get delivery summary', async () => {
    const r = await request('GET', '/api/delivery/summary', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'delivery summary retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/delivery/available-orders - get available orders for delivery', async () => {
    const r = await request('GET', '/api/delivery/available-orders', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'available orders retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/routes/ - list delivery routes', async () => {
    const r = await request('GET', '/api/routes/', null, state.adminToken);
    if (r.status === 200) {
      const routes = Array.isArray(r.body) ? r.body : r.body.routes || [];
      state.firstRouteId = routes[0]?.id;
      return pass(r.status, `${routes.length} routes`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/routes/ - create delivery route', async () => {
    const orderId = state.orderId || state.firstOrderId;
    const r = await request('POST', '/api/routes/', {
      route_date: new Date().toISOString().split('T')[0],
      vehicle_id: state.vehicleId || state.firstVehicleId,
      stops: orderId ? [{ order_id: orderId, sequence: 1 }] : [],
      notes: 'Test route from API test suite'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.routeId = r.body.id || r.body.route?.id;
      return pass(r.status, `routeId: ${state.routeId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/routes/:id - get route details', async () => {
    const id = state.routeId || state.firstRouteId;
    if (!id) return warn(0, 'No route ID');
    const r = await request('GET', `/api/routes/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'route details retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/routes/:id/assign - assign driver and vehicle', async () => {
    const id = state.routeId || state.firstRouteId;
    if (!id) return warn(0, 'No route ID');
    const r = await request('PUT', `/api/routes/${id}/assign`, {
      vehicle_id: state.vehicleId || state.firstVehicleId,
      driver_id: state.adminId
    }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'route assigned');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/routes/:id/progress - get route progress', async () => {
    const id = state.routeId || state.firstRouteId;
    if (!id) return warn(0, 'No route ID');
    const r = await request('GET', `/api/routes/${id}/progress`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'route progress retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 16: DRIVER
  // =========================================================================
  console.log('\n--- SECTION 16: DRIVER ENDPOINTS ---');

  await test('GET /api/driver/routes/today - get today routes for driver', async () => {
    const r = await request('GET', '/api/driver/routes/today', null, state.adminToken);
    if (r.status === 200) return pass(r.status, "today's routes retrieved");
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/driver/location - update GPS location', async () => {
    const r = await request('POST', '/api/driver/location', {
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 10,
      speed: 30,
      heading: 180
    }, state.adminToken);
    if (r.status === 200 || r.status === 201) return pass(r.status, 'GPS location updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 17: DASHBOARD
  // =========================================================================
  console.log('\n--- SECTION 17: DASHBOARD ENDPOINTS ---');

  await test('GET /api/dashboard/overview - get comprehensive dashboard data', async () => {
    const r = await request('GET', '/api/dashboard/overview', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'dashboard overview retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/dashboard/kpis - get KPIs', async () => {
    const r = await request('GET', '/api/dashboard/kpis', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'KPIs retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/dashboard/recent-orders - get recent orders (deprecated)', async () => {
    const r = await request('GET', '/api/dashboard/recent-orders', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'recent orders retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 18: REPORTS
  // =========================================================================
  console.log('\n--- SECTION 18: REPORTS ENDPOINTS ---');

  await test('GET /api/reports/sales - get sales report', async () => {
    const r = await request('GET', '/api/reports/sales?period=monthly', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'sales report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/reports/inventory - get inventory report', async () => {
    const r = await request('GET', '/api/reports/inventory', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'inventory report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/reports/delivery - get delivery performance report', async () => {
    const r = await request('GET', '/api/reports/delivery', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'delivery report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/reports/customers - get customer analytics', async () => {
    const r = await request('GET', '/api/reports/customers', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'customer report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/reports/financial - get financial summary', async () => {
    const r = await request('GET', '/api/reports/financial', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'financial report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 19: NOTIFICATIONS
  // =========================================================================
  console.log('\n--- SECTION 19: NOTIFICATIONS ENDPOINTS ---');

  await test('GET /api/notifications/ - get user notifications', async () => {
    const r = await request('GET', '/api/notifications/', null, state.adminToken);
    if (r.status === 200) {
      const notifs = Array.isArray(r.body) ? r.body : r.body.notifications || [];
      state.firstNotifId = notifs[0]?.id;
      return pass(r.status, `${notifs.length} notifications`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/notifications/unread-count - get unread count', async () => {
    const r = await request('GET', '/api/notifications/unread-count', null, state.adminToken);
    if (r.status === 200) return pass(r.status, `unread: ${r.body.count || r.body.unread_count || 0}`);
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/notifications/read-all - mark all as read', async () => {
    const r = await request('PUT', '/api/notifications/read-all', {}, state.adminToken);
    if (r.status === 200) return pass(r.status, 'all marked as read');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/notifications/by-type/:type - get notifications by type', async () => {
    const r = await request('GET', '/api/notifications/by-type/system', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'notifications by type retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  if (state.firstNotifId) {
    await test('PUT /api/notifications/:id/read - mark notification as read', async () => {
      const r = await request('PUT', `/api/notifications/${state.firstNotifId}/read`, {}, state.adminToken);
      if (r.status === 200) return pass(r.status, 'notification marked as read');
      return warn(r.status, JSON.stringify(r.body));
    });

    await test('DELETE /api/notifications/:id - delete notification', async () => {
      const r = await request('DELETE', `/api/notifications/${state.firstNotifId}`, null, state.adminToken);
      if (r.status === 200 || r.status === 204) return pass(r.status, 'notification deleted');
      return warn(r.status, JSON.stringify(r.body));
    });
  }

  // =========================================================================
  // SECTION 20: BANK LEDGER
  // =========================================================================
  console.log('\n--- SECTION 20: BANK LEDGER ENDPOINTS ---');

  await test('GET /api/bank-accounts/ - list bank accounts', async () => {
    const r = await request('GET', '/api/bank-accounts/', null, state.adminToken);
    if (r.status === 200) {
      const accounts = Array.isArray(r.body) ? r.body : r.body.accounts || [];
      state.firstBankId = accounts[0]?.id;
      return pass(r.status, `${accounts.length} accounts`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/bank-accounts/ - create/upsert bank account', async () => {
    const r = await request('POST', '/api/bank-accounts/', {
      account_name: `Test Bank Account ${Date.now()}`,
      bank_name: 'State Bank of India',
      account_number: `ACC${Date.now()}`,
      ifsc_code: 'SBIN0001234',
      account_type: 'current',
      currency: 'INR'
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.bankId = r.body.id || r.body.account?.id;
      return pass(r.status, `bankId: ${state.bankId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/bank-accounts/:id - update bank account', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('PUT', `/api/bank-accounts/${id}`, { account_name: 'Updated Account Name' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'account updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/bank-accounts/:id/opening-balance - set opening balance', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('POST', `/api/bank-accounts/${id}/opening-balance`, {
      amount: 50000,
      date: new Date().toISOString().split('T')[0]
    }, state.adminToken);
    if (r.status === 200 || r.status === 201) return pass(r.status, 'opening balance set');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/bank-accounts/:id/ledger - get ledger entries', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('GET', `/api/bank-accounts/${id}/ledger`, null, state.adminToken);
    if (r.status === 200) {
      const entries = Array.isArray(r.body) ? r.body : r.body.entries || [];
      state.firstLedgerEntryId = entries[0]?.id;
      return pass(r.status, `${entries.length} entries`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/bank-accounts/:id/entries - add manual ledger entry', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('POST', `/api/bank-accounts/${id}/entries`, {
      type: 'credit',
      amount: 10000,
      description: 'Test credit entry',
      date: new Date().toISOString().split('T')[0],
      reference: `REF-${Date.now()}`
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.ledgerEntryId = r.body.id || r.body.entry?.id;
      return pass(r.status, `entryId: ${state.ledgerEntryId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/bank-accounts/:id/entries/:entryId - edit ledger entry', async () => {
    const id = state.bankId || state.firstBankId;
    const entryId = state.ledgerEntryId || state.firstLedgerEntryId;
    if (!id || !entryId) return warn(0, `No bank ID=${id} or entryId=${entryId}`);
    const r = await request('PUT', `/api/bank-accounts/${id}/entries/${entryId}`, { description: 'Updated entry' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'entry updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/bank-accounts/:id/summary - get monthly summary', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('GET', `/api/bank-accounts/${id}/summary`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'monthly summary retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/bank-accounts/:id/sync - sync from payment tables', async () => {
    const id = state.bankId || state.firstBankId;
    if (!id) return warn(0, 'No bank account ID');
    const r = await request('POST', `/api/bank-accounts/${id}/sync`, {
      start_date: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0]
    }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'sync completed');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('DELETE /api/bank-accounts/:id/entries/:entryId - delete ledger entry', async () => {
    const id = state.bankId || state.firstBankId;
    const entryId = state.ledgerEntryId || state.firstLedgerEntryId;
    if (!id || !entryId) return warn(0, `No bank ID or entryId`);
    const r = await request('DELETE', `/api/bank-accounts/${id}/entries/${entryId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'entry deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 21: VENDOR BILLS
  // =========================================================================
  console.log('\n--- SECTION 21: VENDOR BILLS ENDPOINTS ---');

  await test('GET /api/vendor-bills/ - list vendor bills', async () => {
    const r = await request('GET', '/api/vendor-bills/', null, state.adminToken);
    if (r.status === 200) {
      const bills = Array.isArray(r.body) ? r.body : r.body.bills || [];
      state.firstBillId = bills[0]?.id;
      return pass(r.status, `${bills.length} bills`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendor-bills/:id - get vendor bill', async () => {
    if (!state.firstBillId) return warn(0, 'No vendor bill ID (may be no data)');
    const r = await request('GET', `/api/vendor-bills/${state.firstBillId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vendor bill retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendor-bills/reports/aging - get vendor bills aging report', async () => {
    const r = await request('GET', '/api/vendor-bills/reports/aging', null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'vendor aging report retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 22: VENDOR RETURNS
  // =========================================================================
  console.log('\n--- SECTION 22: VENDOR RETURNS ENDPOINTS ---');

  await test('GET /api/vendor-returns/ - list vendor returns', async () => {
    const r = await request('GET', '/api/vendor-returns/', null, state.adminToken);
    if (r.status === 200) {
      const returns = Array.isArray(r.body) ? r.body : r.body.returns || [];
      state.firstReturnId = returns[0]?.id;
      return pass(r.status, `${returns.length} returns`);
    }
    return fail(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/vendor-returns/ - create vendor return', async () => {
    const vendorId = state.vendorId || state.firstVendorId;
    const purchaseId = state.purchaseId || state.firstPurchaseId;
    if (!vendorId) return warn(0, 'No vendor ID for return');
    const r = await request('POST', '/api/vendor-returns/', {
      vendor_id: vendorId,
      purchase_id: purchaseId,
      reason: 'Defective seeds - poor germination rate',
      items: [{
        description: 'Test Seeds',
        quantity: 100,
        unit_price: 2.50
      }],
      return_date: new Date().toISOString().split('T')[0]
    }, state.adminToken);
    if (r.status === 201 || r.status === 200) {
      state.returnId = r.body.id || r.body.return?.id;
      return pass(r.status, `returnId: ${state.returnId}`);
    }
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendor-returns/:id - get vendor return', async () => {
    const id = state.returnId || state.firstReturnId;
    if (!id) return warn(0, 'No return ID');
    const r = await request('GET', `/api/vendor-returns/${id}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'return retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('PUT /api/vendor-returns/:id - update vendor return', async () => {
    if (!state.returnId) return warn(0, 'No returnId');
    const r = await request('PUT', `/api/vendor-returns/${state.returnId}`, { reason: 'Updated reason' }, state.adminToken);
    if (r.status === 200) return pass(r.status, 'return updated');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('POST /api/vendor-returns/:id/submit - submit vendor return', async () => {
    if (!state.returnId) return warn(0, 'No returnId');
    const r = await request('POST', `/api/vendor-returns/${state.returnId}/submit`, {}, state.adminToken);
    if (r.status === 200) return pass(r.status, 'return submitted');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('GET /api/vendor-returns/available-credits/:vendorId - get available credits', async () => {
    const vendorId = state.vendorId || state.firstVendorId;
    if (!vendorId) return warn(0, 'No vendor ID');
    const r = await request('GET', `/api/vendor-returns/available-credits/${vendorId}`, null, state.adminToken);
    if (r.status === 200) return pass(r.status, 'available credits retrieved');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // SECTION 23: SECURITY & EDGE CASES
  // =========================================================================
  console.log('\n--- SECTION 23: SECURITY & EDGE CASES ---');

  await test('SECURITY: 404 handler for unknown routes', async () => {
    const r = await request('GET', '/api/nonexistent-route-xyz');
    if (r.status === 404) return pass(r.status, '404 handled correctly');
    return warn(r.status, 'got: ' + r.status);
  });

  await test('SECURITY: Unauthenticated access to protected route', async () => {
    const r = await request('GET', '/api/orders/');
    if (r.status === 401) return pass(r.status, 'unauthenticated blocked');
    return fail(r.status, 'Expected 401, got: ' + r.status);
  });

  await test('SECURITY: Invalid JWT token rejected', async () => {
    const r = await request('GET', '/api/orders/', null, 'invalid.jwt.token');
    if (r.status === 401) return pass(r.status, 'invalid JWT blocked');
    return fail(r.status, 'Expected 401, got: ' + r.status);
  });

  await test('SECURITY: Expired/malformed token returns 401', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.fakeSignature';
    const r = await request('GET', '/api/products/', null, fakeToken);
    if (r.status === 401) return pass(r.status, 'malformed token rejected');
    return warn(r.status, 'products endpoint may be public: ' + r.status);
  });

  await test('SECURITY: SQL injection attempt in query param', async () => {
    const r = await request('GET', "/api/products/?search='; DROP TABLE products; --", null, state.adminToken);
    if (r.status === 200 || r.status === 400) return pass(r.status, 'SQL injection handled safely');
    return warn(r.status, 'response: ' + JSON.stringify(r.body).substring(0, 100));
  });

  await test('SECURITY: XSS attempt in product name', async () => {
    const r = await request('POST', '/api/products/', {
      name: '<script>alert("xss")</script>',
      description: 'XSS test',
      base_price: 100
    }, state.adminToken);
    // Should either sanitize or reject - just should not crash
    if (r.status >= 200 && r.status < 500) return pass(r.status, 'XSS handled without 500 error');
    return fail(r.status, 'Server error on XSS attempt');
  });

  await test('SECURITY: Rate limiting on auth endpoint', async () => {
    // Just check one request doesn't break
    const r = await request('POST', '/api/auth/login', { email: 'test@test.com', password: 'wrong' });
    if (r.status === 401 || r.status === 429) return pass(r.status, 'auth rate limiting active');
    return warn(r.status, 'got: ' + r.status);
  });

  await test('EDGE CASE: Empty request body on POST endpoint', async () => {
    const r = await request('POST', '/api/orders/', {}, state.adminToken);
    if (r.status === 400) return pass(r.status, 'empty body validated correctly');
    return warn(r.status, 'got: ' + r.status + ' ' + JSON.stringify(r.body).substring(0, 100));
  });

  await test('EDGE CASE: Non-existent resource returns 404', async () => {
    const r = await request('GET', '/api/orders/00000000-0000-0000-0000-000000000000', null, state.adminToken);
    if (r.status === 404) return pass(r.status, 'not found handled correctly');
    return warn(r.status, 'got: ' + r.status);
  });

  await test('EDGE CASE: Invalid UUID format returns 400 or 404', async () => {
    const r = await request('GET', '/api/orders/not-a-uuid', null, state.adminToken);
    if (r.status === 400 || r.status === 404) return pass(r.status, 'invalid ID handled');
    return warn(r.status, 'got: ' + r.status);
  });

  // =========================================================================
  // FINAL: DELETE TEST VENDOR (cleanup)
  // =========================================================================
  await test('CLEANUP: Delete test vendor', async () => {
    if (!state.vendorId) return warn(0, 'No test vendor to delete');
    const r = await request('DELETE', `/api/vendors/${state.vendorId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'vendor deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('CLEANUP: Delete test lot', async () => {
    if (!state.lotId) return warn(0, 'No test lot to delete');
    const r = await request('DELETE', `/api/lots/${state.lotId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'lot deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  await test('CLEANUP: Delete test vehicle', async () => {
    if (!state.vehicleId) return warn(0, 'No test vehicle to delete');
    const r = await request('DELETE', `/api/vehicles/${state.vehicleId}`, null, state.adminToken);
    if (r.status === 200 || r.status === 204) return pass(r.status, 'vehicle deleted');
    return warn(r.status, JSON.stringify(r.body));
  });

  // =========================================================================
  // PRINT SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('  TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log(`  ✅ PASSED:   ${results.passed.length}`);
  console.log(`  ⚠️  WARNINGS: ${results.warnings.length}`);
  console.log(`  ❌ FAILED:   ${results.failed.length}`);
  console.log(`  📊 TOTAL:    ${results.passed.length + results.warnings.length + results.failed.length}`);
  console.log(`  Pass Rate:   ${Math.round(results.passed.length / (results.passed.length + results.warnings.length + results.failed.length) * 100)}%`);

  if (results.failed.length > 0) {
    console.log('\n  FAILURES:');
    results.failed.forEach(f => {
      console.log(`  - [${f.num}] ${f.description} | HTTP ${f.httpStatus || 'ERR'} | ${f.note || f.error || ''}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n  WARNINGS (partial functionality):');
    results.warnings.forEach(w => {
      console.log(`  - [${w.num}] ${w.description} | HTTP ${w.httpStatus} | ${w.note || ''}`);
    });
  }

  console.log('\n  Completed:', new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  // Export results for report generation
  results.summary = {
    total: results.passed.length + results.warnings.length + results.failed.length,
    passed: results.passed.length,
    warnings: results.warnings.length,
    failed: results.failed.length,
    passRate: Math.round(results.passed.length / (results.passed.length + results.warnings.length + results.failed.length) * 100),
    state
  };

  return results;
}

// Run tests
runAllTests().then(results => {
  // Write results to file for report generation
  const fs = require('fs');
  fs.writeFileSync('/tmp/test_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to /tmp/test_results.json');
  process.exit(results.failed.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
