# Phase 21 - Part 1: Quick Start Testing Guide

## 🚀 Quick Start

### Start the Backend Server
```bash
cd c:\Projects\Nursury_internal_software\backend
npm run dev
```

Server should start on `http://localhost:5000`

---

## 🧪 Quick API Tests (Using Postman or curl)

### 1. Test Inventory Summary Endpoint
```bash
GET http://localhost:5000/api/inventory/summary
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [...array of inventory grouped by product/SKU/stage...],
  "count": 5
}
```

---

### 2. Test Lot Growth Status
```bash
GET http://localhost:5000/api/lots/{LOT_ID}/growth-status
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
```

Replace `{LOT_ID}` with an actual lot UUID from your database.

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "lotNumber": "LOT-20250122-0001",
    "growthPercentage": 84.0,
    "daysUntilReady": 4,
    "isReady": false
  }
}
```

---

### 3. Test Order Availability Check
```bash
POST http://localhost:5000/api/orders/check-availability
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json

Body:
{
  "items": [
    {
      "sku_id": "YOUR_SKU_ID",
      "quantity": 100
    }
  ],
  "delivery_date": "2025-03-01"
}
```

**Expected Response:**
```json
{
  "success": true,
  "all_available": true,
  "delivery_date": "2025-03-01",
  "data": [
    {
      "sku_code": "TOM-MED-POT",
      "available": true,
      "lots_details": [...]
    }
  ]
}
```

---

### 4. Test Order Creation with Validation
```bash
POST http://localhost:5000/api/orders
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json

Body:
{
  "customer_id": "YOUR_CUSTOMER_ID",
  "delivery_address_id": "YOUR_ADDRESS_ID",
  "delivery_date": "2025-01-20",
  "payment_type": "advance",
  "items": [
    {
      "sku_id": "YOUR_SKU_ID",
      "quantity": 100
    }
  ]
}
```

**If delivery date is too early, expect 409 error:**
```json
{
  "success": false,
  "message": "Delivery date too early - inventory not ready",
  "error": {
    "days_short": 10,
    "earliest_possible_delivery_date": "2025-01-30",
    "suggestion": "Minimum delivery date should be 2025-01-30"
  }
}
```

---

## 📝 Get Sample IDs from Database

### Get a SKU ID:
```sql
SELECT id, sku_code FROM skus LIMIT 1;
```

### Get a Lot ID:
```sql
SELECT id, lot_number, expected_ready_date FROM lots LIMIT 1;
```

### Get Customer and Address ID:
```sql
SELECT c.id as customer_id, ca.id as address_id
FROM customers c
JOIN customer_addresses ca ON ca.customer_id = c.id
LIMIT 1;
```

---

## 🎯 Key Validation to Test

### Scenario 1: Order with Delivery Date AFTER Lot Ready Date
- Create order with `delivery_date = lot.expected_ready_date + 5 days`
- **Expected:** Order created successfully
- **Check:** Order has `expected_ready_date` field populated

### Scenario 2: Order with Delivery Date BEFORE Lot Ready Date
- Create order with `delivery_date = lot.expected_ready_date - 5 days`
- **Expected:** 409 error with `days_short = 5`
- **Check:** Error message includes `earliest_possible_delivery_date`

### Scenario 3: Check Availability with Future Date
- Check availability with `delivery_date` far in future
- **Expected:** `all_available = true`, shows all ready lots

### Scenario 4: Check Availability with Near Date
- Check availability with `delivery_date` soon (before lots ready)
- **Expected:** `all_available = false`, shows `next_available_date`

---

## 🔍 Verify Implementation

### Backend Console Logs to Watch:
```
Server is running on port 5000
✓ Database connection successful
```

### Check for Errors:
- No syntax errors on server start
- No errors when hitting endpoints
- Proper JSON responses

### Database Verification:
```sql
-- Verify expected_ready_date is being set on new orders
SELECT id, order_number, delivery_date, expected_ready_date
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module './routes/inventory'"
**Solution:** Make sure `backend/routes/inventory.js` exists and server is restarted

### Error: "Unauthorized"
**Solution:** Get a valid JWT token:
```bash
POST http://localhost:5000/api/auth/login
Body: { "email": "admin@example.com", "password": "..." }
```

### Error: "Lot not found"
**Solution:** Verify lot exists:
```sql
SELECT * FROM lots WHERE deleted_at IS NULL LIMIT 1;
```

### No Data Returned from Inventory Summary
**Solution:** Ensure you have:
1. Products with `growth_period_days` set
2. SKUs linked to products
3. Lots linked to SKUs with `expected_ready_date`

---

## ✅ Success Criteria

**PART 1 is working correctly if:**

1. ✅ `/api/inventory/summary` returns grouped inventory data
2. ✅ `/api/inventory/stats` returns overall statistics
3. ✅ `/api/lots/{id}/growth-status` returns growth percentage
4. ✅ Order creation with early delivery date returns 409 error
5. ✅ Order creation with valid delivery date succeeds
6. ✅ `checkAvailability` returns lot details filtered by delivery date
7. ✅ New orders have `expected_ready_date` field populated

---

## 📊 Sample Test Data (SQL)

If you need to create test data:

```sql
-- Create a product with growth period
INSERT INTO products (id, name, category, growth_period_days, status, created_by)
VALUES (gen_random_uuid(), 'Test Tomato', 'fruiting', 25, 'active', (SELECT id FROM users LIMIT 1));

-- Create a SKU
INSERT INTO skus (id, product_id, sku_code, price, active, min_stock_level, max_stock_level)
VALUES (gen_random_uuid(), (SELECT id FROM products WHERE name = 'Test Tomato'), 'TEST-TOM-001', 150, true, 100, 5000);

-- Create a lot with expected ready date
INSERT INTO lots (
  id, lot_number, sku_id, quantity, growth_stage,
  planted_date, expected_ready_date, current_location, created_by
)
VALUES (
  gen_random_uuid(),
  'LOT-20250122-TEST',
  (SELECT id FROM skus WHERE sku_code = 'TEST-TOM-001'),
  1000,
  'seedling',
  CURRENT_DATE - INTERVAL '10 days',
  CURRENT_DATE + INTERVAL '15 days',
  'greenhouse',
  (SELECT id FROM users LIMIT 1)
);
```

---

## 🎉 Next Steps After Testing

Once PART 1 is verified:
1. ✅ Proceed to PART 2 (Dashboard & Payment Enhancements)
2. ✅ Implement frontend integration (PART 4)
3. ✅ Run comprehensive end-to-end tests

---

**Happy Testing! 🚀**
