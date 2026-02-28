/**
 * Migration: Create whatsapp_opt_outs table
 * Issue #41: Create Message Queue and Logging System
 */

exports.up = async (pgm) => {
  pgm.createTable('whatsapp_opt_outs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers(id)',
      onDelete: 'CASCADE'
    },
    phone_number: {
      type: 'varchar(15)',
      notNull: true
    },

    // Opt-out categories
    opted_out_all: {
      type: 'boolean',
      default: false
    },
    opted_out_marketing: {
      type: 'boolean',
      default: false
    },
    opted_out_order: {
      type: 'boolean',
      default: false
    },
    opted_out_delivery: {
      type: 'boolean',
      default: false
    },
    opted_out_payment: {
      type: 'boolean',
      default: false
    },

    // Metadata
    opted_out_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    },
    opted_out_reason: {
      type: 'text'
    },
    opted_back_in_at: {
      type: 'timestamp'
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

  // Create unique constraint
  pgm.addConstraint('whatsapp_opt_outs', 'whatsapp_opt_outs_customer_phone_unique', {
    unique: ['customer_id', 'phone_number']
  });

  // Create indexes
  pgm.createIndex('whatsapp_opt_outs', 'customer_id');
  pgm.createIndex('whatsapp_opt_outs', 'phone_number');
  pgm.createIndex('whatsapp_opt_outs', 'opted_out_all', {
    where: 'opted_out_all = TRUE'
  });

  // Add trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER update_opt_outs_updated_at
    BEFORE UPDATE ON whatsapp_opt_outs
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('whatsapp_opt_outs', { cascade: true });
};
