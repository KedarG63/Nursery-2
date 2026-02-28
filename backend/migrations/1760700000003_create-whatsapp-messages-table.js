/**
 * Migration: Create whatsapp_messages table
 * Issue #41: Create Message Queue and Logging System
 */

exports.up = async (pgm) => {
  // Create enums
  pgm.createType('message_status_enum', [
    'queued',
    'sending',
    'sent',
    'delivered',
    'read',
    'failed',
    'cancelled'
  ]);

  pgm.createType('message_direction_enum', [
    'outbound',
    'inbound'
  ]);

  // Create whatsapp_messages table
  pgm.createTable('whatsapp_messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },

    // Message details
    message_id: {
      type: 'varchar(100)',
      unique: true,
      comment: 'Provider\'s message ID'
    },
    direction: {
      type: 'message_direction_enum',
      default: 'outbound'
    },

    // Recipient/Sender
    recipient_number: {
      type: 'varchar(15)',
      notNull: true
    },
    sender_number: {
      type: 'varchar(15)',
      comment: 'For inbound messages'
    },
    customer_id: {
      type: 'uuid',
      references: 'customers(id)',
      onDelete: 'SET NULL'
    },

    // Template
    template_name: {
      type: 'varchar(100)'
    },
    template_id: {
      type: 'uuid',
      references: 'whatsapp_templates(id)',
      onDelete: 'SET NULL'
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
      comment: 'Actual variable values used'
    },

    // Status tracking
    status: {
      type: 'message_status_enum',
      default: 'queued'
    },
    retry_count: {
      type: 'integer',
      default: 0
    },
    max_retries: {
      type: 'integer',
      default: 3
    },

    // Timing
    queued_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    },
    sent_at: {
      type: 'timestamp'
    },
    delivered_at: {
      type: 'timestamp'
    },
    read_at: {
      type: 'timestamp'
    },
    failed_at: {
      type: 'timestamp'
    },

    // Error handling
    error_message: {
      type: 'text'
    },
    error_code: {
      type: 'varchar(50)'
    },

    // Related entities
    order_id: {
      type: 'uuid',
      references: 'orders(id)',
      onDelete: 'SET NULL'
    },
    route_id: {
      type: 'uuid',
      references: 'delivery_routes(id)',
      onDelete: 'SET NULL'
    },
    payment_id: {
      type: 'uuid',
      references: 'payments(id)',
      onDelete: 'SET NULL'
    },

    // Provider details
    provider: {
      type: 'varchar(50)',
      default: 'mock'
    },
    provider_response: {
      type: 'jsonb'
    },

    // Cost tracking
    cost_amount: {
      type: 'decimal(10, 4)'
    },
    cost_currency: {
      type: 'varchar(3)',
      default: 'INR'
    },

    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    }
  });

  // Create indexes
  pgm.createIndex('whatsapp_messages', 'recipient_number');
  pgm.createIndex('whatsapp_messages', 'customer_id');
  pgm.createIndex('whatsapp_messages', 'status');
  pgm.createIndex('whatsapp_messages', 'template_name');
  pgm.createIndex('whatsapp_messages', 'message_id');
  pgm.createIndex('whatsapp_messages', ['created_at'], { method: 'btree', order: 'DESC' });
  pgm.createIndex('whatsapp_messages', 'order_id');
  pgm.createIndex('whatsapp_messages', ['status', 'retry_count'], {
    where: 'status = \'failed\' AND retry_count < max_retries'
  });

  // Composite index for retry queries
  pgm.createIndex('whatsapp_messages', ['status', 'queued_at'], {
    where: 'status = \'queued\' OR (status = \'failed\' AND retry_count < max_retries)'
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('whatsapp_messages', { cascade: true });
  pgm.dropType('message_status_enum');
  pgm.dropType('message_direction_enum');
};
