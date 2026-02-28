exports.up = async (pgm) => {
  // Create stop_status enum
  pgm.createType('stop_status_enum', [
    'pending',
    'in_transit',
    'arrived',
    'delivering',
    'delivered',
    'failed',
    'skipped'
  ]);

  // Create route_stops table
  pgm.createTable('route_stops', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    route_id: {
      type: 'uuid',
      notNull: true,
      references: 'delivery_routes',
      onDelete: 'CASCADE'
    },
    order_id: {
      type: 'uuid',
      notNull: true,
      references: 'orders',
      onDelete: 'RESTRICT'
    },

    // Stop details
    stop_sequence: {
      type: 'integer',
      notNull: true,
      comment: 'Order in route'
    },
    status: {
      type: 'stop_status_enum',
      notNull: true,
      default: 'pending'
    },

    // Address
    delivery_address: {
      type: 'text',
      notNull: true
    },
    customer_contact: {
      type: 'varchar(15)',
      notNull: true
    },
    latitude: {
      type: 'decimal(10, 8)'
    },
    longitude: {
      type: 'decimal(11, 8)'
    },

    // Timing
    estimated_arrival_time: {
      type: 'timestamp'
    },
    actual_arrival_time: {
      type: 'timestamp'
    },
    estimated_departure_time: {
      type: 'timestamp'
    },
    actual_departure_time: {
      type: 'timestamp'
    },
    time_spent_minutes: {
      type: 'integer',
      comment: 'Auto-calculated time spent at stop'
    },

    // Delivery details
    delivery_notes: {
      type: 'text'
    },
    failure_reason: {
      type: 'text'
    },
    customer_rating: {
      type: 'integer',
      check: 'customer_rating >= 1 AND customer_rating <= 5'
    },
    customer_feedback: {
      type: 'text'
    },

    // Navigation
    distance_from_previous_km: {
      type: 'decimal(10, 2)',
      comment: 'Distance from previous stop in km'
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
  pgm.createIndex('route_stops', 'route_id', { name: 'idx_stops_route_id' });
  pgm.createIndex('route_stops', 'order_id', { name: 'idx_stops_order_id' });
  pgm.createIndex('route_stops', 'status', { name: 'idx_stops_status' });
  pgm.createIndex('route_stops', ['route_id', 'stop_sequence'], { name: 'idx_stops_sequence' });

  // Constraint: unique stop sequence per route
  pgm.addConstraint('route_stops', 'uq_route_stop_sequence', {
    unique: ['route_id', 'stop_sequence']
  });

  // Trigger to calculate time spent
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_time_spent()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.actual_departure_time IS NOT NULL AND NEW.actual_arrival_time IS NOT NULL THEN
        NEW.time_spent_minutes := EXTRACT(EPOCH FROM (NEW.actual_departure_time - NEW.actual_arrival_time)) / 60;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER set_time_spent
    BEFORE INSERT OR UPDATE ON route_stops
    FOR EACH ROW
    EXECUTE PROCEDURE calculate_time_spent();
  `);

  // Trigger to update route completed_stops count
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_route_completed_stops()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'delivered' AND (TG_OP = 'INSERT' OR OLD.status != 'delivered') THEN
        UPDATE delivery_routes
        SET completed_stops = completed_stops + 1
        WHERE id = NEW.route_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER trigger_update_route_completed_stops
    AFTER INSERT OR UPDATE ON route_stops
    FOR EACH ROW
    EXECUTE PROCEDURE update_route_completed_stops();
  `);

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER update_stops_updated_at
    BEFORE UPDATE ON route_stops
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('route_stops');
  pgm.sql('DROP FUNCTION IF EXISTS calculate_time_spent() CASCADE;');
  pgm.sql('DROP FUNCTION IF EXISTS update_route_completed_stops() CASCADE;');
  pgm.dropType('stop_status_enum');
};
