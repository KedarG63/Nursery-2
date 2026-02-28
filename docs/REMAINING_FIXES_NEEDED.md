# Remaining Fixes Needed

## Summary of Issues Fixed in This Session

### ✅ FIXED: Lot Creation Issues
1. **Field name mismatches** between frontend and backend
   - Fixed: `stage` → `growth_stage`
   - Fixed: Added required `planted_date` field
   - Fixed: Location changed to dropdown with valid values

2. **QR Code Generation**
   - Fixed: QR codes now generate on-the-fly when S3 not configured
   - Fixed: Download works correctly as PNG

3. **Inventory Display Issues**
   - Fixed: SKU name now displays correctly (`sku_code` and `product_name`)
   - Fixed: Expected ready date displays from `expected_ready_date`
   - Fixed: Growth stage dropdown shows correct current stage
   - Fixed: Stage update API calls use correct parameter names

4. **Order Creation - Growth Stage Validation**
   - Fixed: Orders can now be created with lots in any growth stage (not just 'ready'/'transplant')
   - System now correctly checks if `expected_ready_date <= delivery_date`

### ✅ FIXED: Customer Creation Issues
1. **Addresses not saving** - Backend now processes `addresses` array from frontend
2. **Customer type not saving** - Default changed from 'home_gardener' to 'Retail' to match frontend

---

## 🔴 REMAINING ISSUES TO FIX

### 1. Order Details Display - Missing Information

**Problem:** After order creation, the order details page is missing critical information.

**Missing Fields:**
- Lot numbers allocated to the order
- Expected delivery date
- Payment terms
- Payment status details

**Root Cause:** The order detail component needs to fetch and display:
- `order_allocations` table data (lot assignments)
- Payment information from `payments` table
- Order timeline data

**Solution:**
File: `backend/controllers/orderController.js` - `getOrder` function

Currently returns basic order data. Needs to include:

```javascript
// Add to getOrder function:

// Get lot allocations
const allocationsQuery = `
  SELECT
    oa.*,
    l.lot_number,
    l.growth_stage,
    l.expected_ready_date,
    s.sku_code,
    p.name as product_name
  FROM order_allocations oa
  JOIN lots l ON oa.lot_id = l.id
  JOIN skus s ON l.sku_id = s.id
  JOIN products p ON s.product_id = p.id
  WHERE oa.order_id = $1
  ORDER BY oa.created_at ASC
`;

// Get payment details
const paymentsQuery = `
  SELECT * FROM payments
  WHERE order_id = $1
  ORDER BY payment_date DESC
`;

// Return with order:
res.json({
  success: true,
  data: {
    order: orderResult.rows[0],
    items: itemsResult.rows,
    allocations: allocationsResult.rows,  // ADD THIS
    payments: paymentsResult.rows,         // ADD THIS
    statusHistory: historyResult.rows
  }
});
```

### 2. Automatic Lot Allocation on Order Creation

**Problem:** When an order is created, lots are not automatically allocated. The `allocated_quantity` in lots table is not updated, and no records are created in `order_allocations` table.

**Current Behavior:**
- Order is created with status 'pending'
- Available inventory is checked but not reserved
- No lot allocation records created
- Inventory quantities not adjusted

**Expected Behavior:**
- After order creation, automatically allocate lots
- Update `lots.allocated_quantity`
- Create records in `order_allocations` table
- Mark appropriate quantities as "booked"

**Solution:**
File: `backend/controllers/orderController.js` - `createOrder` function

After creating order and order_items (around line 300), add:

```javascript
// 8. Auto-allocate lots if requested or if setting is enabled
if (auto_allocate || true) {  // Make auto_allocate default true
  try {
    // Use the lot allocation service
    const allocationResult = await lotAllocationService.allocateLots(
      client,
      order.id,
      itemsWithPrices,
      delivery_date
    );

    if (!allocationResult.success) {
      console.warn('Lot allocation warning:', allocationResult.message);
      // Don't fail the order, just log it
    }
  } catch (allocationError) {
    console.error('Lot allocation error:', allocationError);
    // Don't rollback - order can be allocated manually later
  }
}
```

Also need to fix `lotAllocationService.allocateLots`:

File: `backend/services/lotAllocationService.js`

Ensure it:
1. Queries for available lots (using the same logic as in order creation)
2. Creates `order_allocations` records
3. Updates `lots.allocated_quantity` and `lots.available_quantity`

```javascript
// Update lot quantities
await client.query(
  `UPDATE lots
   SET allocated_quantity = allocated_quantity + $1,
       available_quantity = available_quantity - $1,
       updated_at = NOW()
   WHERE id = $2`,
  [quantityToAllocate, lot.id]
);

// Create allocation record
await client.query(
  `INSERT INTO order_allocations (
    order_id, order_item_id, lot_id, quantity_allocated, created_by
  ) VALUES ($1, $2, $3, $4, $5)`,
  [orderId, orderItemId, lot.id, quantityToAllocate, userId]
);
```

### 3. Order Status Workflow Documentation

**Problem:** All orders show as "pending" and it's unclear how to move them to "confirmed".

**Order Status Flow Should Be:**
1. **pending** - Order created, awaiting confirmation
2. **confirmed** - Order confirmed, lots allocated
3. **preparing** - Being prepared for delivery
4. **ready_for_delivery** - Ready to be picked up by delivery personnel
5. **out_for_delivery** - With delivery person
6. **delivered** - Successfully delivered
7. **cancelled** - Order cancelled

**Status Transitions:**
- pending → confirmed: When admin/manager reviews and confirms order
- confirmed → preparing: When warehouse starts preparing
- preparing → ready_for_delivery: When packed and ready
- ready_for_delivery → out_for_delivery: When assigned to delivery
- out_for_delivery → delivered: When delivery confirmed

**Manual Status Update:**
- Provide a button in Order Details to update status
- Show allowed transitions based on current status
- Record status changes in `order_status_history` table

**Auto Status Update Triggers:**
- When lots allocated → Move from 'pending' to 'confirmed'
- When delivery assigned → Move to 'out_for_delivery'
- When delivery marked complete → Move to 'delivered'

### 4. Inventory Display - Show Allocated Quantity

**Problem:** Inventory page only shows total quantity and available quantity. When orders are created, the allocated (booked) quantity should be visible.

**Current Display:**
- Quantity: 1000
- Available: 1000

**Should Display:**
- Total Quantity: 1000
- Allocated (Booked): 200
- Available: 800

**Solution:**
File: `frontend/src/components/Inventory/LotsTable.jsx`

Add a column for allocated quantity:

```jsx
<TableCell align="right">
  <Typography variant="body2" fontWeight="medium">
    {lot.quantity}
  </Typography>
</TableCell>
<TableCell align="right">
  <Typography variant="body2" color="warning.main">
    {lot.allocated_quantity || 0}
  </Typography>
</TableCell>
<TableCell align="right">
  <Typography variant="body2" color="success.main">
    {lot.available_quantity}
  </Typography>
</TableCell>
```

The backend already returns these fields from the lots table.

### 5. Payment Terms Display

**Problem:** Order details don't show payment terms (advance, credit, etc.)

**Solution:**
File: `frontend/src/pages/Orders/OrderDetails.jsx`

Add payment information section:

```jsx
<Box>
  <Typography variant="h6">Payment Information</Typography>
  <Grid container spacing={2}>
    <Grid item xs={6}>
      <Typography color="textSecondary">Payment Type</Typography>
      <Typography>{order.payment_type}</Typography>
    </Grid>
    <Grid item xs={6}>
      <Typography color="textSecondary">Payment Status</Typography>
      <Chip
        label={getPaymentStatus(order, payments)}
        color={getPaymentStatusColor(order, payments)}
      />
    </Grid>
    {order.payment_type === 'credit' && (
      <Grid item xs={6}>
        <Typography color="textSecondary">Credit Days</Typography>
        <Typography>{order.credit_days || customer.credit_days} days</Typography>
      </Grid>
    )}
    <Grid item xs={12}>
      <Typography color="textSecondary">Payments Received</Typography>
      {payments && payments.length > 0 ? (
        payments.map(payment => (
          <Box key={payment.id}>
            <Typography>
              ₹{payment.amount} - {payment.payment_method} - {format Date(payment.payment_date)}
            </Typography>
          </Box>
        ))
      ) : (
        <Typography color="textSecondary">No payments received yet</Typography>
      )}
    </Grid>
  </Grid>
</Box>
```

---

## Implementation Priority

1. **HIGH PRIORITY** - Auto lot allocation (Issue #2)
   - This is critical for inventory management
   - Orders should automatically reserve inventory

2. **HIGH PRIORITY** - Order details display (Issue #1)
   - Users need to see what lots are allocated
   - Payment status must be visible

3. **MEDIUM PRIORITY** - Inventory allocated quantity display (Issue #4)
   - Important for warehouse staff
   - Shows true available inventory

4. **MEDIUM PRIORITY** - Order status workflow (Issue #3)
   - Clarifies process
   - Adds status transition controls

5. **LOW PRIORITY** - Payment terms display (Issue #5)
   - Nice to have
   - Information is already in backend

---

## Testing Checklist

After implementing fixes:

- [ ] Create new customer with address → Verify address saves
- [ ] Create new lot → Verify QR code generates
- [ ] Create order → Verify lots auto-allocate
- [ ] View order details → Verify lot numbers show
- [ ] Check inventory → Verify allocated quantity shows
- [ ] Update order status → Verify transitions work
- [ ] View lot details → Verify allocated quantity updated

---

## Database Verification Queries

```sql
-- Check if order allocations were created
SELECT oa.*, l.lot_number, oi.sku_id, oi.quantity
FROM order_allocations oa
JOIN lots l ON oa.lot_id = l.id
JOIN order_items oi ON oa.order_item_id = oi.id
WHERE oa.order_id = '<order_id>';

-- Check lot quantities after order
SELECT
  lot_number,
  quantity as total,
  allocated_quantity as allocated,
  available_quantity as available
FROM lots
WHERE sku_id = '<sku_id>';

-- Check customer addresses
SELECT * FROM customer_addresses
WHERE customer_id = '<customer_id>';
```
