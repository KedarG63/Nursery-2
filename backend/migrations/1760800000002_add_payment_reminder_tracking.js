/**
 * Migration: Add Payment Reminder Tracking
 * Issue #76: Create scheduled job for payment reminders
 * Phase 16 - Automation & Scheduled Jobs
 */

exports.up = (pgm) => {
  // Add reminder tracking to payment_installments (check if columns exist first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_installments' AND column_name = 'last_reminder_sent_at'
      ) THEN
        ALTER TABLE payment_installments ADD COLUMN last_reminder_sent_at timestamp;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_installments' AND column_name = 'reminder_count'
      ) THEN
        ALTER TABLE payment_installments ADD COLUMN reminder_count integer DEFAULT 0 NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_installments' AND column_name = 'escalated'
      ) THEN
        ALTER TABLE payment_installments ADD COLUMN escalated boolean DEFAULT false NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_installments' AND column_name = 'escalated_at'
      ) THEN
        ALTER TABLE payment_installments ADD COLUMN escalated_at timestamp;
      END IF;
    END $$;
  `);

  // Add index for efficient querying
  pgm.createIndex('payment_installments', ['due_date', 'status'], {
    name: 'idx_payment_installments_due_reminders',
    where: "status = 'pending'",
    ifNotExists: true
  });

  // Create manager notification preferences table
  pgm.createTable('manager_notification_preferences', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    notification_type: {
      type: 'varchar(50)',
      notNull: true
    },
    enabled: {
      type: 'boolean',
      default: true,
      notNull: true
    },
    email_enabled: {
      type: 'boolean',
      default: true,
      notNull: true
    },
    whatsapp_enabled: {
      type: 'boolean',
      default: false,
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true
    }
  }, {
    ifNotExists: true
  });

  // Add unique constraint (check if it exists first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_user_notification_type'
      ) THEN
        ALTER TABLE manager_notification_preferences
        ADD CONSTRAINT unique_user_notification_type UNIQUE (user_id, notification_type);
      END IF;
    END $$;
  `);

  // Seed with default preferences for Admin/Manager roles
  pgm.sql(`
    INSERT INTO manager_notification_preferences (user_id, notification_type, enabled)
    SELECT u.id, 'overdue_payments', TRUE
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.name IN ('Admin', 'Manager')
    ON CONFLICT DO NOTHING
  `);
};

exports.down = (pgm) => {
  // Drop manager_notification_preferences table
  pgm.dropTable('manager_notification_preferences');

  // Drop index from payment_installments
  pgm.dropIndex('payment_installments', ['due_date', 'status'], {
    name: 'idx_payment_installments_due_reminders'
  });

  // Drop columns from payment_installments
  pgm.dropColumns('payment_installments', [
    'last_reminder_sent_at',
    'reminder_count',
    'escalated',
    'escalated_at'
  ]);
};
