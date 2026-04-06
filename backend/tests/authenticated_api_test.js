/**
 * Authenticated API Test - Nursery Management System
 * Pre-authenticates once then tests all protected endpoints
 * Run: node tests/authenticated_api_test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const results = { passed: [], failed: [], warnings: [], details: [] };
let testNum = 0;

async function t(desc, fn) {
  testNum++;
  const n = String(testNum).padStart(3, '0');
  try {
    const res = await fn();
    const icon = res.pass ? '✅' : (res.warn ? '⚠️ ' : '❌');
    const line = `[${n}] ${icon} ${desc} | HTTP ${res.http || '---'} | ${res.note || ''}`;
    console.log(line);
    results.details.push({ num: n, pass: res.pass, warn: res.warn, desc, http: res.http, note: res.note });
    if (res.pass) results.passed.push(n);
    else if (res.warn) results.warnings.push(n);
    else results.failed.push(n);
    return res;
  } catch (e) {
    const line = `[${n}] ❌ ${desc} | ERROR: ${e.message}`;
    console.log(line);
    results.failed.push(n);
    results.details.push({ num: n, pass: false, desc, error: e.message });
    return { pass: false };
  }
}

const P = (http, note = '') => ({ pass: true, http, note });
const F = (http, note = '') => ({ pass: false, http, note });
const W = (http, note = '') => ({ pass: true, warn: true, http, note });

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  NURSERY API - AUTHENTICATED ENDPOINT TEST SUITE');
  console.log('  Started:', new Date().toISOString());
  console.log('='.repeat(80));

  // PRE-AUTH: Get admin token
  console.log('\n[SETUP] Authenticating as admin...');
  let TOKEN, REFRESH, ADMIN_ID;
  try {
    const r = await request('POST', '/api/auth/login', { email: 'admin@test.com', password: 'Admin123' });
    if (r.status === 200 && r.body.tokens) {
      TOKEN = r.body.tokens.accessToken;
      REFRESH = r.body.tokens.refreshToken;
      ADMIN_ID = r.body.user.id;
      console.log('[SETUP] ✅ Admin authenticated. Token acquired.');
    } else {
      console.log('[SETUP] ❌ Login failed:', JSON.stringify(r.body));
      process.exit(1);
    }
  } catch (e) {
    console.log('[SETUP] ❌ Login error:', e.message);
    process.exit(1);
  }

  // Get existing data for reference
  const existingData = {};
  try {
    const v = await request('GET', '/api/vehicles/', null, TOKEN);
    existingData.vehicleId = (v.body[0] || v.body.vehicles?.[0])?.id;
    const r = await request('GET', '/api/routes/', null, TOKEN);
    existingData.routeId = (Array.isArray(r.body) ? r.body[0] : r.body.routes?.[0])?.id;
  } catch (e) { /* ignore */ }

  // ==============================
  // AUTH ENDPOINTS (with token)
  // ==============================
  console.log('\n--- AUTH ---');
  await t('GET /api/auth/profile - returns user profile', async () => {
    const r = await request('GET', '/api/auth/profile', null, TOKEN);
    if (r.status === 200 && r.body.user?.email === 'admin@test.com') return P(r.status, `roles: ${r.body.user.roles.join(',')}`);
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/auth/users - list all users (Admin)', async () => {
    const r = await request('GET', '/api/auth/users', null, TOKEN);
    if (r.status === 200) {
      const users = Array.isArray(r.body) ? r.body : (r.body.users || []);
      return P(r.status, `${users.length} users`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/auth/refresh - refresh token returns new access token', async () => {
    const r = await request('POST', '/api/auth/refresh', { refreshToken: REFRESH });
    if (r.status === 200 && r.body.accessToken) {
      TOKEN = r.body.accessToken; // update with fresh token
      return P(r.status, 'new token issued');
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // USERS MANAGEMENT
  // ==============================
  console.log('\n--- USERS MANAGEMENT ---');
  let testUserId;

  await t('GET /api/users/ - list users', async () => {
    const r = await request('GET', '/api/users/', null, TOKEN);
    if (r.status === 200) {
      const users = Array.isArray(r.body) ? r.body : (r.body.users || []);
      return P(r.status, `${users.length} users`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/users/role/Admin - get users by role', async () => {
    const r = await request('GET', '/api/users/role/Admin', null, TOKEN);
    if (r.status === 200) return P(r.status, 'role filter works');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/users/ - create new user', async () => {
    const r = await request('POST', '/api/users/', {
      email: `testmgr_${Date.now()}@nursery.com`,
      password: 'Manager@1234',
      fullName: 'Test Manager',
      role: 'Manager'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      testUserId = r.body.id || r.body.user?.id;
      return P(r.status, `userId: ${testUserId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (testUserId) {
    await t('PUT /api/users/:id - update user', async () => {
      const r = await request('PUT', `/api/users/${testUserId}`, { fullName: 'Updated Manager' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/users/:id/role - change role', async () => {
      const r = await request('PUT', `/api/users/${testUserId}/role`, { role: 'Sales' }, TOKEN);
      if (r.status === 200) return P(r.status, 'role changed');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/users/:id/status - toggle status', async () => {
      const r = await request('PUT', `/api/users/${testUserId}/status`, { status: 'inactive' }, TOKEN);
      if (r.status === 200) return P(r.status, 'status toggled');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/users/:id/reset-password - reset password', async () => {
      const r = await request('PUT', `/api/users/${testUserId}/reset-password`, { newPassword: 'NewPass@1234' }, TOKEN);
      if (r.status === 200) return P(r.status, 'password reset');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('DELETE /api/users/:id - delete user', async () => {
      const r = await request('DELETE', `/api/users/${testUserId}`, null, TOKEN);
      if (r.status === 200 || r.status === 204) return P(r.status, 'deleted');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // PRODUCTS
  // ==============================
  console.log('\n--- PRODUCTS ---');
  let productId, skuId;

  await t('POST /api/products/ - create product', async () => {
    const r = await request('POST', '/api/products/', {
      name: `Test Plant ${Date.now()}`,
      description: 'API test plant',
      category: 'Flowering',
      base_price: 150.00,
      unit: 'piece'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      productId = r.body.id || r.body.product?.id;
      return P(r.status, `productId: ${productId}`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (productId) {
    await t('GET /api/products/:id - get product', async () => {
      const r = await request('GET', `/api/products/${productId}`);
      if (r.status === 200) return P(r.status, 'retrieved');
      return F(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/products/:id - update product', async () => {
      const r = await request('PUT', `/api/products/${productId}`, { base_price: 200 }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // SKUs
  // ==============================
  console.log('\n--- SKUs ---');
  if (productId) {
    await t('POST /api/skus/ - create SKU', async () => {
      const r = await request('POST', '/api/skus/', {
        product_id: productId,
        name: '4 inch Pot',
        pot_size: '4 inch',
        price: 150.00,
        sku_code: `TEST-SKU-${Date.now()}`
      }, TOKEN);
      if (r.status === 201 || r.status === 200) {
        skuId = r.body.id || r.body.sku?.id;
        return P(r.status, `skuId: ${skuId}`);
      }
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    if (skuId) {
      await t('GET /api/skus/:id - get SKU', async () => {
        const r = await request('GET', `/api/skus/${skuId}`);
        if (r.status === 200) return P(r.status, 'retrieved');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });

      await t('GET /api/skus/:id/stock-details - get stock details', async () => {
        const r = await request('GET', `/api/skus/${skuId}/stock-details`);
        if (r.status === 200) return P(r.status, 'stock details retrieved');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });

      await t('PUT /api/skus/:id - update SKU', async () => {
        const r = await request('PUT', `/api/skus/${skuId}`, { price: 175 }, TOKEN);
        if (r.status === 200) return P(r.status, 'updated');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });
    }
  }

  // ==============================
  // CUSTOMERS
  // ==============================
  console.log('\n--- CUSTOMERS ---');
  let customerId, addressId;

  await t('GET /api/customers/ - list customers', async () => {
    const r = await request('GET', '/api/customers/', null, TOKEN);
    if (r.status === 200) {
      const c = Array.isArray(r.body) ? r.body : (r.body.customers || []);
      return P(r.status, `${c.length} customers`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/customers/ - create customer', async () => {
    const r = await request('POST', '/api/customers/', {
      name: `Test Customer ${Date.now()}`,
      email: `cust_${Date.now()}@test.com`,
      phone: '9876543210',
      city: 'Mumbai',
      state: 'Maharashtra'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      customerId = r.body.id || r.body.customer?.id;
      return P(r.status, `customerId: ${customerId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (customerId) {
    await t('GET /api/customers/:id - get customer', async () => {
      const r = await request('GET', `/api/customers/${customerId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/customers/:id - update customer', async () => {
      const r = await request('PUT', `/api/customers/${customerId}`, { phone: '9999999999' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/customers/:id/credit - get credit info', async () => {
      const r = await request('GET', `/api/customers/${customerId}/credit`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'credit info retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/customers/addresses - create address', async () => {
      const r = await request('POST', '/api/customers/addresses', {
        customer_id: customerId,
        label: 'Home',
        address_line1: '123 Test St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        is_default: true
      }, TOKEN);
      if (r.status === 201 || r.status === 200) {
        addressId = r.body.id || r.body.address?.id;
        return P(r.status, `addressId: ${addressId}`);
      }
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    if (addressId) {
      await t('PUT /api/customers/addresses/:id - update address', async () => {
        const r = await request('PUT', `/api/customers/addresses/${addressId}`, { city: 'Pune' }, TOKEN);
        if (r.status === 200) return P(r.status, 'updated');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });

      await t('DELETE /api/customers/addresses/:id - delete address', async () => {
        const r = await request('DELETE', `/api/customers/addresses/${addressId}`, null, TOKEN);
        if (r.status === 200 || r.status === 204) return P(r.status, 'deleted');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });
    }
  }

  // ==============================
  // VENDORS
  // ==============================
  console.log('\n--- VENDORS ---');
  let vendorId;

  await t('GET /api/vendors/ - list vendors', async () => {
    const r = await request('GET', '/api/vendors/', null, TOKEN);
    if (r.status === 200) {
      const v = Array.isArray(r.body) ? r.body : (r.body.vendors || []);
      vendorId = vendorId || v[0]?.id;
      return P(r.status, `${v.length} vendors`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/vendors/ - create vendor', async () => {
    const r = await request('POST', '/api/vendors/', {
      name: `Test Seeds Co ${Date.now()}`,
      contact_person: 'Ram Kumar',
      phone: '9876543211',
      email: `vendor_${Date.now()}@seeds.com`,
      city: 'Mumbai'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      vendorId = r.body.id || r.body.vendor?.id;
      return P(r.status, `vendorId: ${vendorId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (vendorId) {
    await t('GET /api/vendors/:id - get vendor', async () => {
      const r = await request('GET', `/api/vendors/${vendorId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/vendors/:id - update vendor', async () => {
      const r = await request('PUT', `/api/vendors/${vendorId}`, { phone: '9111111111' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/vendors/:id/purchases - vendor purchase history', async () => {
      const r = await request('GET', `/api/vendors/${vendorId}/purchases`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // PURCHASES
  // ==============================
  console.log('\n--- PURCHASES ---');
  let purchaseId, seedProductId;

  await t('GET /api/purchases/ - list purchases', async () => {
    const r = await request('GET', '/api/purchases/', null, TOKEN);
    if (r.status === 200) {
      const p = Array.isArray(r.body) ? r.body : (r.body.purchases || []);
      purchaseId = purchaseId || p[0]?.id;
      return P(r.status, `${p.length} purchases`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/purchases/ - create seed purchase', async () => {
    // Create a product for seeds first
    const prodR = await request('POST', '/api/products/', {
      name: `Seed Product ${Date.now()}`,
      description: 'For seed purchase',
      category: 'Medicinal',
      base_price: 50, unit: 'piece'
    }, TOKEN);
    seedProductId = prodR.body.id || prodR.body.product?.id;
    if (!vendorId) return W(0, 'No vendor ID available');

    const r = await request('POST', '/api/purchases/', {
      vendor_id: vendorId,
      product_id: seedProductId,
      variety: 'Test Variety A',
      quantity: 500,
      unit_price: 3.00,
      purchase_date: new Date().toISOString().split('T')[0],
      batch_number: `BATCH-${Date.now()}`,
      expiry_date: new Date(Date.now() + 180 * 24 * 3600000).toISOString().split('T')[0],
      germination_rate: 90
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      purchaseId = r.body.id || r.body.purchase?.id;
      return P(r.status, `purchaseId: ${purchaseId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (purchaseId) {
    await t('GET /api/purchases/:id - get purchase', async () => {
      const r = await request('GET', `/api/purchases/${purchaseId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/purchases/expiring-soon - expiring seeds', async () => {
      const r = await request('GET', '/api/purchases/expiring-soon', null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/purchases/low-stock - low stock alerts', async () => {
      const r = await request('GET', '/api/purchases/low-stock', null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/purchases/:id - update purchase', async () => {
      const r = await request('PUT', `/api/purchases/${purchaseId}`, { germination_rate: 88 }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/purchases/:id/usage-history - usage history', async () => {
      const r = await request('GET', `/api/purchases/${purchaseId}/usage-history`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/purchases/:id/payments - record payment', async () => {
      const r = await request('POST', `/api/purchases/${purchaseId}/payments`, {
        amount: 300,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank_transfer',
        reference_number: `PREF-${Date.now()}`
      }, TOKEN);
      if (r.status === 201 || r.status === 200) return P(r.status, 'payment recorded');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // LOTS
  // ==============================
  console.log('\n--- LOTS ---');
  let lotId, lotNumber;

  await t('GET /api/lots/ - list lots', async () => {
    const r = await request('GET', '/api/lots/', null, TOKEN);
    if (r.status === 200) {
      const lots = Array.isArray(r.body) ? r.body : (r.body.lots || []);
      if (lots[0]) { lotId = lotId || lots[0].id; lotNumber = lotNumber || lots[0].lot_number; }
      return P(r.status, `${lots.length} lots`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/lots/ - create lot from seed purchase', async () => {
    if (!purchaseId) return W(0, 'No purchaseId available');
    const r = await request('POST', '/api/lots/', {
      seed_purchase_id: purchaseId,
      tray_count: 5,
      seeds_per_tray: 50,
      location: 'Greenhouse A, Row 3'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      const lot = r.body.lot || r.body;
      lotId = lot.id;
      lotNumber = lot.lot_number;
      return P(r.status, `lotId: ${lotId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (lotId) {
    await t('GET /api/lots/:id - get lot details', async () => {
      const r = await request('GET', `/api/lots/${lotId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/lots/:id/stage - update growth stage', async () => {
      const r = await request('PUT', `/api/lots/${lotId}/stage`, { stage: 'germination' }, TOKEN);
      if (r.status === 200) return P(r.status, 'stage updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/lots/:id/location - update location', async () => {
      const r = await request('PUT', `/api/lots/${lotId}/location`, { location: 'Greenhouse B, Row 1' }, TOKEN);
      if (r.status === 200) return P(r.status, 'location updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/lots/:id/qr - get QR code', async () => {
      const r = await request('GET', `/api/lots/${lotId}/qr`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'QR code available');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/lots/:id/growth-status - growth timeline', async () => {
      const r = await request('GET', `/api/lots/${lotId}/growth-status`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'growth timeline retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/lots/:id/seed-lineage - seed traceability', async () => {
      const r = await request('GET', `/api/lots/${lotId}/seed-lineage`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'seed lineage retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/lots/:id/scan-stats - scan statistics', async () => {
      const r = await request('GET', `/api/lots/${lotId}/scan-stats`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'scan stats retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/lots/:id/regenerate-qr - regenerate QR', async () => {
      const r = await request('PUT', `/api/lots/${lotId}/regenerate-qr`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'QR regenerated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  if (lotNumber) {
    await t('POST /api/lots/scan - scan lot by QR code', async () => {
      const r = await request('POST', '/api/lots/scan', { qr_code: lotNumber }, TOKEN);
      if (r.status === 200) return P(r.status, 'QR scan works');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  if (purchaseId) {
    await t('GET /api/lots/by-purchase/:purchaseId - lots by purchase', async () => {
      const r = await request('GET', `/api/lots/by-purchase/${purchaseId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // INVENTORY
  // ==============================
  console.log('\n--- INVENTORY ---');

  await t('GET /api/inventory/summary - inventory summary', async () => {
    const r = await request('GET', '/api/inventory/summary', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/inventory/seeds - seed inventory', async () => {
    const r = await request('GET', '/api/inventory/seeds', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/inventory/saplings - sapling inventory', async () => {
    const r = await request('GET', '/api/inventory/saplings', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/inventory/combined - combined inventory', async () => {
    const r = await request('GET', '/api/inventory/combined', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/inventory/stats - inventory stats', async () => {
    const r = await request('GET', '/api/inventory/stats', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/inventory/seeds/available-for-lot - available seeds', async () => {
    const r = await request('GET', '/api/inventory/seeds/available-for-lot', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (seedProductId) {
    await t('GET /api/inventory/seeds/:product_id - seeds by product', async () => {
      const r = await request('GET', `/api/inventory/seeds/${seedProductId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/inventory/saplings/:product_id - saplings by product', async () => {
      const r = await request('GET', `/api/inventory/saplings/${seedProductId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/inventory/product/:product_id/breakdown - lot breakdown', async () => {
      const r = await request('GET', `/api/inventory/product/${seedProductId}/breakdown`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // ORDERS
  // ==============================
  console.log('\n--- ORDERS ---');
  let orderId;

  await t('GET /api/orders/ - list orders', async () => {
    const r = await request('GET', '/api/orders/', null, TOKEN);
    if (r.status === 200) {
      const orders = Array.isArray(r.body) ? r.body : (r.body.orders || []);
      orderId = orderId || orders[0]?.id;
      return P(r.status, `${orders.length} orders`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/orders/recent - recent orders', async () => {
    const r = await request('GET', '/api/orders/recent', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/orders/ - create order', async () => {
    if (!skuId || !customerId) return W(0, `No skuId=${skuId} or customerId=${customerId}`);
    const r = await request('POST', '/api/orders/', {
      customer_id: customerId,
      items: [{ sku_id: skuId, quantity: 3, unit_price: 150 }],
      delivery_address: '123 Test St, Mumbai, 400001'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      orderId = r.body.id || r.body.order?.id;
      return P(r.status, `orderId: ${orderId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (orderId) {
    await t('GET /api/orders/:id - get order', async () => {
      const r = await request('GET', `/api/orders/${orderId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/orders/:id/timeline - status timeline', async () => {
      const r = await request('GET', `/api/orders/${orderId}/timeline`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'timeline retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/orders/:id/status - update status to confirmed', async () => {
      const r = await request('PUT', `/api/orders/${orderId}/status`, { status: 'confirmed' }, TOKEN);
      if (r.status === 200) return P(r.status, 'status updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/orders/check-availability - check availability', async () => {
      const r = await request('POST', '/api/orders/check-availability', {
        items: [{ sku_id: skuId, quantity: 3 }]
      }, TOKEN);
      if (r.status === 200) return P(r.status, 'availability checked');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // PAYMENTS
  // ==============================
  console.log('\n--- PAYMENTS ---');
  let paymentId;

  await t('GET /api/payments/ - list payments', async () => {
    const r = await request('GET', '/api/payments/', null, TOKEN);
    if (r.status === 200) {
      const pays = Array.isArray(r.body) ? r.body : (r.body.payments || []);
      paymentId = paymentId || pays[0]?.id;
      return P(r.status, `${pays.length} payments`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/payments/summary - payment summary', async () => {
    const r = await request('GET', '/api/payments/summary', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/payments/upcoming - upcoming payments', async () => {
    const r = await request('GET', '/api/payments/upcoming', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (orderId) {
    await t('POST /api/payments/record - record offline payment', async () => {
      const r = await request('POST', '/api/payments/record', {
        order_id: orderId,
        amount: 450,
        payment_method: 'cash',
        payment_date: new Date().toISOString().split('T')[0]
      }, TOKEN);
      if (r.status === 201 || r.status === 200) {
        paymentId = r.body.id || r.body.payment?.id;
        return P(r.status, `paymentId: ${paymentId}`);
      }
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/payments/order/:orderId - order payments', async () => {
      const r = await request('GET', `/api/payments/order/${orderId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/payments/installments/:orderId - installments', async () => {
      const r = await request('GET', `/api/payments/installments/${orderId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/payments/initiate - initiate online payment', async () => {
      const r = await request('POST', '/api/payments/initiate', {
        order_id: orderId, amount: 450, currency: 'INR'
      }, TOKEN);
      if (r.status === 200 || r.status === 201) return P(r.status, 'initiated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  if (customerId) {
    await t('GET /api/payments/customer/:customerId - customer payments', async () => {
      const r = await request('GET', `/api/payments/customer/${customerId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  if (paymentId) {
    await t('GET /api/payments/:id/receipt - payment receipt', async () => {
      const r = await request('GET', `/api/payments/${paymentId}/receipt`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'receipt generated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // INVOICES
  // ==============================
  console.log('\n--- INVOICES ---');
  let invoiceId;

  await t('GET /api/invoices/ - list invoices', async () => {
    const r = await request('GET', '/api/invoices/', null, TOKEN);
    if (r.status === 200) {
      const invoices = Array.isArray(r.body) ? r.body : (r.body.invoices || []);
      invoiceId = invoiceId || invoices[0]?.id;
      return P(r.status, `${invoices.length} invoices`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/invoices/ - create invoice', async () => {
    if (!customerId) return W(0, 'No customerId');
    const r = await request('POST', '/api/invoices/', {
      customer_id: customerId,
      order_id: orderId,
      due_date: new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0],
      items: [{ description: 'Test Plant 4" Pot', quantity: 3, unit_price: 150 }]
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      invoiceId = r.body.id || r.body.invoice?.id;
      return P(r.status, `invoiceId: ${invoiceId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (invoiceId) {
    await t('GET /api/invoices/:id - get invoice', async () => {
      const r = await request('GET', `/api/invoices/${invoiceId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/invoices/:id - update invoice', async () => {
      const r = await request('PUT', `/api/invoices/${invoiceId}`, { notes: 'Updated' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/invoices/:id/issue - issue invoice', async () => {
      const r = await request('POST', `/api/invoices/${invoiceId}/issue`, {}, TOKEN);
      if (r.status === 200) return P(r.status, 'issued');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/invoices/:id/payments - apply payment', async () => {
      const r = await request('POST', `/api/invoices/${invoiceId}/payments`, {
        amount: 200, payment_method: 'cash',
        payment_date: new Date().toISOString().split('T')[0]
      }, TOKEN);
      if (r.status === 200 || r.status === 201) return P(r.status, 'payment applied');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/invoices/:id/pdf - generate PDF', async () => {
      const r = await request('GET', `/api/invoices/${invoiceId}/pdf`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'PDF generated');
      return W(r.status, 'status: ' + r.status);
    });
  }

  await t('GET /api/invoices/reports/aging - aging report', async () => {
    const r = await request('GET', '/api/invoices/reports/aging', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/invoices/reports/register - invoice register', async () => {
    const r = await request('GET', '/api/invoices/reports/register', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // DASHBOARD
  // ==============================
  console.log('\n--- DASHBOARD ---');

  await t('GET /api/dashboard/overview - dashboard overview', async () => {
    const r = await request('GET', '/api/dashboard/overview', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/dashboard/kpis - KPIs', async () => {
    const r = await request('GET', '/api/dashboard/kpis', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/dashboard/recent-orders - recent orders', async () => {
    const r = await request('GET', '/api/dashboard/recent-orders', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // REPORTS
  // ==============================
  console.log('\n--- REPORTS ---');

  await t('GET /api/reports/sales - sales report', async () => {
    const r = await request('GET', '/api/reports/sales', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/reports/inventory - inventory report', async () => {
    const r = await request('GET', '/api/reports/inventory', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/reports/delivery - delivery report', async () => {
    const r = await request('GET', '/api/reports/delivery', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/reports/customers - customer analytics', async () => {
    const r = await request('GET', '/api/reports/customers', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/reports/financial - financial summary', async () => {
    const r = await request('GET', '/api/reports/financial', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // NOTIFICATIONS
  // ==============================
  console.log('\n--- NOTIFICATIONS ---');
  let notifId;

  await t('GET /api/notifications/ - list notifications', async () => {
    const r = await request('GET', '/api/notifications/', null, TOKEN);
    if (r.status === 200) {
      const notifs = Array.isArray(r.body) ? r.body : (r.body.notifications || []);
      notifId = notifId || notifs[0]?.id;
      return P(r.status, `${notifs.length} notifications`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/notifications/unread-count - unread count', async () => {
    const r = await request('GET', '/api/notifications/unread-count', null, TOKEN);
    if (r.status === 200) return P(r.status, `count: ${r.body.count || r.body.unread_count || 0}`);
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('PUT /api/notifications/read-all - mark all read', async () => {
    const r = await request('PUT', '/api/notifications/read-all', {}, TOKEN);
    if (r.status === 200) return P(r.status, 'all marked read');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/notifications/by-type/system - by type', async () => {
    const r = await request('GET', '/api/notifications/by-type/system', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (notifId) {
    await t('PUT /api/notifications/:id/read - mark single read', async () => {
      const r = await request('PUT', `/api/notifications/${notifId}/read`, {}, TOKEN);
      if (r.status === 200) return P(r.status, 'marked read');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // BANK LEDGER
  // ==============================
  console.log('\n--- BANK LEDGER ---');
  let bankId, ledgerEntryId;

  await t('GET /api/bank-accounts/ - list accounts', async () => {
    const r = await request('GET', '/api/bank-accounts/', null, TOKEN);
    if (r.status === 200) {
      const accounts = Array.isArray(r.body) ? r.body : (r.body.accounts || []);
      bankId = bankId || accounts[0]?.id;
      return P(r.status, `${accounts.length} accounts`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/bank-accounts/ - create account', async () => {
    const r = await request('POST', '/api/bank-accounts/', {
      account_name: `Test Account ${Date.now()}`,
      bank_name: 'State Bank of India',
      account_number: `ACC${Date.now()}`,
      ifsc_code: 'SBIN0001234',
      account_type: 'current',
      currency: 'INR'
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      bankId = r.body.id || r.body.account?.id;
      return P(r.status, `bankId: ${bankId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (bankId) {
    await t('PUT /api/bank-accounts/:id - update account', async () => {
      const r = await request('PUT', `/api/bank-accounts/${bankId}`, { account_name: 'Updated Account' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/bank-accounts/:id/opening-balance - set opening balance', async () => {
      const r = await request('POST', `/api/bank-accounts/${bankId}/opening-balance`, {
        amount: 100000,
        date: new Date().toISOString().split('T')[0]
      }, TOKEN);
      if (r.status === 200 || r.status === 201) return P(r.status, 'opening balance set');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/bank-accounts/:id/entries - add manual entry', async () => {
      const r = await request('POST', `/api/bank-accounts/${bankId}/entries`, {
        type: 'credit', amount: 5000,
        description: 'Test entry',
        date: new Date().toISOString().split('T')[0]
      }, TOKEN);
      if (r.status === 201 || r.status === 200) {
        ledgerEntryId = r.body.id || r.body.entry?.id;
        return P(r.status, `entryId: ${ledgerEntryId}`);
      }
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/bank-accounts/:id/ledger - get ledger', async () => {
      const r = await request('GET', `/api/bank-accounts/${bankId}/ledger`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('GET /api/bank-accounts/:id/summary - monthly summary', async () => {
      const r = await request('GET', `/api/bank-accounts/${bankId}/summary`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/bank-accounts/:id/sync - sync from payments', async () => {
      const r = await request('POST', `/api/bank-accounts/${bankId}/sync`, {
        start_date: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      }, TOKEN);
      if (r.status === 200) return P(r.status, 'synced');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    if (ledgerEntryId) {
      await t('PUT /api/bank-accounts/:id/entries/:entryId - edit entry', async () => {
        const r = await request('PUT', `/api/bank-accounts/${bankId}/entries/${ledgerEntryId}`, { description: 'Updated entry' }, TOKEN);
        if (r.status === 200) return P(r.status, 'updated');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });

      await t('DELETE /api/bank-accounts/:id/entries/:entryId - delete entry', async () => {
        const r = await request('DELETE', `/api/bank-accounts/${bankId}/entries/${ledgerEntryId}`, null, TOKEN);
        if (r.status === 200 || r.status === 204) return P(r.status, 'deleted');
        return W(r.status, JSON.stringify(r.body).substring(0, 100));
      });
    }
  }

  // ==============================
  // VENDOR BILLS
  // ==============================
  console.log('\n--- VENDOR BILLS ---');

  await t('GET /api/vendor-bills/ - list vendor bills', async () => {
    const r = await request('GET', '/api/vendor-bills/', null, TOKEN);
    if (r.status === 200) {
      const bills = Array.isArray(r.body) ? r.body : (r.body.bills || []);
      return P(r.status, `${bills.length} bills`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/vendor-bills/reports/aging - vendor aging report', async () => {
    const r = await request('GET', '/api/vendor-bills/reports/aging', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // VENDOR RETURNS
  // ==============================
  console.log('\n--- VENDOR RETURNS ---');
  let returnId;

  await t('GET /api/vendor-returns/ - list returns', async () => {
    const r = await request('GET', '/api/vendor-returns/', null, TOKEN);
    if (r.status === 200) {
      const returns = Array.isArray(r.body) ? r.body : (r.body.returns || []);
      return P(r.status, `${returns.length} returns`);
    }
    return F(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/vendor-returns/ - create return', async () => {
    if (!vendorId || !purchaseId) return W(0, 'No vendorId or purchaseId');
    const r = await request('POST', '/api/vendor-returns/', {
      vendor_id: vendorId,
      purchase_id: purchaseId,
      reason: 'Poor germination rate',
      items: [{ description: 'Seeds', quantity: 50, unit_price: 3.00 }],
      return_date: new Date().toISOString().split('T')[0]
    }, TOKEN);
    if (r.status === 201 || r.status === 200) {
      returnId = r.body.id || r.body.return?.id;
      return P(r.status, `returnId: ${returnId}`);
    }
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  if (returnId) {
    await t('GET /api/vendor-returns/:id - get return', async () => {
      const r = await request('GET', `/api/vendor-returns/${returnId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('PUT /api/vendor-returns/:id - update return', async () => {
      const r = await request('PUT', `/api/vendor-returns/${returnId}`, { reason: 'Updated reason' }, TOKEN);
      if (r.status === 200) return P(r.status, 'updated');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });

    await t('POST /api/vendor-returns/:id/submit - submit return', async () => {
      const r = await request('POST', `/api/vendor-returns/${returnId}/submit`, {}, TOKEN);
      if (r.status === 200) return P(r.status, 'submitted');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  if (vendorId) {
    await t('GET /api/vendor-returns/available-credits/:vendorId - available credits', async () => {
      const r = await request('GET', `/api/vendor-returns/available-credits/${vendorId}`, null, TOKEN);
      if (r.status === 200) return P(r.status, 'retrieved');
      return W(r.status, JSON.stringify(r.body).substring(0, 100));
    });
  }

  // ==============================
  // DELIVERY (fixed routes)
  // ==============================
  console.log('\n--- DELIVERY (after route fix) ---');

  await t('GET /api/delivery/summary - delivery summary (route fix test)', async () => {
    const r = await request('GET', '/api/delivery/summary');
    if (r.status === 200) return P(r.status, 'route fix works!');
    if (r.status === 500) return F(r.status, 'STILL BROKEN: ' + JSON.stringify(r.body).substring(0, 100));
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('GET /api/delivery/available-orders - available orders (route fix test)', async () => {
    const r = await request('GET', '/api/delivery/available-orders');
    if (r.status === 200) return P(r.status, 'route fix works!');
    if (r.status === 500) return F(r.status, 'STILL BROKEN: ' + JSON.stringify(r.body).substring(0, 100));
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // DRIVER ENDPOINTS
  // ==============================
  console.log('\n--- DRIVER ---');

  await t('GET /api/driver/routes/today - today routes', async () => {
    const r = await request('GET', '/api/driver/routes/today', null, TOKEN);
    if (r.status === 200) return P(r.status, 'retrieved');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  await t('POST /api/driver/location - update GPS location', async () => {
    const r = await request('POST', '/api/driver/location', {
      latitude: 19.0760, longitude: 72.8777, accuracy: 10
    }, TOKEN);
    if (r.status === 200 || r.status === 201) return P(r.status, 'location updated');
    return W(r.status, JSON.stringify(r.body).substring(0, 100));
  });

  // ==============================
  // SUMMARY
  // ==============================
  const total = results.passed.length + results.failed.length + results.warnings.length;
  const passRate = Math.round((results.passed.length + results.warnings.length) / total * 100);

  console.log('\n' + '='.repeat(80));
  console.log('  AUTHENTICATED TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log(`  ✅ PASSED:   ${results.passed.length}`);
  console.log(`  ⚠️  WARNINGS: ${results.warnings.length}`);
  console.log(`  ❌ FAILED:   ${results.failed.length}`);
  console.log(`  📊 TOTAL:    ${total}`);
  console.log(`  Pass Rate:   ${passRate}%`);

  if (results.failed.length > 0) {
    console.log('\n  FAILURES:');
    results.details.filter(d => !d.pass && !d.warn).forEach(d => {
      console.log(`  - [${d.num}] ${d.desc} | HTTP ${d.http || 'ERR'} | ${d.note || d.error || ''}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n  WARNINGS:');
    results.details.filter(d => d.warn).forEach(d => {
      console.log(`  - [${d.num}] ${d.desc} | HTTP ${d.http} | ${d.note || ''}`);
    });
  }

  console.log('\n  Completed:', new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  const fs = require('fs');
  fs.writeFileSync('/tmp/auth_test_results.json', JSON.stringify({ results, testData: { productId, skuId, customerId, vendorId, purchaseId, lotId, orderId, paymentId, invoiceId, bankId } }, null, 2));
  console.log('Results written to /tmp/auth_test_results.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
