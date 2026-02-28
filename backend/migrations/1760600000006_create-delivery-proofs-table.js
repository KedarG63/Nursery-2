exports.up = async (pgm) => {
  // Create proof_type enum
  pgm.createType('proof_type_enum', ['signature', 'photo', 'customer_feedback', 'id_proof']);

  // Create delivery_proofs table
  pgm.createTable('delivery_proofs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    route_stop_id: {
      type: 'uuid',
      notNull: true,
      references: 'route_stops',
      onDelete: 'CASCADE'
    },
    proof_type: {
      type: 'proof_type_enum',
      notNull: true
    },

    // File storage
    file_url: {
      type: 'text',
      comment: 'S3/Cloudinary URL for proof file'
    },
    file_size_kb: {
      type: 'integer',
      comment: 'File size in kilobytes'
    },
    file_mime_type: {
      type: 'varchar(50)',
      comment: 'MIME type of uploaded file'
    },

    // Customer feedback
    customer_rating: {
      type: 'integer',
      check: 'customer_rating >= 1 AND customer_rating <= 5'
    },
    customer_feedback: {
      type: 'text'
    },

    // Metadata
    captured_by: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
      comment: 'User who captured the proof (typically driver)'
    },
    captured_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },

    // Location where proof was captured
    capture_latitude: {
      type: 'decimal(10, 8)'
    },
    capture_longitude: {
      type: 'decimal(11, 8)'
    }
  });

  // Create indexes
  pgm.createIndex('delivery_proofs', 'route_stop_id', { name: 'idx_proofs_stop_id' });
  pgm.createIndex('delivery_proofs', 'proof_type', { name: 'idx_proofs_type' });
  pgm.createIndex('delivery_proofs', 'captured_at', {
    name: 'idx_proofs_captured_at',
    order: 'DESC'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('delivery_proofs');
  pgm.dropType('proof_type_enum');
};
