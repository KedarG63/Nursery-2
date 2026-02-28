# Phase 22: Purchase & Seeds Management - Complete Implementation Plan

## Executive Summary

This phase implements a comprehensive **Purchase/Seeds Management System** that enables:
1. Complete seed procurement tracking (vendor, lot, cost, quantity)
2. Full traceability from seed purchase → lot creation → plant delivery
3. Inventory validation (check seed availability before creating lots)
4. Profit & Loss statement integration with seed costing
5. End-to-end lineage tracking for each plant back to original seed lot

---

## System Architecture Overview

### Data Flow
```
Purchase (Seed Procurement)
    ↓
Seeds Inventory (Available Seeds)
    ↓
Lot Creation (Check Seed Availability)
    ↓
Lot/Tray Management (Track Seed Source)
    ↓
Order Items (Track Plant Lineage)
    ↓
Delivery (Complete Traceability)
    ↓
P&L Reporting (Cost Analysis)
```

---

## Database Schema Design

### 1. Vendors Table
Manages seed suppliers and vendor information.

```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_code VARCHAR(50) UNIQUE NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  gst_number VARCHAR(50),
  payment_terms INTEGER DEFAULT 30,  -- Days
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, blacklisted
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendors_deleted_at ON vendors(deleted_at);
CREATE INDEX idx_vendors_vendor_code ON vendors(vendor_code);
```

### 2. Seed Purchases Table
Tracks all seed procurement transactions.

```sql
CREATE TABLE seed_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number VARCHAR(50) UNIQUE NOT NULL,  -- PUR-YYYYMMDD-XXXX
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  product_id UUID NOT NULL REFERENCES products(id),  -- Which plant species
  sku_id UUID REFERENCES skus(id),  -- Optional: specific variety

  -- Seed Lot Information
  seed_lot_number VARCHAR(100) NOT NULL,  -- Vendor's lot number

  -- Quantity Details
  number_of_packets INTEGER NOT NULL,
  seeds_per_packet INTEGER NOT NULL,
  total_seeds INTEGER GENERATED ALWAYS AS (number_of_packets * seeds_per_packet) STORED,

  -- Pricing
  cost_per_packet DECIMAL(10,2) NOT NULL,
  cost_per_seed DECIMAL(10,4) GENERATED ALWAYS AS (cost_per_packet::DECIMAL / NULLIF(seeds_per_packet, 0)) STORED,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (number_of_packets * cost_per_packet) STORED,

  -- Additional Costs
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  other_charges DECIMAL(10,2) DEFAULT 0,
  grand_total DECIMAL(12,2) GENERATED ALWAYS AS (
    (number_of_packets * cost_per_packet) + COALESCE(shipping_cost, 0) + COALESCE(tax_amount, 0) + COALESCE(other_charges, 0)
  ) STORED,

  -- Seed Quality
  germination_rate DECIMAL(5,2),  -- Expected % (e.g., 85.00)
  purity_percentage DECIMAL(5,2),  -- Seed purity %
  expiry_date DATE NOT NULL,

  -- Purchase Details
  purchase_date DATE NOT NULL,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  payment_status VARCHAR(20) DEFAULT 'pending',  -- pending, partial, paid
  amount_paid DECIMAL(12,2) DEFAULT 0,

  -- Inventory Status
  seeds_used INTEGER DEFAULT 0,
  seeds_remaining INTEGER GENERATED ALWAYS AS (
    (number_of_packets * seeds_per_packet) - COALESCE(seeds_used, 0)
  ) STORED,
  inventory_status VARCHAR(20) DEFAULT 'available',  -- available, low_stock, exhausted, expired

  -- Storage Information
  storage_location VARCHAR(100),
  storage_conditions TEXT,  -- Temperature, humidity requirements

  -- Notes and Metadata
  notes TEXT,
  quality_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_seed_purchases_vendor ON seed_purchases(vendor_id);
CREATE INDEX idx_seed_purchases_product ON seed_purchases(product_id);
CREATE INDEX idx_seed_purchases_sku ON seed_purchases(sku_id);
CREATE INDEX idx_seed_purchases_purchase_date ON seed_purchases(purchase_date);
CREATE INDEX idx_seed_purchases_expiry_date ON seed_purchases(expiry_date);
CREATE INDEX idx_seed_purchases_status ON seed_purchases(inventory_status);
CREATE INDEX idx_seed_purchases_deleted_at ON seed_purchases(deleted_at);
CREATE INDEX idx_seed_purchases_number ON seed_purchases(purchase_number);

-- Check constraints
ALTER TABLE seed_purchases ADD CONSTRAINT chk_packets_positive CHECK (number_of_packets > 0);
ALTER TABLE seed_purchases ADD CONSTRAINT chk_seeds_per_packet_positive CHECK (seeds_per_packet > 0);
ALTER TABLE seed_purchases ADD CONSTRAINT chk_cost_positive CHECK (cost_per_packet > 0);
ALTER TABLE seed_purchases ADD CONSTRAINT chk_seeds_used_valid CHECK (seeds_used >= 0 AND seeds_used <= (number_of_packets * seeds_per_packet));
ALTER TABLE seed_purchases ADD CONSTRAINT chk_germination_rate_valid CHECK (germination_rate IS NULL OR (germination_rate >= 0 AND germination_rate <= 100));
ALTER TABLE seed_purchases ADD CONSTRAINT chk_purity_valid CHECK (purity_percentage IS NULL OR (purity_percentage >= 0 AND purity_percentage <= 100));

-- Trigger to update inventory status based on seeds_remaining
CREATE OR REPLACE FUNCTION update_seed_purchase_inventory_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check expiry
  IF NEW.expiry_date < CURRENT_DATE THEN
    NEW.inventory_status = 'expired';
  -- Check if exhausted
  ELSIF (NEW.number_of_packets * NEW.seeds_per_packet - COALESCE(NEW.seeds_used, 0)) <= 0 THEN
    NEW.inventory_status = 'exhausted';
  -- Check low stock (less than 10% remaining)
  ELSIF (NEW.number_of_packets * NEW.seeds_per_packet - COALESCE(NEW.seeds_used, 0))::DECIMAL / (NEW.number_of_packets * NEW.seeds_per_packet) < 0.1 THEN
    NEW.inventory_status = 'low_stock';
  ELSE
    NEW.inventory_status = 'available';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_seed_inventory_status
  BEFORE INSERT OR UPDATE OF seeds_used, expiry_date
  ON seed_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_seed_purchase_inventory_status();
```

### 3. Seed Purchase Payments Table
Tracks payment installments for seed purchases.

```sql
CREATE TABLE seed_purchase_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seed_purchase_id UUID NOT NULL REFERENCES seed_purchases(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50),  -- cash, bank_transfer, check, upi
  transaction_reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_seed_purchase_payments_purchase ON seed_purchase_payments(seed_purchase_id);
CREATE INDEX idx_seed_purchase_payments_date ON seed_purchase_payments(payment_date);

-- Trigger to update seed_purchases.amount_paid and payment_status
CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(12,2);
  grand_total DECIMAL(12,2);
BEGIN
  -- Calculate total paid for this purchase
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM seed_purchase_payments
  WHERE seed_purchase_id = COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

  -- Get grand total
  SELECT sp.grand_total INTO grand_total
  FROM seed_purchases sp
  WHERE sp.id = COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

  -- Update payment status
  UPDATE seed_purchases
  SET
    amount_paid = total_paid,
    payment_status = CASE
      WHEN total_paid = 0 THEN 'pending'
      WHEN total_paid >= grand_total THEN 'paid'
      ELSE 'partial'
    END
  WHERE id = COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_purchase_payment_after_insert
  AFTER INSERT ON seed_purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_seed_purchase_payment_status();

CREATE TRIGGER trigger_update_purchase_payment_after_update
  AFTER UPDATE ON seed_purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_seed_purchase_payment_status();

CREATE TRIGGER trigger_update_purchase_payment_after_delete
  AFTER DELETE ON seed_purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_seed_purchase_payment_status();
```

### 4. Modify Lots Table - Add Seed Traceability
Enhance existing lots table to track seed source.

```sql
-- Add new columns to lots table
ALTER TABLE lots ADD COLUMN seed_purchase_id UUID REFERENCES seed_purchases(id);
ALTER TABLE lots ADD COLUMN seeds_used_count INTEGER DEFAULT 0;
ALTER TABLE lots ADD COLUMN seed_cost_per_unit DECIMAL(10,4);  -- Cost per seed used
ALTER TABLE lots ADD COLUMN total_seed_cost DECIMAL(12,2) GENERATED ALWAYS AS (seeds_used_count * seed_cost_per_unit) STORED;

-- Index for performance
CREATE INDEX idx_lots_seed_purchase ON lots(seed_purchase_id);

-- Modify lot_number generation to reference seed lot
-- Format: LOT-YYYYMMDD-XXXX-SEED{SeedPurchaseSeq}
-- This will be handled in application logic
```

### 5. Seed Usage History Table
Tracks which seed purchases were used in which lots (audit trail).

```sql
CREATE TABLE seed_usage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seed_purchase_id UUID NOT NULL REFERENCES seed_purchases(id),
  lot_id UUID NOT NULL REFERENCES lots(id),
  seeds_allocated INTEGER NOT NULL,
  cost_per_seed DECIMAL(10,4) NOT NULL,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (seeds_allocated * cost_per_seed) STORED,
  allocated_at TIMESTAMP DEFAULT NOW(),
  allocated_by UUID REFERENCES users(id),
  notes TEXT
);

CREATE INDEX idx_seed_usage_purchase ON seed_usage_history(seed_purchase_id);
CREATE INDEX idx_seed_usage_lot ON seed_usage_history(lot_id);
CREATE INDEX idx_seed_usage_date ON seed_usage_history(allocated_at);

-- Trigger to update seed_purchases.seeds_used when seed is allocated
CREATE OR REPLACE FUNCTION update_seeds_used_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE seed_purchases
    SET seeds_used = seeds_used + NEW.seeds_allocated
    WHERE id = NEW.seed_purchase_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE seed_purchases
    SET seeds_used = seeds_used - OLD.seeds_allocated + NEW.seeds_allocated
    WHERE id = NEW.seed_purchase_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE seed_purchases
    SET seeds_used = seeds_used - OLD.seeds_allocated
    WHERE id = OLD.seed_purchase_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_seeds_used_after_allocation
  AFTER INSERT OR UPDATE OR DELETE ON seed_usage_history
  FOR EACH ROW
  EXECUTE FUNCTION update_seeds_used_count();
```

---

## Backend Implementation

### Migration Files

#### 1. Create Vendors Table
**File:** `backend/migrations/1762000000001_create-vendors-table.js`

```javascript
/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create vendor status enum
  pgm.createType('vendor_status_enum', ['active', 'inactive', 'blacklisted']);

  // Create vendors table
  pgm.createTable('vendors', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    vendor_code: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    vendor_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    contact_person: {
      type: 'varchar(255)',
    },
    phone: {
      type: 'varchar(20)',
    },
    email: {
      type: 'varchar(255)',
    },
    address: {
      type: 'text',
    },
    gst_number: {
      type: 'varchar(50)',
    },
    payment_terms: {
      type: 'integer',
      default: 30,
    },
    status: {
      type: 'vendor_status_enum',
      notNull: true,
      default: 'active',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    deleted_at: {
      type: 'timestamp',
    },
  });

  // Create indexes
  pgm.createIndex('vendors', 'vendor_code');
  pgm.createIndex('vendors', 'status');
  pgm.createIndex('vendors', 'deleted_at');

  // Create trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER trigger_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTrigger('vendors', 'trigger_vendors_updated_at', { ifExists: true });
  pgm.dropTable('vendors', { ifExists: true, cascade: true });
  pgm.dropType('vendor_status_enum', { ifExists: true });
};
```

#### 2. Create Seed Purchases Table
**File:** `backend/migrations/1762000000002_create-seed-purchases-table.js`

```javascript
/* eslint-disable camelcase */

exports.up = (pgm) => {
  // Create payment status enum
  pgm.createType('purchase_payment_status_enum', ['pending', 'partial', 'paid']);

  // Create inventory status enum
  pgm.createType('seed_inventory_status_enum', ['available', 'low_stock', 'exhausted', 'expired']);

  // Create seed_purchases table
  pgm.createTable('seed_purchases', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    purchase_number: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    vendor_id: {
      type: 'uuid',
      notNull: true,
      references: 'vendors',
      onDelete: 'RESTRICT',
    },
    product_id: {
      type: 'uuid',
      notNull: true,
      references: 'products',
      onDelete: 'RESTRICT',
    },
    sku_id: {
      type: 'uuid',
      references: 'skus',
      onDelete: 'SET NULL',
    },
    seed_lot_number: {
      type: 'varchar(100)',
      notNull: true,
    },
    number_of_packets: {
      type: 'integer',
      notNull: true,
    },
    seeds_per_packet: {
      type: 'integer',
      notNull: true,
    },
    total_seeds: {
      type: 'integer',
      notNull: true,
    },
    cost_per_packet: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    cost_per_seed: {
      type: 'decimal(10,4)',
    },
    total_cost: {
      type: 'decimal(12,2)',
    },
    shipping_cost: {
      type: 'decimal(10,2)',
      default: 0,
    },
    tax_amount: {
      type: 'decimal(10,2)',
      default: 0,
    },
    other_charges: {
      type: 'decimal(10,2)',
      default: 0,
    },
    grand_total: {
      type: 'decimal(12,2)',
    },
    germination_rate: {
      type: 'decimal(5,2)',
    },
    purity_percentage: {
      type: 'decimal(5,2)',
    },
    expiry_date: {
      type: 'date',
      notNull: true,
    },
    purchase_date: {
      type: 'date',
      notNull: true,
    },
    invoice_number: {
      type: 'varchar(100)',
    },
    invoice_date: {
      type: 'date',
    },
    payment_status: {
      type: 'purchase_payment_status_enum',
      notNull: true,
      default: 'pending',
    },
    amount_paid: {
      type: 'decimal(12,2)',
      default: 0,
    },
    seeds_used: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    seeds_remaining: {
      type: 'integer',
    },
    inventory_status: {
      type: 'seed_inventory_status_enum',
      notNull: true,
      default: 'available',
    },
    storage_location: {
      type: 'varchar(100)',
    },
    storage_conditions: {
      type: 'text',
    },
    notes: {
      type: 'text',
    },
    quality_notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    deleted_at: {
      type: 'timestamp',
    },
  });

  // Calculate computed columns
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_seed_purchase_fields()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.total_seeds = NEW.number_of_packets * NEW.seeds_per_packet;
      NEW.cost_per_seed = CASE
        WHEN NEW.seeds_per_packet > 0 THEN NEW.cost_per_packet::DECIMAL / NEW.seeds_per_packet
        ELSE 0
      END;
      NEW.total_cost = NEW.number_of_packets * NEW.cost_per_packet;
      NEW.grand_total = NEW.total_cost + COALESCE(NEW.shipping_cost, 0) + COALESCE(NEW.tax_amount, 0) + COALESCE(NEW.other_charges, 0);
      NEW.seeds_remaining = NEW.total_seeds - COALESCE(NEW.seeds_used, 0);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_purchases', 'trigger_calculate_seed_purchase_fields', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_seed_purchase_fields',
    level: 'ROW',
  });

  // Update inventory status trigger
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seed_purchase_inventory_status()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.expiry_date < CURRENT_DATE THEN
        NEW.inventory_status = 'expired';
      ELSIF (NEW.total_seeds - COALESCE(NEW.seeds_used, 0)) <= 0 THEN
        NEW.inventory_status = 'exhausted';
      ELSIF (NEW.total_seeds - COALESCE(NEW.seeds_used, 0))::DECIMAL / NEW.total_seeds < 0.1 THEN
        NEW.inventory_status = 'low_stock';
      ELSE
        NEW.inventory_status = 'available';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_purchases', 'trigger_update_seed_inventory_status', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'update_seed_purchase_inventory_status',
    level: 'ROW',
  });

  // Indexes
  pgm.createIndex('seed_purchases', 'vendor_id');
  pgm.createIndex('seed_purchases', 'product_id');
  pgm.createIndex('seed_purchases', 'sku_id');
  pgm.createIndex('seed_purchases', 'purchase_date');
  pgm.createIndex('seed_purchases', 'expiry_date');
  pgm.createIndex('seed_purchases', 'inventory_status');
  pgm.createIndex('seed_purchases', 'purchase_number');
  pgm.createIndex('seed_purchases', 'deleted_at');

  // Check constraints
  pgm.addConstraint('seed_purchases', 'chk_packets_positive', {
    check: 'number_of_packets > 0',
  });
  pgm.addConstraint('seed_purchases', 'chk_seeds_per_packet_positive', {
    check: 'seeds_per_packet > 0',
  });
  pgm.addConstraint('seed_purchases', 'chk_cost_positive', {
    check: 'cost_per_packet > 0',
  });
  pgm.addConstraint('seed_purchases', 'chk_seeds_used_valid', {
    check: 'seeds_used >= 0',
  });

  // Trigger for updated_at
  pgm.createTrigger('seed_purchases', 'trigger_seed_purchases_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('seed_purchases', 'trigger_seed_purchases_updated_at', { ifExists: true });
  pgm.dropTrigger('seed_purchases', 'trigger_update_seed_inventory_status', { ifExists: true });
  pgm.dropTrigger('seed_purchases', 'trigger_calculate_seed_purchase_fields', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_seed_purchase_inventory_status()');
  pgm.sql('DROP FUNCTION IF EXISTS calculate_seed_purchase_fields()');
  pgm.dropTable('seed_purchases', { ifExists: true, cascade: true });
  pgm.dropType('seed_inventory_status_enum', { ifExists: true });
  pgm.dropType('purchase_payment_status_enum', { ifExists: true });
};
```

#### 3. Create Seed Purchase Payments Table
**File:** `backend/migrations/1762000000003_create-seed-purchase-payments-table.js`

```javascript
/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('seed_purchase_payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    seed_purchase_id: {
      type: 'uuid',
      notNull: true,
      references: 'seed_purchases',
      onDelete: 'CASCADE',
    },
    payment_date: {
      type: 'date',
      notNull: true,
    },
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    payment_method: {
      type: 'varchar(50)',
    },
    transaction_reference: {
      type: 'varchar(100)',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('seed_purchase_payments', 'seed_purchase_id');
  pgm.createIndex('seed_purchase_payments', 'payment_date');

  // Trigger to update seed_purchases payment status
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seed_purchase_payment_status()
    RETURNS TRIGGER AS $$
    DECLARE
      total_paid DECIMAL(12,2);
      grand_total DECIMAL(12,2);
      purchase_id UUID;
    BEGIN
      purchase_id := COALESCE(NEW.seed_purchase_id, OLD.seed_purchase_id);

      SELECT COALESCE(SUM(amount), 0) INTO total_paid
      FROM seed_purchase_payments
      WHERE seed_purchase_id = purchase_id;

      SELECT sp.grand_total INTO grand_total
      FROM seed_purchases sp
      WHERE sp.id = purchase_id;

      UPDATE seed_purchases
      SET
        amount_paid = total_paid,
        payment_status = CASE
          WHEN total_paid = 0 THEN 'pending'
          WHEN total_paid >= grand_total THEN 'paid'
          ELSE 'partial'
        END
      WHERE id = purchase_id;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_insert', {
    when: 'AFTER',
    operation: 'INSERT',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_update', {
    when: 'AFTER',
    operation: 'UPDATE',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });

  pgm.createTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_delete', {
    when: 'AFTER',
    operation: 'DELETE',
    function: 'update_seed_purchase_payment_status',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_delete', { ifExists: true });
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_update', { ifExists: true });
  pgm.dropTrigger('seed_purchase_payments', 'trigger_update_purchase_payment_after_insert', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_seed_purchase_payment_status()');
  pgm.dropTable('seed_purchase_payments', { ifExists: true, cascade: true });
};
```

#### 4. Add Seed Traceability to Lots
**File:** `backend/migrations/1762000000004_add-seed-traceability-to-lots.js`

```javascript
/* eslint-disable camelcase */

exports.up = (pgm) => {
  // Add seed traceability columns to lots table
  pgm.addColumns('lots', {
    seed_purchase_id: {
      type: 'uuid',
      references: 'seed_purchases',
      onDelete: 'SET NULL',
    },
    seeds_used_count: {
      type: 'integer',
      default: 0,
    },
    seed_cost_per_unit: {
      type: 'decimal(10,4)',
    },
    total_seed_cost: {
      type: 'decimal(12,2)',
    },
  });

  // Create index
  pgm.createIndex('lots', 'seed_purchase_id');

  // Trigger to calculate total_seed_cost
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_lot_seed_cost()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.seeds_used_count IS NOT NULL AND NEW.seed_cost_per_unit IS NOT NULL THEN
        NEW.total_seed_cost = NEW.seeds_used_count * NEW.seed_cost_per_unit;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('lots', 'trigger_calculate_lot_seed_cost', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_lot_seed_cost',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('lots', 'trigger_calculate_lot_seed_cost', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS calculate_lot_seed_cost()');
  pgm.dropColumns('lots', ['seed_purchase_id', 'seeds_used_count', 'seed_cost_per_unit', 'total_seed_cost']);
};
```

#### 5. Create Seed Usage History Table
**File:** `backend/migrations/1762000000005_create-seed-usage-history-table.js`

```javascript
/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('seed_usage_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    seed_purchase_id: {
      type: 'uuid',
      notNull: true,
      references: 'seed_purchases',
      onDelete: 'RESTRICT',
    },
    lot_id: {
      type: 'uuid',
      notNull: true,
      references: 'lots',
      onDelete: 'RESTRICT',
    },
    seeds_allocated: {
      type: 'integer',
      notNull: true,
    },
    cost_per_seed: {
      type: 'decimal(10,4)',
      notNull: true,
    },
    total_cost: {
      type: 'decimal(12,2)',
    },
    allocated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    allocated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    notes: {
      type: 'text',
    },
  });

  pgm.createIndex('seed_usage_history', 'seed_purchase_id');
  pgm.createIndex('seed_usage_history', 'lot_id');
  pgm.createIndex('seed_usage_history', 'allocated_at');

  // Calculate total_cost
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_seed_usage_cost()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.total_cost = NEW.seeds_allocated * NEW.cost_per_seed;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_usage_history', 'trigger_calculate_seed_usage_cost', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_seed_usage_cost',
    level: 'ROW',
  });

  // Trigger to update seed_purchases.seeds_used
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_seeds_used_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used + NEW.seeds_allocated
        WHERE id = NEW.seed_purchase_id;
      ELSIF TG_OP = 'UPDATE' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used - OLD.seeds_allocated + NEW.seeds_allocated
        WHERE id = NEW.seed_purchase_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE seed_purchases
        SET seeds_used = seeds_used - OLD.seeds_allocated
        WHERE id = OLD.seed_purchase_id;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTrigger('seed_usage_history', 'trigger_update_seeds_used_after_allocation', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE', 'DELETE'],
    function: 'update_seeds_used_count',
    level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('seed_usage_history', 'trigger_update_seeds_used_after_allocation', { ifExists: true });
  pgm.dropTrigger('seed_usage_history', 'trigger_calculate_seed_usage_cost', { ifExists: true });
  pgm.sql('DROP FUNCTION IF EXISTS update_seeds_used_count()');
  pgm.sql('DROP FUNCTION IF EXISTS calculate_seed_usage_cost()');
  pgm.dropTable('seed_usage_history', { ifExists: true, cascade: true });
};
```

---

## Backend API Routes

### Route Structure
```
/api/vendors
/api/purchases
/api/purchases/:id/payments
/api/purchases/check-availability
/api/lots (enhanced with seed checking)
```

### API Endpoints Summary

#### Vendors Management
- `POST /api/vendors` - Create new vendor
- `GET /api/vendors` - List all vendors (with filters)
- `GET /api/vendors/:id` - Get vendor details
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Soft delete vendor
- `GET /api/vendors/:id/purchases` - Get vendor's purchase history

#### Seed Purchases Management
- `POST /api/purchases` - Create seed purchase
- `GET /api/purchases` - List all purchases (filters: vendor, product, status, expiry)
- `GET /api/purchases/:id` - Get purchase details with usage history
- `PUT /api/purchases/:id` - Update purchase
- `DELETE /api/purchases/:id` - Soft delete purchase
- `GET /api/purchases/check-availability` - Check seed availability for lot creation
- `GET /api/purchases/expiring-soon` - Get seeds expiring within 30 days
- `GET /api/purchases/low-stock` - Get low stock alerts
- `GET /api/purchases/:id/usage-history` - Get seed usage timeline
- `POST /api/purchases/:id/payments` - Record payment
- `GET /api/purchases/:id/payments` - Get payment history
- `PUT /api/purchases/:id/payments/:paymentId` - Update payment
- `DELETE /api/purchases/:id/payments/:paymentId` - Delete payment

#### Enhanced Lot Creation (Modified)
- `POST /api/lots` - Create lot (now checks seed availability first)
- `GET /api/lots/:id/seed-lineage` - Trace seed source for a lot

---

## Frontend Implementation

### Navigation Menu Update
Add new menu item in `frontend/src/config/menuItems.js`:

```javascript
{
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'nav.purchases',
  icon: ShoppingBagIcon, // Import from @mui/icons-material
  path: '/purchases',
  roles: ['Admin', 'Manager', 'Warehouse'],
}
```

### Page Structure
```
frontend/src/pages/Purchases/
  ├── PurchasesList.jsx           // Main list view
  ├── PurchaseForm.jsx            // Create/Edit purchase
  ├── PurchaseDetails.jsx         // View purchase details
  ├── VendorsList.jsx             // Vendors management
  ├── VendorForm.jsx              // Create/Edit vendor
  └── SeedAvailability.jsx        // Seed inventory dashboard
```

### Components Structure
```
frontend/src/components/Purchases/
  ├── PurchaseTable.jsx
  ├── PurchaseFilters.jsx
  ├── PaymentDialog.jsx
  ├── SeedUsageTimeline.jsx
  ├── ExpiryAlert.jsx
  ├── LowStockAlert.jsx
  └── SeedLineageView.jsx
```

### Services
**File:** `frontend/src/services/purchaseService.js`
**File:** `frontend/src/services/vendorService.js`

---

## Key Features Implementation

### Feature 1: Seed Availability Check Before Lot Creation

**Backend Logic (Enhanced lotController.createLot):**

```javascript
// In lotController.createLot - BEFORE creating lot
const checkSeedAvailability = async (product_id, sku_id, seeds_needed) => {
  const query = `
    SELECT
      sp.*,
      sp.seeds_remaining,
      sp.expiry_date
    FROM seed_purchases sp
    WHERE sp.product_id = $1
      AND ($2::uuid IS NULL OR sp.sku_id = $2)
      AND sp.inventory_status = 'available'
      AND sp.expiry_date > CURRENT_DATE
      AND sp.seeds_remaining >= $3
      AND sp.deleted_at IS NULL
    ORDER BY sp.expiry_date ASC, sp.purchase_date ASC
    LIMIT 1
  `;

  const result = await pool.query(query, [product_id, sku_id, seeds_needed]);
  return result.rows[0];
};

// Usage in createLot:
const seedsNeeded = quantity; // e.g., 1000 seeds for a tray
const availableSeedPurchase = await checkSeedAvailability(product_id, sku_id, seedsNeeded);

if (!availableSeedPurchase) {
  return res.status(400).json({
    success: false,
    message: 'Insufficient seeds available for this product/SKU',
    required: seedsNeeded,
  });
}

// Allocate seeds and create lot
// ... (implementation below)
```

### Feature 2: Lot Number Referencing Seed Lot

**Enhanced Lot Number Format:**
```
LOT-YYYYMMDD-XXXX-S{SEED_PURCHASE_SEQ}
Example: LOT-20251026-0001-S0012
```

**Implementation:**
```javascript
// Generate lot number with seed reference
const seedPurchaseSeq = availableSeedPurchase.purchase_number.split('-').pop();
const lot_number = `LOT-${dateStr}-${sequence}-S${seedPurchaseSeq}`;
```

### Feature 3: Complete Seed-to-Plant Traceability

**Lineage Query (Backend Service):**

```javascript
// backend/services/traceabilityService.js
const getPlantLineage = async (orderItemId) => {
  const query = `
    SELECT
      oi.id as order_item_id,
      o.order_number,
      c.name as customer_name,
      p.name as product_name,
      s.sku_code,

      -- Lot Information
      l.lot_number,
      l.planted_date,
      l.growth_stage,

      -- Seed Purchase Information
      sp.purchase_number,
      sp.seed_lot_number as vendor_seed_lot,
      sp.purchase_date as seed_purchase_date,
      sp.cost_per_seed,

      -- Vendor Information
      v.vendor_name,
      v.vendor_code,

      -- Usage History
      suh.seeds_allocated,
      suh.total_cost as seed_cost_for_lot,
      suh.allocated_at as seed_allocated_date

    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    JOIN lots l ON oi.lot_id = l.id
    JOIN skus s ON l.sku_id = s.id
    JOIN products p ON s.product_id = p.id
    LEFT JOIN seed_usage_history suh ON suh.lot_id = l.id
    LEFT JOIN seed_purchases sp ON suh.seed_purchase_id = sp.id
    LEFT JOIN vendors v ON sp.vendor_id = v.id
    WHERE oi.id = $1
  `;

  const result = await pool.query(query, [orderItemId]);
  return result.rows[0];
};

// API Endpoint
router.get('/api/orders/items/:itemId/lineage', async (req, res) => {
  const lineage = await getPlantLineage(req.params.itemId);
  res.json({ success: true, lineage });
});
```

### Feature 4: Profit & Loss Integration

**P&L Seed Cost Calculation:**

```javascript
// backend/services/profitLossService.js
const calculateOrderProfitLoss = async (orderId) => {
  const query = `
    SELECT
      o.order_number,
      o.total_amount as revenue,

      -- Sum of seed costs from all order items
      SUM(l.total_seed_cost) as total_seed_cost,

      -- Other costs can be added here (labor, overhead, etc.)
      o.total_amount - SUM(l.total_seed_cost) as gross_profit,

      -- Profit margin
      CASE
        WHEN o.total_amount > 0 THEN
          ((o.total_amount - SUM(l.total_seed_cost)) / o.total_amount * 100)
        ELSE 0
      END as profit_margin_percentage

    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN lots l ON oi.lot_id = l.id
    WHERE o.id = $1
    GROUP BY o.id
  `;

  const result = await pool.query(query, [orderId]);
  return result.rows[0];
};

// Detailed P&L Report Endpoint
router.get('/api/reports/profit-loss', async (req, res) => {
  const { start_date, end_date } = req.query;

  const query = `
    SELECT
      DATE_TRUNC('month', o.order_date) as month,
      COUNT(DISTINCT o.id) as total_orders,
      SUM(o.total_amount) as total_revenue,
      SUM(l.total_seed_cost) as total_seed_costs,
      SUM(o.total_amount - l.total_seed_cost) as gross_profit,
      AVG((o.total_amount - l.total_seed_cost) / NULLIF(o.total_amount, 0) * 100) as avg_margin
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN lots l ON oi.lot_id = l.id
    WHERE o.order_date BETWEEN $1 AND $2
      AND o.status != 'cancelled'
    GROUP BY DATE_TRUNC('month', o.order_date)
    ORDER BY month DESC
  `;

  const result = await pool.query(query, [start_date, end_date]);
  res.json({ success: true, data: result.rows });
});
```

---

## Testing Strategy

### Test Cases

#### 1. Seed Purchase Flow
- [ ] Create vendor
- [ ] Create seed purchase
- [ ] Verify auto-calculations (total_seeds, cost_per_seed, grand_total)
- [ ] Record payment
- [ ] Verify payment status updates

#### 2. Seed Availability Check
- [ ] Attempt to create lot without sufficient seeds (should fail)
- [ ] Create lot with available seeds (should succeed)
- [ ] Verify seeds_used increment in seed_purchases
- [ ] Verify inventory_status updates (available → low_stock → exhausted)

#### 3. Traceability
- [ ] Create complete flow: Purchase → Lot → Order → Delivery
- [ ] Query lineage from order_item
- [ ] Verify all connections intact

#### 4. P&L Reporting
- [ ] Create orders with seed costs
- [ ] Run P&L report
- [ ] Verify profit calculations

#### 5. Expiry Alerts
- [ ] Create purchase with near expiry
- [ ] Verify alert appears
- [ ] Verify expired seeds cannot be used

---

## Implementation Checklist

### Phase 22.1: Database & Backend Foundation
- [ ] Run migration: Create vendors table
- [ ] Run migration: Create seed_purchases table
- [ ] Run migration: Create seed_purchase_payments table
- [ ] Run migration: Add seed traceability to lots
- [ ] Run migration: Create seed_usage_history table
- [ ] Create backend routes: vendors
- [ ] Create backend routes: purchases
- [ ] Create backend controllers
- [ ] Create backend validators
- [ ] Create backend services (traceability, P&L)

### Phase 22.2: Frontend Implementation
- [ ] Create Purchases menu item
- [ ] Create PurchasesList page
- [ ] Create PurchaseForm component
- [ ] Create VendorsList page
- [ ] Create VendorForm component
- [ ] Create SeedAvailability dashboard
- [ ] Update LotForm to show seed availability
- [ ] Create SeedLineageView component

### Phase 22.3: Integration & Enhancement
- [ ] Enhance lotController.createLot with seed checking
- [ ] Implement automatic seed allocation on lot creation
- [ ] Add seed lineage API endpoint
- [ ] Update P&L reports to include seed costs
- [ ] Add expiry alerts to dashboard

### Phase 22.4: Testing & Documentation
- [ ] Unit tests for all controllers
- [ ] Integration tests for complete flow
- [ ] API documentation
- [ ] User guide for Purchases module

---

## Success Criteria

✅ **Traceability:** Any delivered plant can be traced back to:
  - Original seed purchase
  - Vendor details
  - Seed lot number
  - Purchase date and cost

✅ **Inventory Control:** System prevents lot creation when seeds unavailable

✅ **Cost Tracking:** All seed costs captured and included in P&L

✅ **Seamless Integration:** No breaking changes to existing flows

✅ **Data Integrity:** All foreign keys and constraints enforced

---

## Notes

- Lot number format preserves backward compatibility while adding seed reference
- All computed fields use database triggers for consistency
- Soft deletes maintained throughout
- Audit trail complete with created_by/updated_by
- Payment tracking mirrors existing order payment pattern
- Role-based access follows existing RBAC model

This implementation provides **complete seed-to-plant traceability** while maintaining system consistency and data integrity.
