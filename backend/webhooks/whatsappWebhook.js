/**
 * WhatsApp Webhook Handler
 * Handles status updates and incoming messages from WhatsApp providers
 * Issue #43: Create Webhook Handler for Message Status
 */

const pool = require('../config/database');
const whatsappConfig = require('../config/whatsapp');

/**
 * Handle WhatsApp status webhook (Generic)
 */
async function handleStatusWebhook(req, res) {
  try {
    // Verify webhook signature (provider-specific)
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const { messageId, status, timestamp, error } = parseWebhookPayload(req.body);

    // Update message status in database
    await updateMessageStatus(messageId, status, error);

    // Respond with 200 OK
    res.status(200).json({
      success: true,
      message: 'Webhook processed'
    });

  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message
    });
  }
}

/**
 * Handle incoming message webhook
 */
async function handleIncomingMessage(req, res) {
  try {
    const { from, messageId, text, timestamp } = parseIncomingMessage(req.body);

    // Check for opt-out keywords
    if (isOptOutKeyword(text)) {
      await handleOptOutRequest(from);
      // Send confirmation (mock)
      console.log(`Opt-out processed for ${from}`);
    }

    // Log incoming message
    await logIncomingMessage({
      messageId,
      senderNumber: from,
      content: text,
      receivedAt: new Date(timestamp)
    });

    res.status(200).json({
      success: true,
      message: 'Message received'
    });

  } catch (error) {
    console.error('Error processing incoming message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process message',
      error: error.message
    });
  }
}

/**
 * Meta webhook verification (GET)
 * Meta calls this once when you register the webhook URL in the Developer Console
 */
function handleMetaVerification(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Meta WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('⚠️  Meta webhook verification failed — token mismatch');
  return res.sendStatus(403);
}

/**
 * Meta webhook event handler (POST)
 * Receives delivery status updates and inbound messages from Meta
 * Always ACKs with 200 immediately, then processes asynchronously
 */
async function handleMetaWebhook(req, res) {
  // ACK immediately — Meta retries if it doesn't get 200 within 20s
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;

      // --- Delivery status updates ---
      for (const statusObj of value.statuses || []) {
        const { id: messageId, status: newStatus, timestamp, errors } = statusObj;

        const statusField = {
          sent:      'sent_at',
          delivered: 'delivered_at',
          read:      'read_at',
          failed:    'failed_at'
        }[newStatus];

        if (!statusField) continue;

        const errorMessage = errors?.[0]?.message || null;

        try {
          await updateMessageStatus(messageId, newStatus, errorMessage, timestamp);
        } catch (err) {
          console.error('Error updating Meta message status:', err.message);
        }
      }

      // --- Inbound messages (opt-out keywords) ---
      for (const message of value.messages || []) {
        if (message.type !== 'text') continue;

        const text  = message.text.body.trim().toUpperCase();
        const phone = message.from;

        if (isOptOutKeyword(text)) {
          try {
            await handleOptOutRequest(phone);
            console.log(`📵 Opt-out processed via Meta webhook for ${phone}`);
          } catch (err) {
            console.error('Error processing Meta opt-out:', err.message);
          }
        }

        try {
          await logIncomingMessage({
            messageId:    message.id,
            senderNumber: phone,
            content:      message.text.body,
            receivedAt:   new Date(Number(message.timestamp) * 1000)
          });
        } catch (err) {
          console.error('Error logging Meta inbound message:', err.message);
        }
      }
    }
  }
}

/**
 * Mock webhook (for testing)
 */
async function handleMockWebhook(req, res) {
  try {
    console.log('📱 MOCK WHATSAPP WEBHOOK:', req.body);

    const { messageId, status } = req.body;

    if (messageId && status) {
      await updateMessageStatus(messageId, status);
    }

    res.status(200).json({
      success: true,
      message: 'Mock webhook processed',
      data: req.body
    });

  } catch (error) {
    console.error('Error processing mock webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message
    });
  }
}

/**
 * Update message status in database
 * @param {string} messageId
 * @param {string} status
 * @param {string|null} errorMessage
 * @param {string|null} unixTimestamp - Unix epoch string from Meta webhook (optional)
 */
async function updateMessageStatus(messageId, status, errorMessage = null, unixTimestamp = null) {
  const statusField = {
    'sent':      'sent_at',
    'delivered': 'delivered_at',
    'read':      'read_at',
    'failed':    'failed_at'
  }[status];

  // Use Meta's timestamp if provided, otherwise NOW()
  const timestampExpr = unixTimestamp
    ? `to_timestamp(${parseInt(unixTimestamp, 10)})`
    : 'NOW()';

  let query = `UPDATE whatsapp_messages SET status = $1`;
  const values = [status, messageId];

  if (statusField) {
    query += `, ${statusField} = ${timestampExpr}`;
  }

  if (errorMessage) {
    query += `, error_message = $3`;
    values.push(errorMessage);
  }

  query += ` WHERE message_id = $2`;

  await pool.query(query, values);
}

/**
 * Log incoming message
 */
async function logIncomingMessage(messageData) {
  const query = `
    INSERT INTO whatsapp_messages (
      message_id, direction, sender_number,
      content, status, created_at
    )
    VALUES ($1, 'inbound', $2, $3, 'queued', $4)
  `;

  const values = [
    messageData.messageId,
    messageData.senderNumber,
    messageData.content,
    messageData.receivedAt
  ];

  await pool.query(query, values);
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(req) {
  // For mock, always return true
  if (whatsappConfig.provider === 'mock') {
    return true;
  }

  // For production providers, implement signature verification
  // const signature = req.headers['x-webhook-signature'];
  // Implement provider-specific verification

  return true;
}

/**
 * Parse webhook payload (provider-agnostic)
 */
function parseWebhookPayload(body) {
  // Mock format
  if (body.provider === 'mock' || !body.provider) {
    return {
      messageId: body.messageId,
      status: body.status,
      timestamp: body.timestamp || Date.now(),
      error: body.error
    };
  }

  // Add parsers for real providers (Twilio, Gupshup)
  return body;
}

/**
 * Parse incoming message
 */
function parseIncomingMessage(body) {
  return {
    from: body.from || body.phoneNumber,
    messageId: body.messageId,
    text: body.text || body.message,
    timestamp: body.timestamp || Date.now()
  };
}

/**
 * Check if text contains opt-out keyword
 */
function isOptOutKeyword(text) {
  if (!text) return false;
  const keywords = whatsappConfig.settings.optOutKeywords;
  const upperText = text.toUpperCase().trim();
  return keywords.some(keyword => upperText.includes(keyword));
}

/**
 * Handle opt-out request
 */
async function handleOptOutRequest(phoneNumber) {
  // Find customer by phone
  const customerQuery = `
    SELECT id FROM customers WHERE phone_number = $1 LIMIT 1
  `;

  const result = await pool.query(customerQuery, [phoneNumber]);

  if (result.rows.length > 0) {
    const customerId = result.rows[0].id;

    const optOutQuery = `
      INSERT INTO whatsapp_opt_outs (customer_id, phone_number, opted_out_all, opted_out_reason)
      VALUES ($1, $2, TRUE, 'Customer requested via WhatsApp')
      ON CONFLICT (customer_id, phone_number)
      DO UPDATE SET
        opted_out_all = TRUE,
        opted_out_at = NOW(),
        updated_at = NOW()
    `;

    await pool.query(optOutQuery, [customerId, phoneNumber]);
  }
}

module.exports = {
  handleStatusWebhook,
  handleIncomingMessage,
  handleMockWebhook,
  handleMetaVerification,
  handleMetaWebhook
};
