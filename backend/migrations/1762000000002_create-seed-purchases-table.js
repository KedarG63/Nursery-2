/* eslint-disable camelcase */

/**
 * Migration: Create seed_purchases table
 * Phase 22: Purchase & Seeds Management
 */

exports.shorthands = undefined;

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
