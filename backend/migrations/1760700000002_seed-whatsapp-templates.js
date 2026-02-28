/**
 * Migration: Seed default WhatsApp templates
 * Issue #40: Create Message Templates Table
 */

exports.up = async (pgm) => {
  // Seed default templates
  const templates = [
    {
      template_name: 'order_confirmation',
      category: 'order',
      content: 'Hello {{1}}! 🌱 Your order #{{2}} has been confirmed. Total: ₹{{3}}. Expected delivery: {{4}}. Track your order: {{5}}',
      variables: '["customer_name", "order_number", "total_amount", "delivery_date", "tracking_url"]',
      description: 'Sent when a new order is created',
      status: 'approved'
    },
    {
      template_name: 'order_ready',
      category: 'order',
      content: 'Good news {{1}}! 🎉 Your order #{{2}} is ready for delivery. We will dispatch it soon. Questions? Reply to this message.',
      variables: '["customer_name", "order_number"]',
      description: 'Sent when order status changes to ready',
      status: 'approved'
    },
    {
      template_name: 'delivery_dispatched',
      category: 'delivery',
      content: 'Hi {{1}}! 🚚 Your order #{{2}} is out for delivery. Driver: {{3}}. Track live: {{4}}',
      variables: '["customer_name", "order_number", "driver_name", "tracking_url"]',
      description: 'Sent when delivery route starts',
      status: 'approved'
    },
    {
      template_name: 'delivery_eta_alert',
      category: 'delivery',
      content: '🚚 Your delivery will arrive in approximately {{1}} minutes! Driver {{2}} is nearby. Order: #{{3}}',
      variables: '["eta_minutes", "driver_name", "order_number"]',
      description: 'Sent when driver is within 5km of delivery address',
      status: 'approved'
    },
    {
      template_name: 'delivery_completed',
      category: 'delivery',
      content: '✅ Delivered! Thank you {{1}}! Your order #{{2}} has been delivered. Rate your experience: {{3}}',
      variables: '["customer_name", "order_number", "feedback_url"]',
      description: 'Sent when delivery is marked as completed',
      status: 'approved'
    },
    {
      template_name: 'payment_reminder',
      category: 'payment',
      content: 'Hi {{1}}, this is a friendly reminder about your pending payment of ₹{{2}} for order #{{3}}. Due date: {{4}}. Pay now: {{5}}',
      variables: '["customer_name", "amount", "order_number", "due_date", "payment_url"]',
      description: 'Sent daily for overdue payments',
      status: 'approved'
    },
    {
      template_name: 'payment_received',
      category: 'payment',
      content: '💰 Payment received! Thank you {{1}}. ₹{{2}} has been credited to your account. Order: #{{3}}',
      variables: '["customer_name", "amount", "order_number"]',
      description: 'Sent when payment is received',
      status: 'approved'
    },
    {
      template_name: 'delivery_failed',
      category: 'delivery',
      content: 'Hi {{1}}, we couldn\'t deliver your order #{{2}} today. Reason: {{3}}. We will retry tomorrow. Contact: {{4}}',
      variables: '["customer_name", "order_number", "failure_reason", "support_number"]',
      description: 'Sent when delivery attempt fails',
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
      );
    `);
  }
};

exports.down = async (pgm) => {
  pgm.sql(`DELETE FROM whatsapp_templates WHERE template_name IN (
    'order_confirmation',
    'order_ready',
    'delivery_dispatched',
    'delivery_eta_alert',
    'delivery_completed',
    'payment_reminder',
    'payment_received',
    'delivery_failed'
  );`);
};
