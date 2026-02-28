exports.up = async (pgm) => {
  // Create driver_assignments table
  pgm.createTable('driver_assignments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    driver_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
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

    // Assignment period
    assigned_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    completed_at: {
      type: 'timestamp'
    },

    // Status
    is_active: {
      type: 'boolean',
      default: true
    },

    notes: {
      type: 'text'
    },
    assigned_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL'
    }
  });

  // Create indexes
  pgm.createIndex('driver_assignments', 'driver_id', { name: 'idx_driver_assignments_driver' });
  pgm.createIndex('driver_assignments', 'vehicle_id', { name: 'idx_driver_assignments_vehicle' });
  pgm.createIndex('driver_assignments', 'route_id', { name: 'idx_driver_assignments_route' });
  pgm.createIndex('driver_assignments', 'is_active', {
    name: 'idx_driver_assignments_active',
    where: 'is_active = TRUE'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('driver_assignments');
};
