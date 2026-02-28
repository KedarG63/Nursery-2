/**
 * Migration: Add ETA Notification Tracking
 * Issue #77: Create ETA notification trigger from GPS
 * Phase 16 - Automation & Scheduled Jobs
 */

exports.up = (pgm) => {
  // Add ETA notification tracking to route_stops (check if columns exist first)
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'route_stops' AND column_name = 'eta_notification_sent'
      ) THEN
        ALTER TABLE route_stops ADD COLUMN eta_notification_sent boolean DEFAULT false NOT NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'route_stops' AND column_name = 'eta_notification_sent_at'
      ) THEN
        ALTER TABLE route_stops ADD COLUMN eta_notification_sent_at timestamp;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'route_stops' AND column_name = 'last_distance_km'
      ) THEN
        ALTER TABLE route_stops ADD COLUMN last_distance_km decimal(10, 2);
      END IF;
    END $$;
  `);

  // Add index for performance
  pgm.createIndex('route_stops', ['route_id', 'status', 'eta_notification_sent'], {
    name: 'idx_route_stops_eta_tracking',
    where: "status = 'pending'",
    ifNotExists: true
  });
};

exports.down = (pgm) => {
  // Drop index
  pgm.dropIndex('route_stops', ['route_id', 'status', 'eta_notification_sent'], {
    name: 'idx_route_stops_eta_tracking'
  });

  // Drop columns from route_stops
  pgm.dropColumns('route_stops', [
    'eta_notification_sent',
    'eta_notification_sent_at',
    'last_distance_km'
  ]);
};
