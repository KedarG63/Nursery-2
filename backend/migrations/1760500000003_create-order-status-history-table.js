/* eslint-disable camelcase */

/**
 * Migration: Create order status history table
 * Issue #24: [Orders] Create order status history table
 * Description: Audit table to track all order status changes with timestamps
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create order_status_history table
  pgm.createTable('order_status_history', {
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
    previous_status: {
      type: 'order_status_enum'
    },
    new_status: {
      type: 'order_status_enum',
      notNull: true
    },
    changed_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    changed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    duration_minutes: {
      type: 'integer'
    },
    ip_address: {
      type: 'inet'
    },
    user_agent: {
      type: 'text'
    },
    notes: {
      type: 'text'
    }
  });

  // Create indexes
  pgm.createIndex('order_status_history', 'order_id', {
    name: 'idx_order_status_history_order_id'
  });
  pgm.createIndex('order_status_history', 'changed_at', {
    name: 'idx_order_status_history_changed_at',
    method: 'btree',
    order: 'DESC'
  });
  pgm.createIndex('order_status_history', ['order_id', 'changed_at'], {
    name: 'idx_order_status_history_order_time',
    method: 'btree',
    order: ['ASC', 'DESC']
  });

  // Add constraint
  pgm.addConstraint('order_status_history', 'chk_duration_minutes_positive', {
    check: 'duration_minutes >= 0'
  });

  // Create trigger function to auto-log status changes
  pgm.createFunction(
    'log_order_status_change',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true
    },
    `
    DECLARE
      v_duration_minutes INTEGER;
      v_last_changed_at TIMESTAMP;
    BEGIN
      -- Only log if status actually changed
      IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN

        -- Calculate duration from previous status
        IF TG_OP = 'UPDATE' THEN
          SELECT changed_at INTO v_last_changed_at
          FROM order_status_history
          WHERE order_id = NEW.id
          ORDER BY changed_at DESC
          LIMIT 1;

          IF v_last_changed_at IS NOT NULL THEN
            v_duration_minutes := EXTRACT(EPOCH FROM (NOW() - v_last_changed_at)) / 60;
          END IF;
        END IF;

        -- Insert status history record
        INSERT INTO order_status_history (
          order_id,
          previous_status,
          new_status,
          changed_by,
          changed_at,
          duration_minutes
        ) VALUES (
          NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
          NEW.status,
          NEW.updated_by,
          NOW(),
          v_duration_minutes
        );
      END IF;

      RETURN NEW;
    END;
    `
  );

  // Create trigger on orders table for status changes
  pgm.createTrigger('orders', 'trigger_log_order_status_change', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    function: 'log_order_status_change',
    level: 'ROW'
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE order_status_history IS 'Immutable audit trail of order status changes';
    COMMENT ON COLUMN order_status_history.previous_status IS 'Status before the change (NULL for initial status)';
    COMMENT ON COLUMN order_status_history.new_status IS 'Status after the change';
    COMMENT ON COLUMN order_status_history.duration_minutes IS 'Time spent in previous status';
    COMMENT ON COLUMN order_status_history.ip_address IS 'IP address of user making the change';
    COMMENT ON COLUMN order_status_history.user_agent IS 'Browser/client user agent string';
  `);

  // Note: In production, you may want to restrict UPDATE/DELETE on this table
  // via database permissions to preserve the audit trail
};

exports.down = (pgm) => {
  // Drop trigger on orders table
  pgm.dropTrigger('orders', 'trigger_log_order_status_change', { ifExists: true });

  // Drop function
  pgm.dropFunction('log_order_status_change', [], { ifExists: true });

  // Drop table (cascades to indexes and constraints)
  pgm.dropTable('order_status_history', { ifExists: true, cascade: true });
};
