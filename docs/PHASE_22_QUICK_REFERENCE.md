# Phase 22: Purchase & Seeds Management - Quick Reference

## Overview
Complete seed procurement to plant delivery traceability system with inventory validation and P&L integration.

## Key Features

### 1. **Seed Purchase Management**
- Record seed purchases from vendors
- Track packets, seeds per packet, costs
- Monitor expiry dates and quality metrics (germination rate, purity)
- Payment tracking with installments

### 2. **Inventory Validation**
- **Before creating a lot, system checks if seeds are available**
- Prevents lot creation if insufficient seeds
- Auto-allocates seeds from available purchases (FIFO by expiry)
- Real-time inventory status (available, low_stock, exhausted, expired)

### 3. **Complete Traceability**
```
Seed Purchase → Lot Creation → Order Item → Delivery
```
Every plant can be traced back to:
- Original vendor
- Seed lot number
- Purchase date and cost
- Germination rate and quality

### 4. **Lot Number Referencing**
New format: `LOT-YYYYMMDD-XXXX-S{SeedPurchaseSeq}`
Example: `LOT-20251026-0001-S0012`
- Links lot to seed purchase immediately
- Maintains backward compatibility

### 5. **P&L Integration**
- Seed costs automatically tracked per lot
- Order profitability calculated with seed cost basis
- Monthly P&L reports with detailed cost breakdown
- Profit margin analysis

## Database Tables

### New Tables
1. **vendors** - Seed suppliers
2. **seed_purchases** - Seed procurement records
3. **seed_purchase_payments** - Payment tracking
4. **seed_usage_history** - Audit trail of seed allocation

### Modified Tables
- **lots** - Added seed traceability fields:
  - `seed_purchase_id`
  - `seeds_used_count`
  - `seed_cost_per_unit`
  - `total_seed_cost`

## API Endpoints

### Vendors
```
POST   /api/vendors                    Create vendor
GET    /api/vendors                    List vendors
GET    /api/vendors/:id                Get vendor details
PUT    /api/vendors/:id                Update vendor
DELETE /api/vendors/:id                Delete vendor
GET    /api/vendors/:id/purchases      Vendor purchase history
```

### Purchases
```
POST   /api/purchases                      Create seed purchase
GET    /api/purchases                      List all purchases
GET    /api/purchases/:id                  Get purchase details
PUT    /api/purchases/:id                  Update purchase
DELETE /api/purchases/:id                  Delete purchase
GET    /api/purchases/check-availability   Check seed availability
GET    /api/purchases/expiring-soon        Seeds expiring in 30 days
GET    /api/purchases/low-stock            Low stock alerts
GET    /api/purchases/:id/usage-history    Seed usage timeline
```

### Purchase Payments
```
POST   /api/purchases/:id/payments         Record payment
GET    /api/purchases/:id/payments         Get payment history
PUT    /api/purchases/:id/payments/:pid    Update payment
DELETE /api/purchases/:id/payments/:pid    Delete payment
```

### Enhanced Lot Endpoints
```
POST   /api/lots                       Create lot (with seed validation)
GET    /api/lots/:id/seed-lineage      Trace seed source
```

### Traceability
```
GET    /api/orders/items/:itemId/lineage   Complete plant lineage
```

### P&L Reports
```
GET    /api/reports/profit-loss            P&L with seed costs
GET    /api/reports/order/:id/profitability Order profitability
```

## Workflow Examples

### Creating a Seed Purchase
1. Add/Select vendor
2. Enter purchase details:
   - Vendor's seed lot number
   - Product (plant species)
   - SKU (optional - specific variety)
   - Packets and seeds per packet
   - Cost per packet
   - Expiry date
3. System auto-calculates:
   - Total seeds
   - Cost per seed
   - Grand total
4. Record payments as needed

### Creating a Lot (Enhanced)
1. Select SKU
2. **System automatically checks seed availability**
3. If seeds available:
   - Allocates seeds from purchase (FIFO by expiry)
   - Creates lot with seed reference
   - Updates seed_purchases.seeds_used
   - Records in seed_usage_history
4. If insufficient seeds:
   - Shows error with required quantity
   - Suggests purchasing more seeds

### Tracing Plant Lineage
For any delivered plant:
```
Order Item ID → Query lineage endpoint
Returns:
  ├─ Customer info
  ├─ Order details
  ├─ Lot number and dates
  ├─ Seed purchase details
  ├─ Vendor information
  └─ Cost breakdown
```

## Frontend Navigation

### New Menu Item
**Purchases** (sidebar)
- Icon: ShoppingBag
- Roles: Admin, Manager, Warehouse

### Pages
- `/purchases` - Purchase list
- `/purchases/new` - Create purchase
- `/purchases/:id` - Purchase details
- `/vendors` - Vendor management
- `/purchases/inventory` - Seed availability dashboard

## Data Integrity Features

### Auto-Calculations
- Total seeds = packets × seeds_per_packet
- Cost per seed = cost_per_packet ÷ seeds_per_packet
- Seeds remaining = total_seeds - seeds_used
- Inventory status (triggers automatically)

### Validation Rules
- Cannot create lot without available seeds
- Cannot use expired seeds
- Seed allocation cannot exceed available quantity
- Payment cannot exceed grand total

### Audit Trail
- All tables have created_by/updated_by
- Seed usage fully logged in seed_usage_history
- Payment history preserved
- Soft deletes throughout

## Reporting & Analytics

### Seed Inventory Dashboard
- Current stock by product
- Expiring soon alerts (30 days)
- Low stock warnings (<10%)
- Usage trends

### Cost Analysis
- Seed cost per lot
- Seed cost per order
- Profit margins
- Vendor cost comparison

### Traceability Reports
- Seed-to-plant lineage
- Batch quality tracking (germination success)
- Vendor performance (quality, delivery)

## Implementation Order

1. **Database Setup** (5 migrations)
   - vendors
   - seed_purchases
   - seed_purchase_payments
   - lots enhancement
   - seed_usage_history

2. **Backend API** (routes, controllers, validators, services)

3. **Frontend UI** (pages, components, services)

4. **Integration** (enhance lot creation logic)

5. **Testing** (complete flow validation)

## Testing Checklist

- [ ] Create vendor
- [ ] Record seed purchase
- [ ] Verify auto-calculations
- [ ] Record payments
- [ ] Check seed availability before lot creation
- [ ] Create lot with sufficient seeds ✅
- [ ] Attempt lot creation without seeds ❌ (should fail)
- [ ] Verify seed allocation in history
- [ ] Trace complete lineage
- [ ] Run P&L report with seed costs
- [ ] Test expiry alerts
- [ ] Verify inventory status updates

## Migration Commands

```bash
# Run all Phase 22 migrations
npm run migrate:up

# Rollback if needed
npm run migrate:down
```

## Key Benefits

✅ **Complete Traceability** - Track every plant back to seed source and vendor
✅ **Cost Control** - Accurate P&L with seed cost tracking
✅ **Inventory Validation** - Prevent lot creation without seeds
✅ **Quality Tracking** - Monitor germination rates and seed quality
✅ **Vendor Management** - Evaluate supplier performance
✅ **Seamless Integration** - No breaking changes to existing system

## Notes

- Backward compatible with existing lots (seed fields optional)
- Existing lot creation still works (seed tracking optional for migration)
- Can enable strict validation after seed inventory populated
- Designed for gradual rollout

---

**Status:** Ready for implementation
**Dependencies:** Existing Phase 1-21 features
**Impact:** High value, no breaking changes
**Complexity:** Medium (well-defined schema, clear requirements)
