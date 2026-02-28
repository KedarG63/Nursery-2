/**
 * Migration: Create Lot Photos Table
 * Issue #78: Create weekly growth progress photo automation
 * Phase 16 - Automation & Scheduled Jobs
 */

exports.up = (pgm) => {
  // Create lot_photos table
  pgm.createTable('lot_photos', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    lot_id: {
      type: 'uuid',
      notNull: true,
      references: 'lots(id)',
      onDelete: 'CASCADE'
    },
    photo_url: {
      type: 'varchar(500)',
      notNull: true
    },
    photo_type: {
      type: 'varchar(50)',
      default: 'progress',
      notNull: true
    },
    growth_stage: {
      type: 'varchar(50)',
      notNull: false
    },
    notes: {
      type: 'text',
      notNull: false
    },
    captured_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    },
    uploaded_by: {
      type: 'uuid',
      references: 'users(id)',
      notNull: false
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    }
  }, {
    ifNotExists: true
  });

  // Add indexes
  pgm.createIndex('lot_photos', ['lot_id'], {
    name: 'idx_lot_photos_lot_id',
    ifNotExists: true
  });

  pgm.createIndex('lot_photos', ['lot_id', 'captured_at'], {
    name: 'idx_lot_photos_captured_at',
    ifNotExists: true
  });

  // Add photo notification tracking to lots (check if column exists first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lots' AND column_name = 'last_photo_sent_at'
      ) THEN
        ALTER TABLE lots ADD COLUMN last_photo_sent_at timestamp;
      END IF;
    END $$;
  `);

  // Create weekly_photo_notifications table
  pgm.createTable('weekly_photo_notifications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    lot_id: {
      type: 'uuid',
      notNull: true,
      references: 'lots(id)',
      onDelete: 'CASCADE'
    },
    order_id: {
      type: 'uuid',
      notNull: true,
      references: 'orders(id)',
      onDelete: 'CASCADE'
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers(id)',
      onDelete: 'CASCADE'
    },
    photo_id: {
      type: 'uuid',
      references: 'lot_photos(id)',
      onDelete: 'SET NULL',
      notNull: false
    },
    sent_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    },
    week_number: {
      type: 'integer',
      notNull: true
    },
    year: {
      type: 'integer',
      notNull: true
    }
  }, {
    ifNotExists: true
  });

  // Add unique constraint for weekly tracking (check if it exists first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_lot_order_week'
      ) THEN
        ALTER TABLE weekly_photo_notifications
        ADD CONSTRAINT unique_lot_order_week UNIQUE (lot_id, order_id, week_number, year);
      END IF;
    END $$;
  `);

  // Add index
  pgm.createIndex('weekly_photo_notifications', ['customer_id'], {
    name: 'idx_weekly_photo_notif_customer',
    ifNotExists: true
  });
};

exports.down = (pgm) => {
  // Drop weekly_photo_notifications table
  pgm.dropTable('weekly_photo_notifications');

  // Drop last_photo_sent_at from lots
  pgm.dropColumns('lots', ['last_photo_sent_at']);

  // Drop indexes from lot_photos
  pgm.dropIndex('lot_photos', ['lot_id', 'captured_at'], {
    name: 'idx_lot_photos_captured_at'
  });

  pgm.dropIndex('lot_photos', ['lot_id'], {
    name: 'idx_lot_photos_lot_id'
  });

  // Drop lot_photos table
  pgm.dropTable('lot_photos');
};
