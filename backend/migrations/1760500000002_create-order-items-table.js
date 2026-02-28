/* eslint-disable camelcase */

/**
 * Migration: Create order items table
 * Issue #23: [Orders] Create order items table
 * Description: Track SKUs and lots assigned to each order with fulfillment status
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create order_item_status enum
  pgm.createType('order_item_status_enum', [
    'pending',
    'allocated',
    'picked',
    'packed',
    'delivered',
    'cancelled'
  ]);

  // Create order_items table
  pgm.createTable('order_items', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    order_id: {
      type: 'uuid',
      notNull: true,
      references: 'orders',
      onDelete: 'CASCADE'
    },
    sku_id: {
      type: 'uuid',
      notNull: true,
      references: 'skus',
      onDelete: 'RESTRICT'
    },
    lot_id: {
      type: 'uuid',
      references: 'lots',
      onDelete: 'SET NULL'
    },
    quantity: {
      type: 'integer',
      notNull: true
    },
    unit_price: {
      type: 'decimal(10,2)',
      notNull: true
    },
    line_total: {
      type: 'decimal(12,2)',
      notNull: true
    },
    status: {
      type: 'order_item_status_enum',
      notNull: true,
      default: 'pending'
    },
    allocated_at: {
      type: 'timestamp'
    },
    ready_date: {
      type: 'date'
    },
    notes: {
      type: 'text'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    }
  });

  // Create indexes
  pgm.createIndex('order_items', 'order_id', { name: 'idx_order_items_order_id' });
  pgm.createIndex('order_items', 'sku_id', { name: 'idx_order_items_sku_id' });
  pgm.createIndex('order_items', 'lot_id', { name: 'idx_order_items_lot_id' });
  pgm.createIndex('order_items', 'status', { name: 'idx_order_items_status' });
  pgm.createIndex('order_items', ['order_id', 'sku_id'], {
    name: 'idx_order_items_order_sku'
  });

  // Add constraints
  pgm.addConstraint('order_items', 'chk_quantity_positive', {
    check: 'quantity > 0'
  });

  pgm.addConstraint('order_items', 'chk_unit_price_positive', {
    check: 'unit_price >= 0'
  });

  pgm.addConstraint('order_items', 'chk_line_total_positive', {
    check: 'line_total >= 0'
  });

  // Add unique constraint to prevent duplicate entries
  // Note: We allow NULL lot_id, so we need to handle this carefully
  // This constraint allows multiple NULL lot_ids but prevents duplicate non-NULL combinations
  pgm.addConstraint('order_items', 'uq_order_sku_lot', {
    unique: ['order_id', 'sku_id', 'lot_id']
  });

  // Create trigger function for auto-calculating line_total
  pgm.createFunction(
    'calculate_line_total',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      NEW.line_total := NEW.quantity * NEW.unit_price;
      RETURN NEW;
    END;
    `
  );

  // Create trigger for line_total calculation
  pgm.createTrigger('order_items', 'set_line_total', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_line_total',
    level: 'ROW'
  });

  // Create trigger for updated_at
  pgm.createTrigger('order_items', 'update_order_items_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW'
  });

  // Create trigger function to update lot allocated_quantity when lot_id is assigned
  pgm.createFunction(
    'update_lot_allocation_on_order_item',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      -- When lot is assigned (INSERT with lot_id or UPDATE from NULL to lot_id)
      IF (TG_OP = 'INSERT' AND NEW.lot_id IS NOT NULL) OR
         (TG_OP = 'UPDATE' AND OLD.lot_id IS NULL AND NEW.lot_id IS NOT NULL) THEN
        UPDATE lots
        SET allocated_quantity = allocated_quantity + NEW.quantity
        WHERE id = NEW.lot_id;
      END IF;

      -- When lot is changed (UPDATE from one lot to another)
      IF TG_OP = 'UPDATE' AND OLD.lot_id IS NOT NULL AND NEW.lot_id IS NOT NULL
         AND OLD.lot_id != NEW.lot_id THEN
        -- Decrease old lot
        UPDATE lots
        SET allocated_quantity = allocated_quantity - OLD.quantity
        WHERE id = OLD.lot_id;
        -- Increase new lot
        UPDATE lots
        SET allocated_quantity = allocated_quantity + NEW.quantity
        WHERE id = NEW.lot_id;
      END IF;

      -- When lot is removed (UPDATE from lot_id to NULL)
      IF TG_OP = 'UPDATE' AND OLD.lot_id IS NOT NULL AND NEW.lot_id IS NULL THEN
        UPDATE lots
        SET allocated_quantity = allocated_quantity - OLD.quantity
        WHERE id = OLD.lot_id;
      END IF;

      -- When quantity changes on already allocated item
      IF TG_OP = 'UPDATE' AND OLD.lot_id IS NOT NULL AND NEW.lot_id IS NOT NULL
         AND OLD.lot_id = NEW.lot_id AND OLD.quantity != NEW.quantity THEN
        UPDATE lots
        SET allocated_quantity = allocated_quantity - OLD.quantity + NEW.quantity
        WHERE id = NEW.lot_id;
      END IF;

      RETURN NEW;
    END;
    `
  );

  // Create trigger for lot allocation updates
  pgm.createTrigger('order_items', 'trigger_update_lot_allocation', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    function: 'update_lot_allocation_on_order_item',
    level: 'ROW'
  });

  // Create trigger function to handle lot deallocation on DELETE
  pgm.createFunction(
    'deallocate_lot_on_order_item_delete',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      IF OLD.lot_id IS NOT NULL THEN
        UPDATE lots
        SET allocated_quantity = allocated_quantity - OLD.quantity
        WHERE id = OLD.lot_id;
      END IF;
      RETURN OLD;
    END;
    `
  );

  // Create trigger for lot deallocation on DELETE
  pgm.createTrigger('order_items', 'trigger_deallocate_lot_on_delete', {
    when: 'AFTER',
    operation: 'DELETE',
    function: 'deallocate_lot_on_order_item_delete',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE order_items IS 'Line items for orders with SKU and lot assignments';
    COMMENT ON COLUMN order_items.unit_price IS 'Price per unit at the time of order (historical)';
    COMMENT ON COLUMN order_items.line_total IS 'Total for this line (quantity * unit_price, auto-calculated)';
    COMMENT ON COLUMN order_items.lot_id IS 'Assigned lot for fulfillment (NULL until allocated)';
    COMMENT ON COLUMN order_items.allocated_at IS 'Timestamp when lot was allocated';
    COMMENT ON COLUMN order_items.ready_date IS 'Expected date when this item will be ready (based on lot)';
  `);
};

exports.down = (pgm) => {
  // Drop triggers
  pgm.dropTrigger('order_items', 'trigger_deallocate_lot_on_delete', { ifExists: true });
  pgm.dropTrigger('order_items', 'trigger_update_lot_allocation', { ifExists: true });
  pgm.dropTrigger('order_items', 'update_order_items_updated_at', { ifExists: true });
  pgm.dropTrigger('order_items', 'set_line_total', { ifExists: true });

  // Drop functions
  pgm.dropFunction('deallocate_lot_on_order_item_delete', [], { ifExists: true });
  pgm.dropFunction('update_lot_allocation_on_order_item', [], { ifExists: true });
  pgm.dropFunction('calculate_line_total', [], { ifExists: true });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('order_items', { ifExists: true, cascade: true });

  // Drop enum
  pgm.dropType('order_item_status_enum', { ifExists: true });
};
