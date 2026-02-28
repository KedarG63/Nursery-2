# Phase 21 - Issues Found & Fixes Applied

**Date:** 2025-10-22

---

## Issues Found During Testing

### 1. ❌ Dashboard SQL Error (FIXED)
**Error:** `error: function pg_catalog.extract(unknown, integer) does not exist`

**Location:** `backend/controllers/dashboardController.js`

**Cause:** PostgreSQL `EXTRACT()` function cannot extract from integer subtraction. Need to cast dates properly.

**Fix Applied:**
Changed all date arithmetic from:
```sql
EXTRACT(DAY FROM (o.delivery_date - CURRENT_DATE))
```

To:
```sql
(o.delivery_date::date - CURRENT_DATE::date)
```

**Fixed Lines:**
- Line 154-155: `days_until_ready` and `days_until_delivery`
- Line 158-159: Readiness status conditions
- Line 234: `days_until_ready` in lots query
- Line 308-312: Payment urgency calculations
- Line 488: Delivery countdown

**Status:** ✅ FIXED in dashboardController.js

---

### 2. ❌ Lot Creation Validation Error (IDENTIFIED)
**Error:** `400 Bad Request` when calling `GET /api/lots?limit=1000`

**Location:** `backend/validators/lotValidator.js` line 110

**Cause:** The validator limits `limit` parameter to maximum 100:
```javascript
query('limit').optional().isInt({ min: 1, max: 100 })
```

But the frontend (LotsList.jsx) is trying to fetch 1000 lots for filter data.

**Fix Needed:**
Either:
1. Increase the limit in validator to 1000
2. Or change frontend to use pagination for filter data

**Recommended Fix:**
```javascript
// In backend/validators/lotValidator.js line 110
query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
```

**Status:** ⚠️ NOT YET FIXED (needs user confirmation)

---

### 3. ✅ Lot Creation Uses Product Growth Period (ENHANCED)
**Enhancement:** Phase 21 requires lots to use product's `growth_period_days` for calculating `expected_ready_date`.

**Location:** `backend/controllers/lotController.js` line 54-79

**Before (Hardcoded):**
```javascript
// Calculate expected ready date (120 days from planted date as default)
const expected_ready_date = new Date(planted_date);
expected_ready_date.setDate(expected_ready_date.getDate() + 120);
```

**After (Product-based):**
```javascript
// Get SKU and Product details including growth_period_days
const skuResult = await client.query(
  `SELECT s.sku_code, p.growth_period_days
   FROM skus s
   JOIN products p ON s.product_id = p.id
   WHERE s.id = $1 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
  [sku_id]
);

const growth_period_days = skuResult.rows[0].growth_period_days || 120;

// Calculate expected ready date using product's growth period
const expected_ready_date = new Date(planted_date);
expected_ready_date.setDate(expected_ready_date.getDate() + growth_period_days);
```

**Status:** ✅ FIXED in lotController.js

---

##Summary of Changes Made

### Backend Files Modified:

1. ✅ **backend/controllers/dashboardController.js**
   - Fixed all SQL date arithmetic
   - Changed EXTRACT() to simple date subtraction
   - 5 locations fixed

2. ✅ **backend/controllers/lotController.js**
   - Enhanced to use product's `growth_period_days`
   - Now joins with products table to get growth period
   - Calculates `expected_ready_date` dynamically

### Backend Files Needing Fix:

3. ⚠️ **backend/validators/lotValidator.js**
   - Line 110: Increase limit max from 100 to 1000
   - Or keep at 100 and change frontend pagination

### Frontend Files Already Updated:

1. ✅ `frontend/src/services/dashboardService.js` - New overview endpoint
2. ✅ `frontend/src/services/orderService.js` - Enhanced availability check
3. ✅ `frontend/src/services/lotService.js` - New inventory methods
4. ✅ `frontend/src/services/paymentService.js` - Payment tracking
5. ✅ `frontend/src/services/reportService.js` - Financial reports
6. ✅ `frontend/src/pages/Dashboard/Dashboard.jsx` - Uses new API
7. ✅ `frontend/src/pages/Orders/CreateOrder.jsx` - Availability checking

---

## How to Apply Remaining Fix

### Option 1: Increase Validator Limit (Recommended)

**File:** `backend/validators/lotValidator.js`

**Change Line 110 from:**
```javascript
query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
```

**To:**
```javascript
query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
```

### Option 2: Fix Frontend Pagination

**File:** `frontend/src/pages/Inventory/LotsList.jsx`

**Change line 88 from:**
```javascript
const lotsResponse = await lotService.getAllLots({ limit: 1000 });
```

**To:**
```javascript
const lotsResponse = await lotService.getAllLots({ limit: 100 });
// Then paginate through if needed
```

---

## Testing After Fixes

### 1. Test Dashboard
```bash
# Login to http://localhost:5174
# Navigate to Dashboard
# Should load without errors
# Check browser console - no 500 errors
```

### 2. Test Lot Creation
```bash
# Navigate to Inventory → Create Lot
# Fill in:
#   - SKU: Select any
#   - Quantity: 100
#   - Planted Date: Today
#   - Growth Stage: seed
# Click Create
# Should succeed without 400 error
```

### 3. Test Order Availability
```bash
# Navigate to Orders → Create Order
# Add items
# Set delivery date 10 days from now
# Go to Review step
# Click "Check Availability"
# Should show warning if lots not ready
```

---

## Current System State

### ✅ Working:
- Frontend builds successfully
- Backend starts (with old code)
- Product creation ✅
- SKU creation ✅
- Order services updated ✅
- Payment services updated ✅
- Report services updated ✅

### ⚠️ Needs Restart:
- Backend server needs restart to pick up dashboard fixes
- Or manually apply the dashboard fixes again

### ❌ Broken:
- Dashboard API (500 error due to SQL)
- Lot list filtering (400 error due to limit validation)

---

## Quick Fix Commands

```bash
# 1. Kill all node processes
taskkill //F //PID <pid>

# 2. Restart backend with fixes
cd backend && npm run dev

# 3. Restart frontend
cd frontend && npm run dev

# 4. Test in browser
# Navigate to http://localhost:5174
```

---

## What You'll See After All Fixes

### Dashboard (http://localhost:5174/)
- Loads without errors
- Shows KPIs
- Recent orders list
- Uses new `/api/dashboard/overview` endpoint

### Create Order (http://localhost:5174/orders/create)
- **NEW VISIBLE FEATURE:** "Check Availability" button in Review step
- Green success when inventory available
- Orange warning with details when unavailable
- Cannot submit without checking availability

### Inventory (http://localhost:5174/inventory)
- List loads without 400 error
- Can create lots successfully
- Lots use product's growth_period_days automatically

---

## Files Summary

### Fixed & Ready:
1. ✅ dashboard Controller.js - SQL fixes
2. ✅ lotController.js - Growth period enhancement
3. ✅ All frontend services - API integration
4. ✅ Dashboard.jsx - New API usage
5. ✅ CreateOrder.jsx - Availability checking UI

### Needs One-Line Fix:
6. ⚠️ lotValidator.js - Change max limit 100 → 1000

---

**Next Step:** Restart backend server to pick up all fixes, or manually apply the lotValidator fix.
