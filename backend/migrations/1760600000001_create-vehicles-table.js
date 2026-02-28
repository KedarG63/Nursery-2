exports.up = async (pgm) => {
  // Create vehicle_type enum
  pgm.createType('vehicle_type_enum', ['truck', 'tempo', 'van', 'pickup', 'two_wheeler']);

  // Create vehicle_status enum
  pgm.createType('vehicle_status_enum', ['available', 'in_use', 'maintenance', 'inactive']);

  // Create vehicles table
  pgm.createTable('vehicles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    registration_number: {
      type: 'varchar(20)',
      notNull: true,
      unique: true
    },
    vehicle_type: {
      type: 'vehicle_type_enum',
      notNull: true
    },

    // Capacity
    capacity_units: {
      type: 'integer',
      notNull: true,
      comment: 'Number of trays/units'
    },
    capacity_weight_kg: {
      type: 'decimal(10, 2)',
      comment: 'Weight capacity in kg'
    },

    // Status
    status: {
      type: 'vehicle_status_enum',
      notNull: true,
      default: 'available'
    },

    // GPS Integration (Mock)
    gps_device_id: {
      type: 'varchar(50)',
      comment: 'Mock GPS device ID'
    },
    gps_provider: {
      type: 'varchar(50)',
      default: 'mock',
      comment: 'GPS provider: mock, loconav, fleetx'
    },

    // Vehicle Details
    make_model: {
      type: 'varchar(100)'
    },
    year: {
      type: 'integer'
    },
    color: {
      type: 'varchar(30)'
    },

    // Documentation
    insurance_expiry: {
      type: 'date'
    },
    fitness_expiry: {
      type: 'date'
    },
    permit_expiry: {
      type: 'date'
    },

    // Maintenance
    last_maintenance_date: {
      type: 'date'
    },
    next_maintenance_date: {
      type: 'date'
    },
    odometer_reading: {
      type: 'integer',
      comment: 'Odometer reading in km'
    },

    // Costs (optional for later)
    fuel_type: {
      type: 'varchar(20)',
      comment: 'diesel, petrol, electric, cng'
    },
    average_fuel_consumption: {
      type: 'decimal(5, 2)',
      comment: 'km per liter'
    },

    // Audit columns
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
  pgm.createIndex('vehicles', 'registration_number', { name: 'idx_vehicles_registration' });
  pgm.createIndex('vehicles', 'status', { name: 'idx_vehicles_status' });
  pgm.createIndex('vehicles', 'vehicle_type', { name: 'idx_vehicles_type' });

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('vehicles');
  pgm.dropType('vehicle_type_enum');
  pgm.dropType('vehicle_status_enum');
};
