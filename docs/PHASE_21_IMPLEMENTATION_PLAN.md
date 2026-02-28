# Phase 21: Critical Bug Fixes & System Integration

## Overview
This phase addresses critical issues preventing the system from functioning as a cohesive unit, focusing on inventory management, dashboard functionality, payment tracking, reporting, and delivery management.

## Analysis Summary

### Current System State
Based on backend analysis and database schema review:

**Existing Backend API Endpoints:**
1. **Products**: Full CRUD (routes/products.js)
2. **SKUs**: Full CRUD (routes/skus.js)
3. **Lots**: Full CRUD with QR generation (routes/lots.js, controllers/lotController.js)
4. **Orders**: Create, list, status updates, allocation (routes/orders.js, controllers/orderController.js)
5. **Payments**: Initiate, verify, record offline (routes/payments.js, controllers/paymentController.js)
6. **Dashboard**: Basic KPIs (routes/dashboard.js, controllers/dashboardController.js)
7. **Reports**: Sales, inventory, delivery, customer, financial (routes/reports.js, controllers/reportController.js)
8. **Delivery**: Routes, tracking, assignment (routes/delivery.js, controllers/deliveryController.js)

**Database Schema:**
- **products**: Has `growth_period_days` field ✓
- **lots**: Has `growth_stage`, `expected_ready_date`, `allocated_quantity`, `available_quantity` ✓
- **orders**: Has `expected_ready_date` field ✓
- **order_items**: Links orders to SKUs (need to add lot_id if missing)

## Issues Identified

### 1. Inventory Management Issues
**Current Problems:**
- Product and SKU names not visible in lot listings (frontend issue - API returns this data)
- Growth stages not calculated/displayed based on planted_date and growth_period_days
- Order creation doesn't check lot availability based on maturity date
- Inventory page doesn't show:
  - Available vs allocated quantities per SKU
  - Lots per product/SKU breakdown
  - Reserved vs walk-in inventory
- QR code generation failing (need to verify utility implementation)

**Root Causes:**
- Frontend not displaying all data returned by backend
- Missing API endpoint for inventory summary by product/SKU
- Order creation logic doesn't validate delivery_date against lot expected_ready_date
- Missing inventory dashboard/analytics endpoint

### 2. Dashboard Issues
**Current Problems:**
- No comprehensive insights displayed
- Missing order readiness countdown
- No payment due tracking
- No revenue analytics

**Root Causes:**
- dashboardController.js has minimal KPIs (only counts, not insights)
- Missing endpoints for:
  - Order readiness timeline
  - Upcoming payment reminders
  - Revenue trends
  - Lot maturity countdown per order

### 3. Payment Issues
**Current Problems:**
- No upcoming payment tracking visible
- Can't see advance + credit split for orders
- Missing vendor payment tracking

**Root Causes:**
- Payment installments exist but not displayed on frontend
- No payment reminders/due date tracking
- Vendor payments not implemented (out of scope initially)

### 4. Reports Issues
**Current Problems:**
- Report endpoints exist but frontend not showing data
- No revenue vs expenses comparison

**Root Causes:**
- Frontend pages exist but may have API integration issues
- reportController uses services that may not have proper data aggregation

### 5. Delivery Issues
**Current Problems:**
- Delivery tab shows nothing

**Root Causes:**
- deliveryController has full implementation
- Frontend likely not fetching or displaying delivery routes/assignments

### 6. Order-Inventory Integration Issues
**Current Problems:**
- When creating order, inventory availability not checked against maturity period
- Can't prevent orders with delivery dates before lot ready dates

**Root Causes:**
- createOrder in orderController doesn't validate expected_ready_date
- Missing validation: `delivery_date >= max(lot.expected_ready_date)` for all items

---

## PART 1: INVENTORY MANAGEMENT FIXES (CRITICAL)

### Issue 1.1: Product/SKU Visibility in Lots
**Current State:** Backend API returns product_name and sku_code in listLots endpoint
**Problem:** Frontend may not be displaying this data

**Backend Changes Required:** NONE (already implemented in lotController.js:219-223)

**Frontend Fix Required:**
- Update `frontend/src/pages/Inventory/LotsList.jsx` to display:
  - Product Name (from `product_name`)
  - SKU Code (from `sku_code`)
  - Growth Stage with visual indicator
  - Days to ready (calculated from `expected_ready_date`)

### Issue 1.2: Growth Stage Display Based on Timeline
**Current State:** Lots have `growth_stage` enum but not auto-updated based on timeline

**Backend Enhancement Required:**
Create new endpoint: `GET /api/lots/:id/growth-status`

```javascript
/**
 * Get lot growth status with timeline
 * GET /api/lots/:id/growth-status
 */
const getLotGrowthStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        l.*,
        p.growth_period_days,
        p.name as product_name,
        s.sku_code,
        EXTRACT(DAY FROM (NOW() - l.planted_date)) as days_since_planted,
        EXTRACT(DAY FROM (l.expected_ready_date - NOW())) as days_until_ready,
        CASE
          WHEN NOW() < l.planted_date + INTERVAL '7 days' THEN 'seed'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.3)::int * INTERVAL '1 day' THEN 'germination'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.6)::int * INTERVAL '1 day' THEN 'seedling'
          WHEN NOW() < l.planted_date + (p.growth_period_days * 0.9)::int * INTERVAL '1 day' THEN 'transplant'
          WHEN NOW() >= l.expected_ready_date THEN 'ready'
          ELSE 'preparing'
        END as calculated_stage,
        ROUND((EXTRACT(DAY FROM (NOW() - l.planted_date))::float / p.growth_period_days) * 100, 2) as growth_percentage
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get lot growth status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
```

**Add to routes/lots.js:**
```javascript
router.get('/:id/growth-status', auth, getLotGrowthStatus);
```

### Issue 1.3: Inventory Summary by Product/SKU
**Backend Enhancement Required:**
Create new endpoint: `GET /api/inventory/summary`

```javascript
/**
 * Get inventory summary grouped by product/SKU
 * GET /api/inventory/summary
 */
const getInventorySummary = async (req, res) => {
  try {
    const { product_id, growth_stage } = req.query;

    let conditions = ['l.deleted_at IS NULL'];
    let params = [];
    let paramCount = 0;

    if (product_id) {
      paramCount++;
      conditions.push(`p.id = $${paramCount}`);
      params.push(product_id);
    }

    if (growth_stage) {
      paramCount++;
      conditions.push(`l.growth_stage = $${paramCount}`);
      params.push(growth_stage);
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT
        p.id as product_id,
        p.name as product_name,
        p.growth_period_days,
        s.id as sku_id,
        s.sku_code,
        l.growth_stage,
        COUNT(l.id) as lot_count,
        SUM(l.quantity) as total_quantity,
        SUM(l.allocated_quantity) as total_allocated,
        SUM(l.available_quantity) as total_available,
        MIN(l.expected_ready_date) as earliest_ready_date,
        MAX(l.expected_ready_date) as latest_ready_date,
        COUNT(CASE WHEN l.allocated_quantity > 0 THEN 1 END) as lots_with_orders,
        COUNT(CASE WHEN l.allocated_quantity = 0 THEN 1 END) as lots_available_walkin
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       WHERE ${whereClause}
       GROUP BY p.id, p.name, p.growth_period_days, s.id, s.sku_code, l.growth_stage
       ORDER BY p.name, s.sku_code, l.growth_stage`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get inventory summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
```

**Create new file: backend/controllers/inventoryController.js:**
```javascript
const pool = require('../config/database');

const getInventorySummary = async (req, res) => {
  // ... (implementation above)
};

const getProductInventoryBreakdown = async (req, res) => {
  try {
    const { product_id } = req.params;

    const result = await pool.query(
      `SELECT
        l.*,
        s.sku_code,
        p.name as product_name,
        p.growth_period_days,
        o.order_number,
        CASE WHEN l.allocated_quantity > 0 THEN 'Reserved for Order' ELSE 'Available for Walk-in' END as allocation_status,
        EXTRACT(DAY FROM (l.expected_ready_date - NOW())) as days_until_ready
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN order_items oi ON oi.lot_id = l.id
       LEFT JOIN orders o ON oi.order_id = o.id
       WHERE p.id = $1 AND l.deleted_at IS NULL
       ORDER BY l.expected_ready_date, l.growth_stage`,
      [product_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get product inventory breakdown error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getInventorySummary,
  getProductInventoryBreakdown
};
```

**Create new file: backend/routes/inventory.js:**
```javascript
const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth');

router.get('/summary', authenticate, inventoryController.getInventorySummary);
router.get('/product/:product_id/breakdown', authenticate, inventoryController.getProductInventoryBreakdown);

module.exports = router;
```

**Update backend/server.js:**
```javascript
// Add after other route imports
const inventoryRoutes = require('./routes/inventory');

// Add after other route uses
app.use('/api/inventory', inventoryRoutes);
```

### Issue 1.4: Order Creation Validation Against Lot Maturity
**Current State:** orderController.createOrder doesn't check if delivery_date is achievable based on lot availability

**Backend Enhancement Required:**
Modify `backend/controllers/orderController.js` - `createOrder` function:

```javascript
// Add after step 3 (Fetch SKU details)
// Step 3.5: Check lot availability and maturity dates
for (const item of itemsWithPrices) {
  // Get available lots for this SKU that can fulfill the order by delivery date
  const lotsAvailableQuery = `
    SELECT
      l.id,
      l.lot_number,
      l.available_quantity,
      l.expected_ready_date,
      l.growth_stage,
      p.growth_period_days,
      EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
    FROM lots l
    JOIN skus s ON l.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    WHERE l.sku_id = $1
      AND l.deleted_at IS NULL
      AND l.growth_stage IN ('ready', 'transplant')
      AND l.available_quantity >= $2
      AND l.expected_ready_date <= $3
    ORDER BY l.expected_ready_date ASC, l.available_quantity DESC
    LIMIT 5
  `;

  const lotsResult = await client.query(lotsAvailableQuery, [
    item.sku_id,
    item.quantity,
    delivery_date
  ]);

  if (lotsResult.rows.length === 0) {
    // No lots available by delivery date - calculate minimum possible delivery date
    const nextAvailableQuery = `
      SELECT MIN(l.expected_ready_date) as next_available_date
      FROM lots l
      WHERE l.sku_id = $1
        AND l.deleted_at IS NULL
        AND l.available_quantity >= $2
    `;

    const nextAvailableResult = await client.query(nextAvailableQuery, [
      item.sku_id,
      item.quantity
    ]);

    const nextAvailableDate = nextAvailableResult.rows[0]?.next_available_date;

    if (!nextAvailableDate) {
      // Get product name for error message
      const skuInfo = itemsWithPrices.find(i => i.sku_id === item.sku_id);

      return res.status(409).json({
        success: false,
        message: `Insufficient inventory for SKU`,
        error: {
          sku_id: item.sku_id,
          sku_code: skuInfo?.sku_code || 'Unknown',
          requested_quantity: item.quantity,
          requested_delivery_date: delivery_date,
          issue: 'No lots available with sufficient quantity',
          suggestion: 'Please create new lots or reduce order quantity'
        }
      });
    }

    const minDeliveryDate = new Date(nextAvailableDate);
    const requestedDeliveryDate = new Date(delivery_date);
    const daysShort = Math.ceil((minDeliveryDate - requestedDeliveryDate) / (1000 * 60 * 60 * 24));

    return res.status(409).json({
      success: false,
      message: `Delivery date too early - inventory not ready`,
      error: {
        sku_id: item.sku_id,
        requested_quantity: item.quantity,
        requested_delivery_date: delivery_date,
        earliest_possible_delivery_date: minDeliveryDate.toISOString().split('T')[0],
        days_short: daysShort,
        issue: `Products need ${daysShort} more days to mature`,
        suggestion: `Minimum delivery date should be ${minDeliveryDate.toISOString().split('T')[0]}`
      }
    });
  }

  // Store available lot info for later allocation
  item.available_lots = lotsResult.rows;
}

// Calculate expected_ready_date for the order (maximum of all item ready dates)
const maxReadyDate = itemsWithPrices.reduce((maxDate, item) => {
  if (item.available_lots && item.available_lots.length > 0) {
    const lotReadyDate = new Date(item.available_lots[0].expected_ready_date);
    return lotReadyDate > maxDate ? lotReadyDate : maxDate;
  }
  return maxDate;
}, new Date(delivery_date));

// Update INSERT query to include expected_ready_date
// Modify the INSERT at line ~159:
const orderResult = await client.query(
  `INSERT INTO orders (
     customer_id, delivery_address_id, delivery_date, delivery_slot,
     payment_type, subtotal_amount, discount_amount, tax_amount,
     total_amount, expected_ready_date, notes, created_by, updated_by
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
   RETURNING *`,
  [
    customer_id,
    delivery_address_id,
    delivery_date,
    delivery_slot,
    payment_type,
    subtotal,
    discountAmountFinal,
    taxAmount,
    totalAmount,
    maxReadyDate, // Add expected_ready_date
    notes,
    userId,
  ]
);
```

### Issue 1.5: Check Inventory API Enhancement
**Enhancement to existing checkAvailability endpoint:**

Modify `backend/controllers/orderController.js` - `checkAvailability`:

```javascript
const checkAvailability = async (req, res) => {
  try {
    const { items, delivery_date } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    if (!delivery_date) {
      return res.status(400).json({
        success: false,
        message: 'delivery_date is required',
      });
    }

    const availabilityChecks = [];

    for (const item of items) {
      // Check lots available by delivery date
      const lotsQuery = `
        SELECT
          l.id,
          l.lot_number,
          l.growth_stage,
          l.quantity,
          l.allocated_quantity,
          l.available_quantity,
          l.expected_ready_date,
          p.name as product_name,
          p.growth_period_days,
          s.sku_code,
          EXTRACT(DAY FROM (l.expected_ready_date - CURRENT_DATE)) as days_until_ready
        FROM lots l
        JOIN skus s ON l.sku_id = s.id
        JOIN products p ON s.product_id = p.id
        WHERE l.sku_id = $1
          AND l.deleted_at IS NULL
          AND l.available_quantity > 0
        ORDER BY l.expected_ready_date ASC
      `;

      const lotsResult = await pool.query(lotsQuery, [item.sku_id]);
      const allLots = lotsResult.rows;

      // Lots ready by delivery date
      const lotsReadyByDate = allLots.filter(
        lot => new Date(lot.expected_ready_date) <= new Date(delivery_date)
      );

      const totalAvailable = lotsReadyByDate.reduce(
        (sum, lot) => sum + parseInt(lot.available_quantity),
        0
      );

      const canFulfill = totalAvailable >= item.quantity;

      // Find next available date if can't fulfill
      let nextAvailableDate = null;
      if (!canFulfill) {
        let cumulative = 0;
        for (const lot of allLots) {
          cumulative += parseInt(lot.available_quantity);
          if (cumulative >= item.quantity) {
            nextAvailableDate = lot.expected_ready_date;
            break;
          }
        }
      }

      availabilityChecks.push({
        sku_id: item.sku_id,
        sku_code: lotsResult.rows[0]?.sku_code || 'Unknown',
        product_name: lotsResult.rows[0]?.product_name || 'Unknown',
        requested_quantity: item.quantity,
        requested_delivery_date: delivery_date,
        available_quantity: totalAvailable,
        available: canFulfill,
        lots_ready_by_date: lotsReadyByDate.length,
        total_lots_available: allLots.length,
        next_available_date: nextAvailableDate,
        lots_details: lotsReadyByDate.slice(0, 5).map(lot => ({
          lot_number: lot.lot_number,
          available_quantity: lot.available_quantity,
          expected_ready_date: lot.expected_ready_date,
          days_until_ready: lot.days_until_ready,
          growth_stage: lot.growth_stage
        }))
      });
    }

    const allAvailable = availabilityChecks.every((check) => check.available);

    res.json({
      success: true,
      all_available: allAvailable,
      delivery_date: delivery_date,
      data: availabilityChecks,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: error.message,
    });
  }
};
```

---

## PART 2: QR CODE GENERATION FIX

### Issue 2.1: QR Code Not Being Generated
**Current State:** lotController.js uses `generateQRCode` utility but QR codes may not be generating

**Verify QR Code Generator:**
Check `backend/utils/qrCodeGenerator.js` exists and is properly implemented.

**If missing, create backend/utils/qrCodeGenerator.js:**

```javascript
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Generate QR code for lot tracking
 * @param {Object} data - Lot data {lot_number, sku_code, created_date}
 * @returns {Promise<Object>} {qr_code: string, qr_code_url: string}
 */
const generateQRCode = async (data) => {
  try {
    // Create QR code data string
    const qrData = JSON.stringify({
      lot_number: data.lot_number,
      sku_code: data.sku_code,
      created_date: data.created_date,
      type: 'LOT_TRACKING'
    });

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // For now, store as data URL (can be enhanced to upload to S3/Cloudinary later)
    return {
      qr_code: qrData,
      qr_code_url: qrCodeDataURL
    };
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

/**
 * Extract lot number from QR code data
 * @param {string} qrData - QR code data string or JSON
 * @returns {string} Lot number
 */
const extractLotNumber = (qrData) => {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(qrData);
    return parsed.lot_number;
  } catch {
    // If not JSON, assume it's the lot number directly
    return qrData;
  }
};

module.exports = {
  generateQRCode,
  extractLotNumber
};
```

**Update backend/package.json to ensure qrcode package:**
```json
"dependencies": {
  "qrcode": "^1.5.3"
}
```

**Test QR Code Generation:**
Create endpoint to test: `GET /api/lots/:id/qr-test`

```javascript
// Add to lotController.js
const testQRGeneration = async (req, res) => {
  try {
    const { id } = req.params;

    const lot = await pool.query(
      `SELECT l.*, s.sku_code FROM lots l JOIN skus s ON l.sku_id = s.id WHERE l.id = $1`,
      [id]
    );

    if (lot.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    const qrResult = await generateQRCode({
      lot_number: lot.rows[0].lot_number,
      sku_code: lot.rows[0].sku_code,
      created_date: lot.rows[0].created_at
    });

    res.json({
      success: true,
      lot_number: lot.rows[0].lot_number,
      qr_code_url: qrResult.qr_code_url,
      qr_data: qrResult.qr_code
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

## Summary of PART 1 Critical Changes

### Backend Files to Create/Modify:
1. **Create:** `backend/controllers/inventoryController.js` (new inventory summary endpoints)
2. **Create:** `backend/routes/inventory.js` (new inventory routes)
3. **Modify:** `backend/controllers/lotController.js` (add getLotGrowthStatus)
4. **Modify:** `backend/controllers/orderController.js` (add delivery date validation in createOrder, enhance checkAvailability)
5. **Create/Verify:** `backend/utils/qrCodeGenerator.js` (QR code generation utility)
6. **Modify:** `backend/routes/lots.js` (add growth-status route)
7. **Modify:** `backend/server.js` (register new inventory routes)

### Frontend Files to Modify (Next Steps):
1. `frontend/src/pages/Inventory/LotsList.jsx` - Display product/SKU names, growth stages
2. `frontend/src/pages/Orders/CreateOrder.jsx` - Add inventory availability check before submission
3. Create: `frontend/src/pages/Inventory/InventorySummary.jsx` - New inventory dashboard

### Testing Checklist for PART 1:
- [ ] QR codes generate successfully for new lots
- [ ] Inventory summary endpoint returns correct data grouped by product/SKU
- [ ] Order creation validates delivery date against lot maturity
- [ ] Order creation fails with clear error when delivery date too early
- [ ] Check availability API shows lot details and alternative dates
- [ ] Lot growth status endpoint returns calculated stage and percentage

---

*Continue to PART 2 for Dashboard Fixes, PART 3 for Payment Management, etc.*
