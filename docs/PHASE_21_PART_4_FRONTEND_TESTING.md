# Phase 21 - PART 4: Frontend Integration & Testing Guide

## PART 4A: FRONTEND INTEGRATION REQUIREMENTS

### Critical Frontend Pages to Update

Based on analysis, these frontend pages exist but need enhancements:

1. **frontend/src/pages/Dashboard/Dashboard.jsx**
2. **frontend/src/pages/Inventory/LotsList.jsx**
3. **frontend/src/pages/Orders/CreateOrder.jsx**
4. **frontend/src/pages/Payments/PaymentsList.jsx**
5. **frontend/src/pages/Reports/SalesDashboard.jsx**
6. **frontend/src/pages/Reports/InventoryReports.jsx**
7. **frontend/src/pages/Delivery/** (May need new pages)

---

## Frontend Implementation Guide

### 1. Dashboard Page Enhancement

**File: frontend/src/pages/Dashboard/Dashboard.jsx**

**Required Changes:**
- Call new `/api/dashboard/overview` endpoint instead of individual KPI calls
- Display order readiness timeline (days until delivery)
- Show upcoming payment reminders
- Display system alerts
- Show revenue trends chart

**API Integration:**
```javascript
// New API call
const fetchDashboardData = async () => {
  try {
    const response = await axios.get('/api/dashboard/overview', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const { data } = response.data;

    // data.kpis - Basic KPIs
    // data.orderInsights.readinessTimeline - Orders with days countdown
    // data.paymentInsights.upcomingPayments - Payment reminders
    // data.inventoryInsights - Stock status
    // data.revenueAnalytics - Revenue trends
    // data.alerts - System alerts

    setDashboardData(data);
  } catch (error) {
    console.error('Failed to fetch dashboard:', error);
  }
};
```

**UI Components to Add:**
- **Order Readiness Cards:** Show "15 days to delivery" for Order #123
- **Payment Reminder List:** "Payment for Order XYZ due in 3 days"
- **Revenue Chart:** Line chart showing last 7 days revenue trend
- **Alert Badges:** Warning for at-risk orders, low stock items

---

### 2. Inventory Page Enhancement

**File: frontend/src/pages/Inventory/LotsList.jsx**

**Required Changes:**
- Display Product Name and SKU Code columns
- Show growth stage with visual indicators (progress bar or badges)
- Calculate and display "Days to Ready" based on `expected_ready_date`
- Color code lots by status:
  - Green: Ready
  - Yellow: 7 days or less to ready
  - Blue: Growing
  - Gray: Allocated

**API Integration:**
```javascript
// Enhanced lot listing
const fetchLots = async () => {
  const response = await axios.get('/api/lots', {
    params: { page, limit, growth_stage, sku_id },
    headers: { Authorization: `Bearer ${token}` }
  });

  // Response includes: product_name, sku_code, growth_stage, expected_ready_date
  const lots = response.data.data.map(lot => ({
    ...lot,
    daysToReady: calculateDaysToReady(lot.expected_ready_date),
    statusColor: getStatusColor(lot.growth_stage, lot.expected_ready_date)
  }));

  setLots(lots);
};

const calculateDaysToReady = (expectedReadyDate) => {
  const today = new Date();
  const readyDate = new Date(expectedReadyDate);
  const diffTime = readyDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

const getStatusColor = (stage, expectedReadyDate) => {
  if (stage === 'ready') return 'success';
  const daysToReady = calculateDaysToReady(expectedReadyDate);
  if (daysToReady <= 7) return 'warning';
  return 'info';
};
```

**Table Columns to Add:**
```jsx
<TableHead>
  <TableRow>
    <TableCell>Lot Number</TableCell>
    <TableCell>Product Name</TableCell>
    <TableCell>SKU Code</TableCell>
    <TableCell>Growth Stage</TableCell>
    <TableCell>Days to Ready</TableCell>
    <TableCell>Quantity</TableCell>
    <TableCell>Available</TableCell>
    <TableCell>Allocated</TableCell>
    <TableCell>Actions</TableCell>
  </TableRow>
</TableHead>
```

---

### 3. Inventory Summary Page (NEW)

**File: frontend/src/pages/Inventory/InventorySummary.jsx** (Create new)

**Purpose:** Show aggregated view of inventory by product/SKU

**API Integration:**
```javascript
const fetchInventorySummary = async () => {
  const response = await axios.get('/api/inventory/summary', {
    params: { product_id, growth_stage },
    headers: { Authorization: `Bearer ${token}` }
  });

  // Response grouped by product -> SKU -> growth_stage
  // Shows: lot_count, total_quantity, available_quantity, allocated_quantity
  // lots_with_orders, lots_available_walkin

  setInventorySummary(response.data.data);
};
```

**UI Components:**
- **Product Cards:** Show each product with total lots and quantities
- **SKU Breakdown:** Expandable rows showing SKUs under each product
- **Growth Stage Pills:** Visual indicators for each stage
- **Reserved vs Walk-in Split:** Chart showing allocated vs available

---

### 4. Order Creation Enhancement

**File: frontend/src/pages/Orders/CreateOrder.jsx**

**Critical Changes:**
- Add "Check Availability" button before order submission
- Validate delivery date against inventory maturity
- Show error if delivery date too early with suggested minimum date
- Display available lots for each SKU with ready dates

**API Integration:**
```javascript
const checkInventoryAvailability = async () => {
  try {
    const response = await axios.post('/api/orders/check-availability', {
      items: orderItems, // [{ sku_id, quantity }]
      delivery_date: deliveryDate
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const { all_available, data } = response.data;

    if (!all_available) {
      // Show warning with suggested dates
      const unavailableItems = data.filter(item => !item.available);

      setAvailabilityErrors(unavailableItems.map(item => ({
        skuCode: item.sku_code,
        productName: item.product_name,
        requestedQty: item.requested_quantity,
        availableQty: item.available_quantity,
        nextAvailableDate: item.next_available_date,
        message: `Only ${item.available_quantity} available by ${deliveryDate}.
                  Next availability: ${item.next_available_date}`
      })));

      return false;
    }

    return true;
  } catch (error) {
    console.error('Availability check failed:', error);
    return false;
  }
};

const handleSubmitOrder = async () => {
  // Step 1: Check availability
  const isAvailable = await checkInventoryAvailability();

  if (!isAvailable) {
    alert('Some items are not available by the requested delivery date. Please adjust.');
    return;
  }

  // Step 2: Create order
  // ... existing order creation logic
};
```

**UI Components to Add:**
- **Check Availability Button:** Before final submit
- **Availability Status Indicators:** Green/Red for each item
- **Suggested Delivery Date:** If current date too early
- **Lot Details Popover:** Show which lots will fulfill the order

---

### 5. Payment Management Page Enhancement

**File: frontend/src/pages/Payments/PaymentsList.jsx**

**Required Changes:**
- Show upcoming payment reminders prominently
- Display payment installments for orders
- Color code by urgency (overdue = red, due soon = orange)
- Add "Record Payment" quick action button

**API Integration:**
```javascript
const fetchUpcomingPayments = async () => {
  const response = await axios.get('/api/payments/upcoming', {
    params: { days: 7 },
    headers: { Authorization: `Bearer ${token}` }
  });

  // Response includes: order details, balance_amount, days_until_due, urgency
  setUpcomingPayments(response.data.data);
};

const fetchPaymentSummary = async () => {
  const response = await axios.get('/api/payments/summary', {
    params: { period: 'month' },
    headers: { Authorization: `Bearer ${token}` }
  });

  // Response includes: collected amount by method, outstanding amount
  setPaymentSummary(response.data.data);
};
```

**UI Components:**
- **Payment Reminder Cards:** "Order #123 - Due in 3 days - ₹5,000"
- **Payment Summary Dashboard:** Total collected vs outstanding
- **Quick Record Payment Form:** Modal for fast payment entry
- **Installment Timeline:** Visual timeline for installment orders

---

### 6. Reports Page Integration

**Files:**
- `frontend/src/pages/Reports/SalesDashboard.jsx`
- `frontend/src/pages/Reports/InventoryReports.jsx`
- `frontend/src/pages/Reports/DeliveryReports.jsx`

**Required Changes:**
All report pages should:
1. Have date range pickers (start_date, end_date)
2. Group by selector (day/week/month)
3. Display loading states
4. Show charts (use recharts or chart.js)
5. Export to CSV functionality

**Example API Integration (Sales Report):**
```javascript
const fetchSalesReport = async () => {
  const response = await axios.get('/api/reports/sales', {
    params: {
      start_date: startDate,
      end_date: endDate,
      group_by: groupBy
    },
    headers: { Authorization: `Bearer ${token}` }
  });

  const { summary, salesOverTime, productSales, topCustomers } = response.data.data;

  setSalesData({
    summary,      // Total orders, revenue, avg order value
    chartData: salesOverTime,  // For line chart
    productSales, // For bar chart
    topCustomers  // For table
  });
};
```

**UI Components:**
- **Summary Cards:** Total Revenue, Orders, Avg Order Value
- **Revenue Trend Chart:** Line chart showing revenue over time
- **Product Sales Chart:** Bar chart of top products
- **Top Customers Table:** List with order count and total spent

---

### 7. Delivery Page Implementation

**File: frontend/src/pages/Delivery/DeliveryList.jsx** (May need to create)

**Purpose:** Show delivery routes and their status

**API Integration:**
```javascript
const fetchDeliveryRoutes = async () => {
  const response = await axios.get('/api/routes', {
    params: { status, routeDate, page, limit },
    headers: { Authorization: `Bearer ${token}` }
  });

  setRoutes(response.data.routes);
};

const fetchDeliverySummary = async () => {
  const response = await axios.get('/api/delivery/summary', {
    headers: { Authorization: `Bearer ${token}` }
  });

  setSummary(response.data.data);
};
```

**UI Components:**
- **Route Cards:** Show route number, driver, vehicle, stops count
- **Route Status Badges:** Planned, Assigned, In Progress, Completed
- **Map View:** Optional - show routes on map
- **Driver Performance Table:** Deliveries completed today

---

## PART 4B: TESTING & VALIDATION PLAN

### Backend API Testing

#### Phase 1: Inventory APIs
**Test Cases:**

1. **QR Code Generation**
   ```bash
   # Create a new lot and verify QR code is generated
   POST /api/lots
   {
     "sku_id": "<valid_sku_id>",
     "quantity": 1000,
     "planted_date": "2025-01-15",
     "growth_stage": "seed"
   }

   # Expected: Response includes qr_code and qr_code_url fields
   ```

2. **Inventory Summary**
   ```bash
   GET /api/inventory/summary

   # Expected: Returns grouped data by product/SKU/stage
   # Verify: lot_count, total_quantity, allocated_quantity, available_quantity
   ```

3. **Lot Growth Status**
   ```bash
   GET /api/lots/<lot_id>/growth-status

   # Expected: Returns calculated_stage, growth_percentage, days_until_ready
   ```

4. **Product Inventory Breakdown**
   ```bash
   GET /api/inventory/product/<product_id>/breakdown

   # Expected: Returns all lots for product with allocation status
   # Verify: Shows "Reserved for Order" vs "Available for Walk-in"
   ```

#### Phase 2: Order Creation Validation
**Test Cases:**

1. **Check Availability - Valid Date**
   ```bash
   POST /api/orders/check-availability
   {
     "items": [
       { "sku_id": "<sku_id>", "quantity": 500 }
     ],
     "delivery_date": "2025-05-01"  # Far future date
   }

   # Expected: all_available = true, shows available lots
   ```

2. **Check Availability - Date Too Early**
   ```bash
   POST /api/orders/check-availability
   {
     "items": [
       { "sku_id": "<sku_id>", "quantity": 500 }
     ],
     "delivery_date": "2025-01-25"  # Too soon
   }

   # Expected: all_available = false, shows next_available_date
   ```

3. **Create Order - Maturity Validation**
   ```bash
   POST /api/orders
   {
     "customer_id": "<customer_id>",
     "delivery_address_id": "<address_id>",
     "delivery_date": "2025-01-20",  # Before lot ready date
     "items": [...]
   }

   # Expected: 409 error with details about days_short and minimum delivery date
   ```

4. **Create Order - Valid Date**
   ```bash
   POST /api/orders
   {
     "customer_id": "<customer_id>",
     "delivery_address_id": "<address_id>",
     "delivery_date": "2025-04-01",  # After lot ready date
     "items": [...]
   }

   # Expected: Order created successfully with expected_ready_date set
   ```

#### Phase 3: Dashboard APIs
**Test Cases:**

1. **Dashboard Overview**
   ```bash
   GET /api/dashboard/overview

   # Expected: Returns all sections:
   # - kpis (counts and amounts)
   # - orderInsights (readinessTimeline with days_until_ready)
   # - paymentInsights (upcomingPayments with urgency)
   # - inventoryInsights (byGrowthStage, lowStockProducts)
   # - revenueAnalytics (dailyTrend, monthlyComparison)
   # - alerts (warnings for at-risk orders)

   # Verify readinessTimeline includes:
   # - daysUntilReady
   # - daysUntilDelivery
   # - readinessStatus (At Risk, Urgent, Soon, On Track)
   ```

2. **Order Readiness Countdown**
   ```bash
   # Verify orderInsights.readinessTimeline shows correct countdown
   # For order with delivery_date = '2025-02-01' and expected_ready_date = '2025-01-28'
   # Should show: daysUntilReady = (days between now and 2025-01-28)
   ```

#### Phase 4: Payment APIs
**Test Cases:**

1. **Payment Summary**
   ```bash
   GET /api/payments/summary?period=month

   # Expected: Returns collected and outstanding breakdown
   # Verify: total_collected, overdue_amount, upcoming_installments
   ```

2. **Upcoming Payments**
   ```bash
   GET /api/payments/upcoming?days=7

   # Expected: Returns orders with balance > 0 and delivery_date within 7 days
   # Verify: days_until_due, urgency (high/normal)
   ```

3. **Record Offline Payment**
   ```bash
   POST /api/payments/record
   {
     "order_id": "<order_id>",
     "amount": 5000,
     "payment_method": "cash",
     "receipt_number": "RCPT-001",
     "notes": "Partial payment"
   }

   # Expected: Payment recorded, order balance updated
   ```

4. **Get Order Installments**
   ```bash
   GET /api/payments/installments/<order_id>

   # Expected: Returns installment schedule with paid/pending status
   ```

#### Phase 5: Reports APIs
**Test Cases:**

1. **Sales Report**
   ```bash
   GET /api/reports/sales?start_date=2025-01-01&end_date=2025-01-31&group_by=day

   # Expected: Returns summary, salesOverTime array, productSales, topCustomers
   # Verify: Data aggregated by day
   ```

2. **Inventory Report**
   ```bash
   GET /api/reports/inventory

   # Expected: Returns summary with totalLots, availableUnits
   # Verify: byGrowthStage, byProduct, stockAlerts, upcomingReady
   ```

3. **Financial Report**
   ```bash
   GET /api/reports/financial?start_date=2025-01-01&end_date=2025-01-31&group_by=month

   # Expected: Returns revenue summary and payment method breakdown
   # Note: Expenses = 0 (not implemented yet)
   ```

#### Phase 6: Delivery APIs
**Test Cases:**

1. **Delivery Summary**
   ```bash
   GET /api/delivery/summary

   # Expected: Returns activeRoutesToday, deliveriesToday, upcomingDeliveries
   ```

2. **Available Orders for Delivery**
   ```bash
   GET /api/delivery/available-orders?delivery_date=2025-01-25

   # Expected: Returns orders with status='ready' not assigned to any route
   ```

3. **Create Delivery Route**
   ```bash
   POST /api/routes
   {
     "orderIds": ["<order_id_1>", "<order_id_2>"],
     "routeDate": "2025-01-26",
     "plannedStartTime": "2025-01-26T08:00:00Z"
   }

   # Expected: Route created with optimized stops
   ```

---

### Integration Testing Scenarios

#### Scenario 1: Complete Order Lifecycle
**Steps:**
1. Create product with growth_period_days = 25
2. Create SKU for product
3. Create lot with planted_date = today
4. Verify lot.expected_ready_date = today + 25 days
5. Try to create order with delivery_date = today + 10 days
6. **Expected:** Order creation fails with error: "Products need 15 more days to mature"
7. Create order with delivery_date = today + 30 days
8. **Expected:** Order created successfully
9. Verify order.expected_ready_date matches lot.expected_ready_date
10. Check dashboard - order should appear in readinessTimeline

#### Scenario 2: Payment Tracking
**Steps:**
1. Create order with payment_type = "installment"
2. Create payment installments (3 installments)
3. Record first installment payment
4. GET /api/payments/upcoming - verify shows next installment due
5. Check dashboard - verify appears in paymentInsights.upcomingPayments
6. Record second installment
7. Verify order.paid_amount updated correctly

#### Scenario 3: Inventory Visibility
**Steps:**
1. Create product "Tomato"
2. Create 2 SKUs: "TOM-MED-POT" and "TOM-LRG-POT"
3. Create 5 lots for TOM-MED-POT at different growth stages
4. Create 3 lots for TOM-LRG-POT
5. GET /api/inventory/summary
6. **Verify:** Shows breakdown by SKU with lot counts
7. Allocate 2 lots to orders
8. GET /api/inventory/summary
9. **Verify:** Shows allocated_quantity and available_quantity correctly
10. Check inventory page - verify shows "Reserved for Order" vs "Available for Walk-in"

#### Scenario 4: Dashboard Insights
**Steps:**
1. Create 3 orders with different delivery dates
2. Create lots that will be ready before some orders but not others
3. GET /api/dashboard/overview
4. **Verify orderInsights.readinessTimeline shows:**
   - Orders with daysUntilReady
   - Orders with readinessStatus = "At Risk" if expected_ready_date > delivery_date
5. **Verify paymentInsights shows:**
   - Orders with pending payments
   - Overdue count and amount
6. **Verify alerts include:**
   - Warning for at-risk orders
   - Low stock alerts

---

### Frontend Testing Checklist

#### Dashboard Page
- [ ] KPIs display correct counts (active orders, ready lots, pending deliveries)
- [ ] Revenue for current month shows correctly
- [ ] Order readiness timeline displays with countdown (e.g., "15 days to delivery")
- [ ] Upcoming payments section shows orders with balance > 0
- [ ] System alerts appear (at-risk orders, low stock, overdue payments)
- [ ] Revenue trend chart displays last 7 days
- [ ] Top products section shows correct data

#### Inventory Page
- [ ] Lot list shows Product Name column
- [ ] Lot list shows SKU Code column
- [ ] Growth stage displays with visual indicator (badge/progress bar)
- [ ] Days to ready calculated and displayed
- [ ] Lots color-coded by status (ready=green, urgent=yellow, etc.)
- [ ] Available quantity vs allocated quantity visible
- [ ] Filter by growth stage works
- [ ] Filter by product/SKU works
- [ ] QR code can be downloaded for each lot

#### Inventory Summary Page
- [ ] Product cards show total lots and quantities
- [ ] SKU breakdown expandable under each product
- [ ] Shows lots reserved for orders vs available for walk-in
- [ ] Low stock warnings display correctly
- [ ] Growth stage distribution visible

#### Order Creation Page
- [ ] "Check Availability" button present
- [ ] Clicking check availability validates delivery date
- [ ] Error shows if delivery date too early with suggested minimum date
- [ ] Available lots displayed for each SKU
- [ ] Order submission blocked if inventory not available
- [ ] Success message shows when order created

#### Payments Page
- [ ] Upcoming payment reminders displayed
- [ ] Color coding by urgency (red=overdue, orange=due soon)
- [ ] Payment summary shows collected vs outstanding
- [ ] "Record Payment" button opens modal
- [ ] Payment installments visible for installment orders
- [ ] Payment history table shows all transactions

#### Reports Page
- [ ] Date range picker works
- [ ] Group by selector (day/week/month) functions
- [ ] Sales report shows revenue trends chart
- [ ] Inventory report displays stock by stage
- [ ] Delivery report shows performance metrics
- [ ] Financial report shows revenue breakdown
- [ ] Export to CSV works (optional feature)

#### Delivery Page
- [ ] Route list displays with status badges
- [ ] Driver and vehicle information visible
- [ ] Available orders for delivery shown
- [ ] Create route button opens form
- [ ] Route creation submits successfully
- [ ] Route progress can be tracked

---

### Performance Testing

**Load Testing Scenarios:**

1. **Dashboard Load Time**
   - Target: < 2 seconds to load all dashboard data
   - Test with 1000+ orders, 5000+ lots in database

2. **Inventory Summary Query**
   - Target: < 1 second to aggregate inventory by product/SKU
   - Test with 100 products, 200 SKUs, 10,000 lots

3. **Order Creation Validation**
   - Target: < 500ms to check availability for 10 items
   - Test with complex lot allocation scenarios

4. **Report Generation**
   - Target: < 3 seconds to generate sales report for 30-day period
   - Test with 500+ orders in date range

---

### Deployment Checklist

**Pre-Deployment:**
- [ ] All backend migrations run successfully
- [ ] QR code utility tested and working
- [ ] Sample data created for testing (products, SKUs, lots, customers, orders)
- [ ] All new API endpoints tested with Postman/curl
- [ ] Error handling verified for all endpoints
- [ ] Authentication middleware working on all protected routes

**Post-Deployment:**
- [ ] Frontend connects to backend APIs successfully
- [ ] No console errors in browser
- [ ] All pages load without 404 errors
- [ ] Test with real data flow: create product → create lot → create order → check dashboard
- [ ] Verify notifications/WhatsApp integration still working
- [ ] Check database query performance with EXPLAIN ANALYZE
- [ ] Monitor error logs for first 24 hours

---

## Summary

### Backend Files Created/Modified (Total: ~20 files)

**New Files:**
1. `backend/controllers/inventoryController.js`
2. `backend/routes/inventory.js`
3. `backend/services/salesReportService.js`
4. `backend/services/inventoryReportService.js`
5. `backend/services/financialReportService.js`
6. `backend/utils/qrCodeGenerator.js`

**Modified Files:**
1. `backend/controllers/lotController.js` (add getLotGrowthStatus)
2. `backend/controllers/orderController.js` (enhance createOrder, checkAvailability)
3. `backend/controllers/dashboardController.js` (complete overhaul)
4. `backend/controllers/paymentController.js` (add 3 endpoints)
5. `backend/controllers/deliveryController.js` (add 2 endpoints)
6. `backend/routes/lots.js`
7. `backend/routes/dashboard.js`
8. `backend/routes/payments.js`
9. `backend/routes/delivery.js`
10. `backend/server.js` (register inventory routes)

### Frontend Files to Update (User Implementation)

**Critical Updates:**
1. `frontend/src/pages/Dashboard/Dashboard.jsx`
2. `frontend/src/pages/Inventory/LotsList.jsx`
3. `frontend/src/pages/Orders/CreateOrder.jsx`
4. `frontend/src/pages/Payments/PaymentsList.jsx`

**New Pages to Create:**
5. `frontend/src/pages/Inventory/InventorySummary.jsx`
6. `frontend/src/pages/Delivery/DeliveryList.jsx` (if doesn't exist)

**Enhancement:**
7. All report pages to use new APIs

### New API Endpoints (Total: 15)

**Inventory:**
- `GET /api/inventory/summary`
- `GET /api/inventory/product/:product_id/breakdown`
- `GET /api/lots/:id/growth-status`

**Dashboard:**
- `GET /api/dashboard/overview`

**Payments:**
- `GET /api/payments/summary`
- `GET /api/payments/upcoming`
- `GET /api/payments/installments/:orderId`

**Delivery:**
- `GET /api/delivery/summary`
- `GET /api/delivery/available-orders`

**Orders:** (Enhanced)
- `POST /api/orders/check-availability` (enhanced with lot details)
- `POST /api/orders` (enhanced with maturity validation)

**Reports:** (Services created)
- `GET /api/reports/sales`
- `GET /api/reports/inventory`
- `GET /api/reports/financial`

---

## Next Steps for Implementation

1. **Implement all backend changes from PART 1, 2, 3** (Controllers, Services, Routes)
2. **Test each endpoint using Postman/curl** with checklist above
3. **Update frontend pages** according to integration guide
4. **Test end-to-end flows** using integration scenarios
5. **Deploy to staging** environment
6. **User acceptance testing** with real workflows
7. **Production deployment** with monitoring

---

**End of Phase 21 Implementation Plan**
