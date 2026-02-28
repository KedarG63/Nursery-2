/**
 * Migration: Create whatsapp_templates table
 * Issue #40: Create Message Templates Table
 */

exports.up = async (pgm) => {
  // Create enums
  pgm.createType('template_category_enum', [
    'order',
    'delivery',
    'payment',
    'marketing',
    'support',
    'alert'
  ]);

  pgm.createType('template_status_enum', [
    'draft',
    'pending',
    'approved',
    'rejected'
  ]);

  // Create whatsapp_templates table
  pgm.createTable('whatsapp_templates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    template_name: {
      type: 'varchar(100)',
      notNull: true,
      unique: true
    },
    template_id: {
      type: 'varchar(100)',
      comment: 'Provider\'s template ID (null for mock)'
    },

    // Content
    subject: {
      type: 'varchar(255)'
    },
    content: {
      type: 'text',
      notNull: true
    },
    variables: {
      type: 'jsonb',
      comment: 'Array of variable names: ["customer_name", "order_number"]'
    },

    // Classification
    category: {
      type: 'template_category_enum',
      notNull: true
    },
    language: {
      type: 'varchar(10)',
      default: 'en'
    },

    // Status
    status: {
      type: 'template_status_enum',
      default: 'draft'
    },
    approved_at: {
      type: 'timestamp'
    },
    approved_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL'
    },

    // Metadata
    description: {
      type: 'text'
    },
    usage_count: {
      type: 'integer',
      default: 0
    },
    version: {
      type: 'integer',
      default: 1
    },
    is_active: {
      type: 'boolean',
      default: true
    },

    // Audit
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
    created_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL'
    },
    updated_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL'
    }
  });

  // Create indexes
  pgm.createIndex('whatsapp_templates', 'template_name');
  pgm.createIndex('whatsapp_templates', 'category');
  pgm.createIndex('whatsapp_templates', 'status');
  pgm.createIndex('whatsapp_templates', 'is_active', {
    where: 'is_active = TRUE'
  });

  // Add trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('whatsapp_templates', { cascade: true });
  pgm.dropType('template_category_enum');
  pgm.dropType('template_status_enum');
};
