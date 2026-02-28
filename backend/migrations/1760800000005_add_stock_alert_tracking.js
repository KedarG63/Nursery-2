/**
 * Migration: Add Stock Alert Tracking
 * Issue #80: Create low stock alert system
 * Phase 16 - Automation & Scheduled Jobs
 */

exports.up = (pgm) => {
  // Add stock level fields to SKUs (check if columns exist first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'skus' AND column_name = 'min_stock_level'
      ) THEN
        ALTER TABLE skus ADD COLUMN min_stock_level integer DEFAULT 50 NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'skus' AND column_name = 'max_stock_level'
      ) THEN
        ALTER TABLE skus ADD COLUMN max_stock_level integer DEFAULT 500 NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'skus' AND column_name = 'reorder_point'
      ) THEN
        ALTER TABLE skus ADD COLUMN reorder_point integer DEFAULT 100 NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'skus' AND column_name = 'last_stock_alert_sent_at'
      ) THEN
        ALTER TABLE skus ADD COLUMN last_stock_alert_sent_at timestamp;
      END IF;
    END $$;
  `);

  // Create notifications table for in-app notifications
  pgm.createTable('notifications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'CASCADE',
      notNull: false
    },
    role_name: {
      type: 'varchar(50)',
      notNull: false
    },
    notification_type: {
      type: 'varchar(50)',
      notNull: true
    },
    title: {
      type: 'varchar(200)',
      notNull: true
    },
    message: {
      type: 'text',
      notNull: true
    },
    entity_type: {
      type: 'varchar(50)',
      notNull: false
    },
    entity_id: {
      type: 'uuid',
      notNull: false
    },
    priority: {
      type: 'varchar(20)',
      default: 'normal',
      notNull: true
    },
    read: {
      type: 'boolean',
      default: false,
      notNull: true
    },
    read_at: {
      type: 'timestamp',
      notNull: false
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    },
    expires_at: {
      type: 'timestamp',
      notNull: false
    }
  }, {
    ifNotExists: true
  });

  // Add indexes for notifications
  pgm.createIndex('notifications', ['user_id', 'read'], {
    name: 'idx_notifications_user_read',
    ifNotExists: true
  });

  pgm.createIndex('notifications', ['role_name', 'created_at'], {
    name: 'idx_notifications_role',
    ifNotExists: true
  });

  pgm.createIndex('notifications', ['created_at'], {
    name: 'idx_notifications_created',
    ifNotExists: true
  });

  // Create stock_alert_history table
  pgm.createTable('stock_alert_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    sku_id: {
      type: 'uuid',
      notNull: true,
      references: 'skus(id)',
      onDelete: 'CASCADE'
    },
    current_stock: {
      type: 'integer',
      notNull: true
    },
    min_stock_level: {
      type: 'integer',
      notNull: true
    },
    reorder_quantity: {
      type: 'integer',
      notNull: false
    },
    alert_sent_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    },
    resolved_at: {
      type: 'timestamp',
      notNull: false
    },
    resolved_by: {
      type: 'uuid',
      references: 'users(id)',
      notNull: false
    }
  }, {
    ifNotExists: true
  });

  // Add indexes for stock_alert_history
  pgm.createIndex('stock_alert_history', ['sku_id'], {
    name: 'idx_stock_alert_history_sku',
    ifNotExists: true
  });

  pgm.createIndex('stock_alert_history', ['sku_id', 'alert_sent_at'], {
    name: 'idx_stock_alert_history_unresolved',
    where: 'resolved_at IS NULL',
    ifNotExists: true
  });
};

exports.down = (pgm) => {
  // Drop stock_alert_history indexes and table
  pgm.dropIndex('stock_alert_history', ['sku_id', 'alert_sent_at'], {
    name: 'idx_stock_alert_history_unresolved'
  });

  pgm.dropIndex('stock_alert_history', ['sku_id'], {
    name: 'idx_stock_alert_history_sku'
  });

  pgm.dropTable('stock_alert_history');

  // Drop notifications indexes and table
  pgm.dropIndex('notifications', ['created_at'], {
    name: 'idx_notifications_created'
  });

  pgm.dropIndex('notifications', ['role_name', 'created_at'], {
    name: 'idx_notifications_role'
  });

  pgm.dropIndex('notifications', ['user_id', 'read'], {
    name: 'idx_notifications_user_read'
  });

  pgm.dropTable('notifications');

  // Drop columns from skus
  pgm.dropColumns('skus', [
    'min_stock_level',
    'max_stock_level',
    'reorder_point',
    'last_stock_alert_sent_at'
  ]);
};
