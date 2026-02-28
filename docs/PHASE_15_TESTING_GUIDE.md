# Phase 15 Testing Guide: Reports & Analytics API

**Date:** 2025-10-18
**Phase:** 15 - Reports & Analytics Backend API

---

## Prerequisites

1. **Backend server running:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Database seeded with test data** (orders, customers, lots, deliveries, payments)

3. **Valid JWT token** from Admin or Manager user

---

## Getting a Test Token

### Option 1: Login via API

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nursery.com",
    "password": "admin123"
  }'
```

Save the `accessToken` from the response.

### Option 2: Use existing token

If you have a valid token, use it directly in the Authorization header.

---

## Test Cases

### 1. Sales Report API (Issue #70)

#### Test 1.1: Basic sales report with defaults
```bash
curl -X GET "http://localhost:5000/api/reports/sales" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Response contains: `kpis`, `revenueTrend`, `topProducts`, `statusBreakdown`
- Default date range: Last 30 days
- Default grouping: day

#### Test 1.2: Sales report with custom date range
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18&group_by=month" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Data grouped by month
- Meta shows correct dates

#### Test 1.3: Invalid date format
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=01-01-2025&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 400
- Error: "Invalid date format"

#### Test 1.4: Invalid group_by parameter
```bash
curl -X GET "http://localhost:5000/api/reports/sales?group_by=year" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 400
- Error: "Invalid group_by parameter"

#### Test 1.5: No authentication
```bash
curl -X GET "http://localhost:5000/api/reports/sales"
```

**Expected:**
- Status: 401
- Error: "Unauthorized"

---

### 2. Inventory Report API (Issue #71)

#### Test 2.1: Basic inventory report
```bash
curl -X GET "http://localhost:5000/api/reports/inventory" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Response contains: `stockLevels`, `lotsByStage`, `lowStockAlerts`, `upcomingReady`, `locationBreakdown`

#### Test 2.2: Verify low stock alerts
```bash
curl -X GET "http://localhost:5000/api/reports/inventory" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- Check if SKUs with `currentStock < minLevel` are in `lowStockAlerts`
- Verify `isLowStock` flag is set correctly

#### Test 2.3: Verify upcoming ready lots
```bash
curl -X GET "http://localhost:5000/api/reports/inventory" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- All lots in `upcomingReady` should have `expectedReadyDate` within next 30 days
- Dates should be in chronological order

---

### 3. Delivery Performance Report API (Issue #72)

#### Test 3.1: Basic delivery report
```bash
curl -X GET "http://localhost:5000/api/reports/delivery?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Response contains: `onTimeRate`, `totalDeliveries`, `onTimeDeliveries`, `avgDeliveryTime`, `driverPerformance`, `failureReasons`

#### Test 3.2: Filter by specific driver
```bash
curl -X GET "http://localhost:5000/api/reports/delivery?start_date=2025-01-01&end_date=2025-10-18&driver_id=DRIVER_UUID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Metrics filtered for specific driver
- Meta contains `driverId`

#### Test 3.3: Validate on-time rate calculation
**Formula:** `(on_time_deliveries / total_deliveries) * 100`

```bash
curl -X GET "http://localhost:5000/api/reports/delivery?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- `onTimeRate` = `(onTimeDeliveries / totalDeliveries) * 100`
- Round to 2 decimal places

---

### 4. Customer Analytics Report API (Issue #73)

#### Test 4.1: Basic customer report
```bash
curl -X GET "http://localhost:5000/api/reports/customers?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Response contains: `topCustomers`, `segmentation`, `creditUtilization`, `repeatPurchaseRate`, `acquisitionTrend`

#### Test 4.2: Verify top customers are sorted by revenue
```bash
curl -X GET "http://localhost:5000/api/reports/customers?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- `topCustomers` array is sorted by `totalRevenue` in descending order
- Maximum 10 customers returned

#### Test 4.3: Verify credit utilization calculation
**Formula:** `(creditUsed / creditLimit) * 100`

```bash
curl -X GET "http://localhost:5000/api/reports/customers" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- `utilizationRate` = `(creditUsed / creditLimit) * 100`
- Only customers with `creditLimit > 0`

---

### 5. Financial Summary Report API (Issue #74)

#### Test 5.1: Basic financial report
```bash
curl -X GET "http://localhost:5000/api/reports/financial?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Response contains: `summary`, `paymentMethods`, `cashFlowTrend`, `profitMargins`

#### Test 5.2: Verify collection rate calculation
**Formula:** `(totalCollected / totalRevenue) * 100`

```bash
curl -X GET "http://localhost:5000/api/reports/financial?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Validation:**
- `summary.collectionRate` = `(totalCollected / totalRevenue) * 100`
- `summary.outstanding` = `totalRevenue - totalCollected`

#### Test 5.3: Cash flow trend with weekly grouping
```bash
curl -X GET "http://localhost:5000/api/reports/financial?start_date=2025-01-01&end_date=2025-10-18&group_by=week" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- `cashFlowTrend` grouped by week
- Meta shows `groupBy: "week"`

---

## Caching Tests

### Test Cache Hit

**Step 1:** Make initial request
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Step 2:** Check server logs - should NOT see "Returning cached sales report"

**Step 3:** Make same request again within 1 hour
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Step 4:** Check server logs - should see "Returning cached sales report"

---

## Authorization Tests

### Test with different roles

#### Test 6.1: Admin role (should work)
```bash
# Login as Admin
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@nursery.com", "password": "admin123"}' \
  | jq -r '.accessToken')

# Access reports
curl -X GET "http://localhost:5000/api/reports/sales" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200

#### Test 6.2: Manager role (should work)
```bash
# Login as Manager
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "manager@nursery.com", "password": "manager123"}' \
  | jq -r '.accessToken')

# Access reports
curl -X GET "http://localhost:5000/api/reports/sales" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200

#### Test 6.3: Warehouse role (should fail)
```bash
# Login as Warehouse user
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "warehouse@nursery.com", "password": "warehouse123"}' \
  | jq -r '.accessToken')

# Try to access reports
curl -X GET "http://localhost:5000/api/reports/sales" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 403 (Forbidden)

---

## Performance Tests

### Test 7.1: Response time (without cache)
```bash
time curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** < 2 seconds for typical dataset

### Test 7.2: Response time (with cache)
```bash
# First request (cache miss)
time curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second request (cache hit)
time curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Second request should be significantly faster (< 100ms)

---

## Edge Cases

### Test 8.1: Empty date range
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-10-18&end_date=2025-10-18" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Data for single day

### Test 8.2: Future date range
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-12-01&end_date=2025-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- Empty or zero values for future data

### Test 8.3: Invalid date range (start > end)
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2025-10-18&end_date=2025-01-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 400
- Error: "start_date must be before end_date"

### Test 8.4: Very large date range
```bash
curl -X GET "http://localhost:5000/api/reports/sales?start_date=2020-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:**
- Status: 200
- May be slow (consider pagination for production)

---

## Automated Testing Script

Create a file `test-reports.sh`:

```bash
#!/bin/bash

# Configuration
API_BASE="http://localhost:5000/api"
TOKEN="YOUR_JWT_TOKEN"

echo "Testing Report APIs..."

# Test 1: Sales Report
echo "\n1. Testing Sales Report..."
curl -s -X GET "$API_BASE/reports/sales?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

# Test 2: Inventory Report
echo "\n2. Testing Inventory Report..."
curl -s -X GET "$API_BASE/reports/inventory" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

# Test 3: Delivery Report
echo "\n3. Testing Delivery Report..."
curl -s -X GET "$API_BASE/reports/delivery?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

# Test 4: Customer Report
echo "\n4. Testing Customer Report..."
curl -s -X GET "$API_BASE/reports/customers?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

# Test 5: Financial Report
echo "\n5. Testing Financial Report..."
curl -s -X GET "$API_BASE/reports/financial?start_date=2025-01-01&end_date=2025-10-18" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

echo "\n✓ All tests completed!"
```

Run with:
```bash
chmod +x test-reports.sh
./test-reports.sh
```

---

## Testing Checklist

- [ ] All 5 endpoints return 200 with valid token
- [ ] All endpoints return 401 without token
- [ ] All endpoints return 403 for non-Admin/Manager roles
- [ ] Date validation works correctly
- [ ] group_by validation works correctly
- [ ] Default date range works (last 30 days)
- [ ] Cache hits on subsequent requests
- [ ] Response format matches specification
- [ ] SQL queries execute without errors
- [ ] Performance is acceptable (< 2s per request)
- [ ] No SQL injection vulnerabilities
- [ ] Error messages are clear and helpful
- [ ] All calculations are mathematically correct

---

## Troubleshooting

### Issue: "User not found" error
**Solution:** Ensure user exists in database and token is valid

### Issue: "Insufficient permissions" error
**Solution:** Login as Admin or Manager user

### Issue: Empty arrays in response
**Solution:** Ensure database has test data for the date range

### Issue: Cache not working
**Solution:** Check server logs for cache hit messages

### Issue: Slow response times
**Solution:**
1. Check database indexes
2. Reduce date range
3. Check database connection pool

---

## Next Steps

After testing:
1. Document any bugs found
2. Create database indexes as recommended
3. Perform load testing with realistic data volumes
4. Integrate with frontend dashboards
5. Set up monitoring and alerting

---

**Testing completed:** ____________
**Tested by:** ____________
**Bugs found:** ____________
**Status:** ____________
