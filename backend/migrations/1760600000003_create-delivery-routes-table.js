exports.up = async (pgm) => {
  // Create route_status enum
  pgm.createType('route_status_enum', [
    'planned',
    'assigned',
    'started',
    'in_progress',
    'completed',
    'cancelled'
  ]);

  // Create delivery_routes table
  pgm.createTable('delivery_routes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    route_number: {
      type: 'varchar(50)',
      unique: true,
      notNull: true
    },
    driver_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    vehicle_id: {
      type: 'uuid',
      references: 'vehicles',
      onDelete: 'SET NULL'
    },
    route_date: {
      type: 'date',
      notNull: true
    },
    status: {
      type: 'route_status_enum',
      notNull: true,
      default: 'planned'
    },

    // Timing
    planned_start_time: {
      type: 'timestamp'
    },
    actual_start_time: {
      type: 'timestamp'
    },
    planned_end_time: {
      type: 'timestamp'
    },
    actual_end_time: {
      type: 'timestamp'
    },

    // Route details
    total_distance_km: {
      type: 'decimal(10, 2)',
      comment: 'Total distance in kilometers'
    },
    estimated_duration_minutes: {
      type: 'integer',
      comment: 'Estimated duration in minutes'
    },
    actual_duration_minutes: {
      type: 'integer',
      comment: 'Actual duration in minutes'
    },
    route_polyline: {
      type: 'text',
      comment: 'Encoded polyline (Google Maps format)'
    },

    // Metrics
    optimization_score: {
      type: 'integer',
      check: 'optimization_score >= 0 AND optimization_score <= 100'
    },
    total_stops: {
      type: 'integer',
      default: 0
    },
    completed_stops: {
      type: 'integer',
      default: 0
    },

    // Metadata
    notes: {
      type: 'text'
    },
    created_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    },
    updated_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
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
    },
    deleted_at: {
      type: 'timestamp'
    }
  });

  // Create indexes
  pgm.createIndex('delivery_routes', 'driver_id', { name: 'idx_routes_driver_id' });
  pgm.createIndex('delivery_routes', 'vehicle_id', { name: 'idx_routes_vehicle_id' });
  pgm.createIndex('delivery_routes', 'status', { name: 'idx_routes_status' });
  pgm.createIndex('delivery_routes', 'route_date', { name: 'idx_routes_route_date' });
  pgm.createIndex('delivery_routes', 'route_number', { name: 'idx_routes_route_number' });

  // Create sequence for route number generation
  pgm.createSequence('route_number_seq', {
    start: 1,
    increment: 1,
    cycle: true,
    maxvalue: 999
  });

  // Function to generate route number
  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_route_number()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.route_number IS NULL THEN
        NEW.route_number := 'RT-' || TO_CHAR(NEW.route_date, 'YYYYMMDD') || '-' ||
                            LPAD(nextval('route_number_seq')::TEXT, 3, '0');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Trigger to set route number
  pgm.sql(`
    CREATE TRIGGER set_route_number
    BEFORE INSERT ON delivery_routes
    FOR EACH ROW
    EXECUTE PROCEDURE generate_route_number();
  `);

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER update_routes_updated_at
    BEFORE UPDATE ON delivery_routes
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('delivery_routes');
  pgm.dropSequence('route_number_seq');
  pgm.sql('DROP FUNCTION IF EXISTS generate_route_number() CASCADE;');
  pgm.dropType('route_status_enum');
};
