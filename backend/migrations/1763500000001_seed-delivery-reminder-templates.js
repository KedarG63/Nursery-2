/**
 * Migration: Seed delivery reminder WhatsApp templates
 * Adds 3-day-before and day-of-delivery reminder templates
 */

exports.up = async (pgm) => {
  const templates = [
    {
      template_name: 'delivery_reminder_3days',
      category: 'delivery',
      content: 'Hello {{1}}! 🌱 Your sapling delivery for order #{{2}} is scheduled on {{3}} (3 days from now). Please prepare your field — our team will arrive to plant the saplings. Reply to this message if you have any questions.',
      variables: '["customer_name", "order_number", "delivery_date"]',
      description: 'Sent 3 days before the scheduled delivery date to remind customer to prepare their field',
      status: 'approved'
    },
    {
      template_name: 'delivery_day_reminder',
      category: 'delivery',
      content: 'Hello {{1}}! 🚛 Today is your delivery day for order #{{2}}. Our team will deliver your saplings today. Please ensure someone is available at the delivery location to receive and guide our team. Thank you!',
      variables: '["customer_name", "order_number"]',
      description: 'Sent on the morning of the scheduled delivery date',
      status: 'approved'
    }
  ];

  for (const template of templates) {
    pgm.sql(`
      INSERT INTO whatsapp_templates (
        template_name, category, content, variables,
        description, status, is_active
      ) VALUES (
        '${template.template_name}',
        '${template.category}',
        '${template.content.replace(/'/g, "''")}',
        '${template.variables}'::jsonb,
        '${template.description}',
        '${template.status}',
        TRUE
      )
      ON CONFLICT DO NOTHING;
    `);
  }
};

exports.down = async (pgm) => {
  pgm.sql(`
    DELETE FROM whatsapp_templates
    WHERE template_name IN ('delivery_reminder_3days', 'delivery_day_reminder');
  `);
};
