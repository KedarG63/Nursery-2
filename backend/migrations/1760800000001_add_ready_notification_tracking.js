/**
 * Migration: Add Ready Notification Tracking
 * Issue #75: Create scheduled job for ready notifications
 * Phase 16 - Automation & Scheduled Jobs
 */

exports.up = (pgm) => {
  // Add notification tracking to lots table (safely)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lots' AND column_name = 'ready_notification_sent') THEN
        ALTER TABLE lots ADD COLUMN ready_notification_sent boolean DEFAULT false NOT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lots' AND column_name = 'ready_notification_sent_at') THEN
        ALTER TABLE lots ADD COLUMN ready_notification_sent_at timestamp;
      END IF;
    END$$;
  `);

  // Add index for performance (IF NOT EXISTS)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_lots_expected_ready_date
    ON lots (expected_ready_date)
    WHERE ready_notification_sent = FALSE;
  `);

  // Create notification_logs table for audit trail (IF NOT EXISTS)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      notification_type varchar(50) NOT NULL,
      entity_type varchar(50) NOT NULL,
      entity_id uuid NOT NULL,
      recipient_phone varchar(20),
      recipient_id uuid,
      status varchar(20) NOT NULL,
      template_name varchar(100),
      error_message text,
      retry_count integer DEFAULT 0 NOT NULL,
      sent_at timestamp,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      created_by uuid
    );
  `);

  // Add indexes for notification_logs (IF NOT EXISTS)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_notification_logs_entity ON notification_logs (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs (recipient_id);
    CREATE INDEX IF NOT EXISTS idx_notification_logs_type_status ON notification_logs (notification_type, status);
    CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs (created_at);
  `);
};

exports.down = (pgm) => {
  // Drop indexes
  pgm.dropIndex('notification_logs', ['created_at'], {
    name: 'idx_notification_logs_created_at'
  });

  pgm.dropIndex('notification_logs', ['notification_type', 'status'], {
    name: 'idx_notification_logs_type_status'
  });

  pgm.dropIndex('notification_logs', ['recipient_id'], {
    name: 'idx_notification_logs_recipient'
  });

  pgm.dropIndex('notification_logs', ['entity_type', 'entity_id'], {
    name: 'idx_notification_logs_entity'
  });

  // Drop notification_logs table
  pgm.dropTable('notification_logs');

  // Drop index from lots
  pgm.dropIndex('lots', ['expected_ready_date'], {
    name: 'idx_lots_expected_ready_date'
  });

  // Drop columns from lots
  pgm.dropColumns('lots', ['ready_notification_sent', 'ready_notification_sent_at']);
};
