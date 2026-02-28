exports.up = async (pgm) => {
  // Create gps_tracking table
  pgm.createTable('gps_tracking', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    vehicle_id: {
      type: 'uuid',
      notNull: true,
      references: 'vehicles',
      onDelete: 'CASCADE'
    },
    route_id: {
      type: 'uuid',
      references: 'delivery_routes',
      onDelete: 'SET NULL'
    },

    // Location
    latitude: {
      type: 'decimal(10, 8)',
      notNull: true
    },
    longitude: {
      type: 'decimal(11, 8)',
      notNull: true
    },

    // Movement data
    speed_kmh: {
      type: 'decimal(5, 2)',
      comment: 'Speed in km/h'
    },
    heading: {
      type: 'integer',
      comment: 'Direction in degrees (0-360)'
    },
    altitude_m: {
      type: 'decimal(8, 2)',
      comment: 'Altitude in meters'
    },

    // Status
    ignition_on: {
      type: 'boolean',
      default: true
    },
    is_moving: {
      type: 'boolean',
      default: true
    },

    // Distance tracking
    distance_from_route_m: {
      type: 'decimal(10, 2)',
      comment: 'Distance from planned route in meters'
    },
    distance_from_next_stop_m: {
      type: 'decimal(10, 2)',
      comment: 'Distance from next stop in meters'
    },

    // Provider data
    gps_provider: {
      type: 'varchar(50)',
      default: 'mock',
      comment: 'GPS provider: mock, loconav, fleetx'
    },
    provider_tracking_id: {
      type: 'varchar(100)'
    },

    // Timestamps
    recorded_at: {
      type: 'timestamp',
      notNull: true,
      comment: 'Time when GPS data was recorded'
    },
    received_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
      comment: 'Time when data was received by our system'
    }
  });

  // Create indexes
  pgm.createIndex('gps_tracking', 'vehicle_id', { name: 'idx_gps_vehicle_id' });
  pgm.createIndex('gps_tracking', 'route_id', { name: 'idx_gps_route_id' });
  pgm.createIndex('gps_tracking', 'recorded_at', {
    name: 'idx_gps_recorded_at',
    order: 'DESC'
  });
  pgm.createIndex('gps_tracking', ['vehicle_id', 'recorded_at'], {
    name: 'idx_gps_vehicle_time',
    order: 'DESC'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('gps_tracking');
};
