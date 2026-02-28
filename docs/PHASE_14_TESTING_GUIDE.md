# Phase 14 Testing Guide: Frontend - Payments & Reports

This guide provides comprehensive testing instructions for all Phase 14 frontend features.

---

## Prerequisites

### 1. Environment Setup
```bash
# Ensure backend server is running
cd backend
npm run dev  # Should run on http://localhost:5000

# Start frontend development server
cd frontend
npm run dev  # Should run on http://localhost:5173
```

### 2. Login Credentials
```
Admin User:
Email: admin@nursery.com
Password: admin123

Manager User:
Email: manager@nursery.com
Password: manager123
```

### 3. Test Data Requirements
- At least 5-10 existing orders
- At least 3 customers with orders
- Some orders with outstanding payments
- Sample payment records

---

## Test Suite 1: Payments List Page (Issue #64)

### Test 1.1: Navigate to Payments Page
**Steps:**
1. Login to the application
2. Click on "Payments" in the sidebar/navigation
3. URL should be `/payments`

**Expected Result:**
- ✅ Payments page loads successfully
- ✅ Page title shows "Payments"
- ✅ "Record Payment" button visible
- ✅ "Export" button visible
- ✅ Filters panel displayed

### Test 1.2: View Payments Table
**Steps:**
1. Navigate to Payments page
2. Observe the payments table

**Expected Result:**
- ✅ Table displays payment records
- ✅ Columns: Payment ID, Order Number, Customer, Amount, Payment Method, Status, Date, Actions
- ✅ Currency formatted in INR (₹)
- ✅ Status badges color-coded:
  - Success = Green
  - Pending = Yellow
  - Failed = Red
  - Refunded = Gray
- ✅ Payment method chips displayed
- ✅ Pagination controls at bottom

### Test 1.3: Search Functionality
**Steps:**
1. Enter an order number in the search box
2. Click "Apply" button
3. Clear search and try transaction ID

**Expected Result:**
- ✅ Table filters to show matching records
- ✅ Search works for order number
- ✅ Search works for transaction ID
- ✅ "No payments found" message if no results

### Test 1.4: Filter by Payment Method
**Steps:**
1. Click on "CASH" chip
2. Click "Apply"
3. Click "CASH" again to deselect
4. Try other methods (UPI, CARD, BANK TRANSFER)

**Expected Result:**
- ✅ Only payments with selected method shown
- ✅ Selected chip highlighted in blue
- ✅ Chip deselects when clicked again
- ✅ All methods filter correctly

### Test 1.5: Filter by Status
**Steps:**
1. Click on "SUCCESS" status chip
2. Click "Apply"
3. Try other statuses (PENDING, FAILED, REFUNDED)

**Expected Result:**
- ✅ Only payments with selected status shown
- ✅ Status filter works correctly
- ✅ Can select/deselect status

### Test 1.6: Date Range Filter
**Steps:**
1. Click on "Start Date" picker
2. Select a date from the past
3. Click on "End Date" picker
4. Select today's date
5. Click "Apply"

**Expected Result:**
- ✅ Date picker opens correctly
- ✅ Selected dates appear in the field
- ✅ Only payments within date range shown
- ✅ Can clear dates with X button

### Test 1.7: Reset Filters
**Steps:**
1. Apply multiple filters (method, status, dates)
2. Click "Reset" button

**Expected Result:**
- ✅ All filters cleared
- ✅ Table shows all payments again
- ✅ Filter inputs reset to default

### Test 1.8: Pagination
**Steps:**
1. Navigate to Payments page
2. Change "Rows per page" to 10, 20, 50
3. Click page navigation arrows

**Expected Result:**
- ✅ Table updates with selected rows per page
- ✅ Page numbers update correctly
- ✅ Can navigate to next/previous pages
- ✅ Total count displayed correctly

### Test 1.9: View Receipt
**Steps:**
1. Click the receipt icon for any payment
2. Wait for PDF to generate

**Expected Result:**
- ✅ PDF opens in new tab/window
- ✅ Receipt contains payment details
- ✅ No errors in console

**Note:** If backend endpoint not implemented, expect 404 error.

### Test 1.10: Export Payments
**Steps:**
1. Apply some filters (optional)
2. Click "Export" button
3. Wait for download

**Expected Result:**
- ✅ Excel file downloads
- ✅ Filename: `payments-YYYY-MM-DD.xlsx`
- ✅ File contains filtered data
- ✅ Success toast notification shown

**Note:** If backend endpoint not implemented, expect error.

---

## Test Suite 2: Record Payment Form (Issue #65)

### Test 2.1: Open Record Payment Form
**Steps:**
1. Navigate to Payments page
2. Click "Record Payment" button

**Expected Result:**
- ✅ Modal dialog opens
- ✅ Modal title: "Record Payment"
- ✅ Form fields visible
- ✅ "Cancel" and "Record Payment" buttons

### Test 2.2: Select Order
**Steps:**
1. Click on "Select Order" dropdown
2. Type to search for an order
3. Select an order from the list

**Expected Result:**
- ✅ Autocomplete dropdown works
- ✅ Orders displayed with: order number, customer name, balance
- ✅ Outstanding balance shown below dropdown
- ✅ Amount field auto-filled with balance

### Test 2.3: Enter Payment Amount
**Steps:**
1. Select an order
2. Clear the amount field
3. Enter an amount less than balance
4. Try entering amount greater than balance

**Expected Result:**
- ✅ Can enter decimal amounts
- ✅ Validation error if amount > balance
- ✅ Error message: "Amount cannot exceed outstanding balance of ₹X"
- ✅ Cannot submit if amount <= 0

### Test 2.4: Select Payment Method
**Steps:**
1. Click "Payment Method" dropdown
2. Select each method: Cash, Bank Transfer, UPI, Card

**Expected Result:**
- ✅ All methods available
- ✅ Selection updates correctly
- ✅ Transaction reference field appears for Bank Transfer/UPI
- ✅ Transaction reference NOT shown for Cash/Card

### Test 2.5: Transaction Reference (Bank Transfer)
**Steps:**
1. Select "Bank Transfer" as method
2. Leave transaction reference empty
3. Try to submit

**Expected Result:**
- ✅ Transaction reference field required
- ✅ Error message: "Transaction reference is required"
- ✅ Cannot submit without it

### Test 2.6: Payment Date
**Steps:**
1. Click on payment date field
2. Try selecting a future date
3. Select today's date or past date

**Expected Result:**
- ✅ Date picker opens
- ✅ Error if future date selected: "Payment date cannot be in the future"
- ✅ Defaults to today
- ✅ Can select past dates

### Test 2.7: Optional Notes
**Steps:**
1. Enter text in the Notes field (optional)
2. Submit form with and without notes

**Expected Result:**
- ✅ Notes field accepts text
- ✅ Form submits with or without notes
- ✅ Multiline text supported

### Test 2.8: Form Validation
**Steps:**
1. Try submitting empty form
2. Fill only some fields
3. Fill all required fields

**Expected Result:**
- ✅ Cannot submit if order not selected
- ✅ Cannot submit if amount invalid
- ✅ Error messages shown for each invalid field
- ✅ All errors shown simultaneously

### Test 2.9: Submit Payment
**Steps:**
1. Fill all required fields correctly
2. Click "Record Payment"
3. Wait for response

**Expected Result:**
- ✅ Loading indicator shown
- ✅ "Record Payment" button disabled during submission
- ✅ Success toast: "Payment recorded successfully"
- ✅ Modal closes
- ✅ Payments table refreshes with new payment

**Note:** Requires backend API to be functional.

### Test 2.10: Cancel Form
**Steps:**
1. Fill some form fields
2. Click "Cancel" button

**Expected Result:**
- ✅ Modal closes
- ✅ Form data cleared
- ✅ No payment created
- ✅ No errors

---

## Test Suite 3: Customer Payment History (Issue #66)

### Test 3.1: Navigate to Customer Payments
**Steps:**
1. Navigate to Customers page
2. Click on a customer
3. Navigate to `/payments/customer/{customerId}`

**Expected Result:**
- ✅ Customer payment history page loads
- ✅ Page title: "Payment History"
- ✅ "Download Statement" button visible
- ✅ Payment summary cards displayed

### Test 3.2: View Payment Summary Cards
**Steps:**
1. Observe the four KPI cards

**Expected Result:**
- ✅ **Total Paid** - Shows total amount paid (green)
- ✅ **Pending** - Shows pending balance (orange)
- ✅ **Overdue** - Shows overdue amount (red)
- ✅ **Credit Used** - Shows credit amount (blue)
- ✅ All amounts formatted in INR
- ✅ Icons displayed correctly

### Test 3.3: View Outstanding Orders
**Steps:**
1. Scroll to "Outstanding Orders" section
2. Observe the table

**Expected Result:**
- ✅ Table shows orders with balance > 0
- ✅ Columns: Order Number, Total Amount, Balance, Due Date, Actions
- ✅ Overdue orders highlighted in red background
- ✅ "OVERDUE" badge shown for past due dates
- ✅ "Pay Now" button for each order

### Test 3.4: Initiate Payment for Order
**Steps:**
1. Click "Pay Now" button for an outstanding order
2. Observe the action

**Expected Result:**
- ✅ Info toast: "Payment gateway integration pending"
- ✅ No errors in console

**Note:** Full Razorpay integration pending.

### Test 3.5: View All Payments Table
**Steps:**
1. Scroll to "All Payments" section
2. Observe the payments table

**Expected Result:**
- ✅ All customer payments listed
- ✅ Columns: Order Number, Amount, Payment Method, Date, Status
- ✅ Payment method shown as chips
- ✅ Status shown with color-coded badges
- ✅ Sorted by date (newest first)

### Test 3.6: Download Payment Statement
**Steps:**
1. Click "Download Statement" button
2. Wait for download

**Expected Result:**
- ✅ PDF file downloads
- ✅ Filename: `payment-statement-{customerId}-YYYY-MM-DD.pdf`
- ✅ PDF contains all customer payments
- ✅ Success toast shown

**Note:** Requires backend PDF generation endpoint.

### Test 3.7: Empty State
**Steps:**
1. Navigate to a customer with no payments

**Expected Result:**
- ✅ "No payments found" message displayed
- ✅ All summary cards show ₹0
- ✅ No errors

---

## Test Suite 4: Sales Dashboard (Issue #67)

### Test 4.1: Navigate to Sales Dashboard
**Steps:**
1. Navigate to `/reports/sales`

**Expected Result:**
- ✅ Sales Dashboard page loads
- ✅ Page title: "Sales Dashboard"
- ✅ "Export Report" button visible
- ✅ Filters panel displayed
- ✅ KPI cards visible

### Test 4.2: View KPI Cards
**Steps:**
1. Observe the four KPI cards at the top

**Expected Result:**
- ✅ **Total Revenue** - Currency amount
- ✅ **Total Orders** - Count
- ✅ **Avg Order Value** - Currency amount
- ✅ **Growth** - Percentage with +/- sign
  - Green if positive
  - Red if negative

### Test 4.3: Date Range Presets
**Steps:**
1. Click "Date Range" dropdown
2. Try each preset:
   - Today
   - Yesterday
   - Last 7 Days
   - Last 30 Days
   - This Month
   - Last Month

**Expected Result:**
- ✅ Each preset updates the date range
- ✅ Charts refresh with new data
- ✅ Dates auto-fill based on preset

### Test 4.4: Custom Date Range
**Steps:**
1. Select "Custom" from date range dropdown
2. Select start and end dates
3. Click "Apply"

**Expected Result:**
- ✅ Start and end date pickers appear
- ✅ Can select any date range
- ✅ End date must be >= start date
- ✅ Charts update when applied

### Test 4.5: Group By Selection
**Steps:**
1. Select "Group By" dropdown
2. Try: Day, Week, Month

**Expected Result:**
- ✅ Revenue chart updates grouping
- ✅ X-axis labels change appropriately
- ✅ Data aggregates correctly

### Test 4.6: Revenue Trend Chart
**Steps:**
1. Observe the area chart

**Expected Result:**
- ✅ Chart displays revenue over time
- ✅ Gradient fill (blue)
- ✅ X-axis shows dates
- ✅ Y-axis shows currency amounts
- ✅ Tooltips show on hover
- ✅ Responsive to window resize

### Test 4.7: Top Products Chart
**Steps:**
1. Scroll to "Top 10 Products" chart

**Expected Result:**
- ✅ Horizontal bar chart
- ✅ Shows up to 10 products
- ✅ Bars color-coded
- ✅ Product names on Y-axis
- ✅ Revenue amounts on X-axis
- ✅ Tooltip shows details on hover

### Test 4.8: Order Status Pie Chart
**Steps:**
1. View "Order Status Breakdown" pie chart

**Expected Result:**
- ✅ Pie chart with status segments
- ✅ Colors: Completed=green, Pending=orange, Cancelled=red
- ✅ Labels show status and count
- ✅ Legend displayed
- ✅ Tooltip on hover

### Test 4.9: Payment Breakdown Chart
**Steps:**
1. View "Payment Collection Metrics" pie chart

**Expected Result:**
- ✅ Shows payment methods distribution
- ✅ Segments: Cash, UPI, Card, Bank Transfer, Credit
- ✅ Labels show method and amount
- ✅ Currency formatted
- ✅ Interactive tooltips

### Test 4.10: Export Sales Report
**Steps:**
1. Click "Export Report" button

**Expected Result:**
- ✅ Excel file downloads
- ✅ Filename: `sales-report-YYYY-MM-DD.xlsx`
- ✅ Contains all report data
- ✅ Success toast notification

**Note:** Requires backend export endpoint.

---

## Test Suite 5: Inventory Reports (Issue #68)

### Test 5.1: Navigate to Inventory Reports
**Steps:**
1. Navigate to `/reports/inventory`

**Expected Result:**
- ✅ Inventory Reports page loads
- ✅ Page title: "Inventory Reports"
- ✅ Filters panel visible
- ✅ "Export Report" button visible

### Test 5.2: View Stock Levels Table
**Steps:**
1. Observe the stock levels table

**Expected Result:**
- ✅ Table columns: SKU Name, Current Stock, Min Threshold, Max Threshold, Status
- ✅ Status icons:
  - Red warning for low stock
  - Green check for adequate stock
- ✅ Low stock items highlighted in red
- ✅ Status chips color-coded

### Test 5.3: Low Stock Alert
**Steps:**
1. Observe the alert banner at the top (if low stock items exist)

**Expected Result:**
- ✅ Yellow warning banner displayed
- ✅ Message: "X items are running low on stock!"
- ✅ Lists first 3 items by name
- ✅ Shows "and X more..." if > 3 items

### Test 5.4: Growth Stage Distribution Chart
**Steps:**
1. View the donut chart on the right

**Expected Result:**
- ✅ Donut chart with inner ring
- ✅ Segments: Seedling, Vegetative, Flowering, Ready
- ✅ Color-coded stages:
  - Seedling = Light green
  - Vegetative = Green
  - Flowering = Orange
  - Ready = Blue
- ✅ Labels show stage name and count
- ✅ Legend displayed

### Test 5.5: Filter by Product Category
**Steps:**
1. Select a product category from dropdown
2. Click "Apply Filters"

**Expected Result:**
- ✅ Table filters to selected category
- ✅ Chart updates accordingly
- ✅ Can select "All" to reset

### Test 5.6: Filter by Location
**Steps:**
1. Select a location (Greenhouse 1, Greenhouse 2, Outdoor)
2. Click "Apply Filters"

**Expected Result:**
- ✅ Only items at selected location shown
- ✅ Stage distribution updates
- ✅ Can reset to "All"

### Test 5.7: Filter by Stock Status
**Steps:**
1. Select "Low Stock" from dropdown
2. Click "Apply Filters"
3. Try "Adequate" and "High Stock"

**Expected Result:**
- ✅ Only items with selected status shown
- ✅ Low stock filter shows only red items
- ✅ Alert banner updates

### Test 5.8: Export Inventory Report
**Steps:**
1. Apply filters (optional)
2. Click "Export Report"

**Expected Result:**
- ✅ Excel file downloads
- ✅ Filename: `inventory-report-YYYY-MM-DD.xlsx`
- ✅ Contains filtered data with all details
- ✅ Success notification

**Note:** Requires backend export endpoint.

---

## Test Suite 6: Delivery Reports (Issue #69)

### Test 6.1: Navigate to Delivery Reports
**Steps:**
1. Navigate to `/reports/delivery`

**Expected Result:**
- ✅ Delivery Reports page loads
- ✅ Page title: "Delivery Performance Dashboard"
- ✅ "Export Report" button visible
- ✅ KPI cards displayed

### Test 6.2: View Delivery KPI Cards
**Steps:**
1. Observe the four KPI cards

**Expected Result:**
- ✅ **On-Time Delivery Rate** - Percentage with progress bar (green)
- ✅ **Avg Delivery Time** - Minutes (blue)
- ✅ **Total Deliveries** - Count (orange)
- ✅ **Failed Deliveries** - Count (red)
- ✅ Icons displayed correctly
- ✅ Progress bar for on-time rate

### Test 6.3: Filter by Driver
**Steps:**
1. Select a driver from dropdown
2. Click "Apply Filters"

**Expected Result:**
- ✅ All metrics filter to selected driver
- ✅ Driver performance chart highlights driver
- ✅ Can select "All Drivers" to reset

### Test 6.4: Filter by Date Range
**Steps:**
1. Select start date
2. Select end date
3. Click "Apply Filters"

**Expected Result:**
- ✅ Date pickers work correctly
- ✅ End date must be >= start date
- ✅ Charts update with filtered data

### Test 6.5: Delivery Trends Line Chart
**Steps:**
1. View the delivery trends chart

**Expected Result:**
- ✅ Multi-line chart with three lines:
  - On-Time (green)
  - Late (orange)
  - Failed (red)
- ✅ X-axis shows dates
- ✅ Y-axis shows count
- ✅ Tooltips on hover
- ✅ Legend displays correctly

### Test 6.6: Driver Performance Chart
**Steps:**
1. View the driver performance bar chart

**Expected Result:**
- ✅ Dual-axis bar chart
- ✅ Left axis: Total deliveries (blue bars)
- ✅ Right axis: On-time rate % (green bars)
- ✅ X-axis shows driver names
- ✅ Comparison between drivers visible
- ✅ Tooltips functional

### Test 6.7: Failed Delivery Reasons Pie Chart
**Steps:**
1. View the failure reasons pie chart

**Expected Result:**
- ✅ Pie chart with failure reasons
- ✅ Segments: Customer not available, Wrong address, etc.
- ✅ Labels show reason and count
- ✅ Color-coded segments
- ✅ Legend and tooltips

### Test 6.8: Export Delivery Report
**Steps:**
1. Apply filters (optional)
2. Click "Export Report"

**Expected Result:**
- ✅ Excel file downloads
- ✅ Filename: `delivery-report-YYYY-MM-DD.xlsx`
- ✅ Contains driver performance data
- ✅ Success notification

**Note:** Requires backend export endpoint.

---

## Cross-Browser Testing

### Browsers to Test
- ✅ Google Chrome (latest)
- ✅ Mozilla Firefox (latest)
- ✅ Microsoft Edge (latest)
- ✅ Safari (if on Mac)

### Expected Behavior
- All features work consistently
- Charts render correctly
- Date pickers function properly
- No console errors

---

## Responsive Design Testing

### Screen Sizes to Test

**Desktop (>1024px):**
- ✅ All charts display in full width
- ✅ Tables show all columns
- ✅ KPI cards in single row
- ✅ Filters in single row

**Tablet (768px - 1024px):**
- ✅ Charts stack vertically
- ✅ Tables scroll horizontally
- ✅ KPI cards wrap to 2 columns
- ✅ Filters stack vertically

**Mobile (<768px):**
- ✅ All elements stack vertically
- ✅ Tables scroll horizontally
- ✅ Charts resize appropriately
- ✅ Touch-friendly controls
- ✅ Date pickers mobile-friendly

---

## Performance Testing

### Load Time
**Expected:**
- ✅ Initial page load < 3 seconds
- ✅ Route navigation < 500ms
- ✅ Chart rendering < 1 second
- ✅ API calls complete < 2 seconds

### Console Warnings
**Check for:**
- ❌ No PropType errors
- ❌ No React key warnings
- ❌ No memory leaks
- ❌ No unhandled promise rejections

---

## Error Handling Testing

### Test Error Scenarios

**1. API Failure:**
- Disconnect backend
- Try loading pages
- Expected: Error toast notification

**2. Invalid Data:**
- Mock API with invalid data
- Check error boundaries
- Expected: Graceful error handling

**3. Network Timeout:**
- Slow network simulation
- Expected: Loading indicators, timeout handling

**4. Unauthorized Access:**
- Access without login
- Expected: Redirect to login page

---

## Accessibility Testing

### Keyboard Navigation
**Steps:**
1. Use Tab key to navigate
2. Use Enter to activate buttons
3. Use Arrow keys in dropdowns

**Expected:**
- ✅ All interactive elements focusable
- ✅ Focus indicators visible
- ✅ Logical tab order
- ✅ Can complete all actions with keyboard

### Screen Reader
**Steps:**
1. Use screen reader (NVDA, JAWS, VoiceOver)
2. Navigate through pages

**Expected:**
- ✅ All content readable
- ✅ Form labels announced
- ✅ Button purposes clear
- ✅ Chart data accessible

### Color Contrast
**Check:**
- ✅ Text readable on all backgrounds
- ✅ Status colors distinguishable
- ✅ Meets WCAG AA standards

---

## Known Issues & Workarounds

### Backend APIs Not Implemented
**Issue:** Phase 15 report APIs not yet created
**Workaround:** Use mock data or expect 404 errors
**Status:** Expected until Phase 15 completion

### Payment Gateway Incomplete
**Issue:** Razorpay integration placeholder
**Workaround:** Click shows info toast only
**Status:** Future enhancement

### Large Dataset Performance
**Issue:** Charts may slow with >1000 data points
**Workaround:** Use date range filters
**Status:** Consider pagination in future

---

## Test Results Template

```markdown
## Test Execution Report

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** Development/Staging/Production

### Issue #64: Payments List
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Issue #65: Payment Recording
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Issue #66: Customer Payments
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Issue #67: Sales Dashboard
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Issue #68: Inventory Reports
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Issue #69: Delivery Reports
- [ ] All tests passed
- [ ] Failures: [List any failures]

### Overall Status
- Total Tests: X
- Passed: X
- Failed: X
- Success Rate: X%

### Notes
[Any additional observations or issues found]
```

---

## Success Criteria

**All Phase 14 features are considered successfully tested when:**

✅ All navigation works correctly
✅ All forms submit and validate properly
✅ All charts render without errors
✅ All filters and search functions work
✅ All export functions trigger downloads
✅ Responsive design works on all screen sizes
✅ No console errors in production build
✅ Accessibility requirements met
✅ Cross-browser compatibility verified

---

**Testing Guide Version:** 1.0
**Last Updated:** October 18, 2025
**Phase Status:** Ready for Testing
