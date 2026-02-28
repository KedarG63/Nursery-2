/**
 * Simplified Message Queue (In-Memory)
 * For production, consider using Bull with Redis
 * Issue #41: Create Message Queue and Logging System
 */

/**
 * Message Queue Implementation
 */
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.processInterval = null;
  }

  /**
   * Add message to queue
   */
  async add(messageData) {
    const queueItem = {
      id: this.generateId(),
      data: messageData,
      addedAt: new Date(),
      attempts: 0
    };

    this.queue.push(queueItem);

    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    return queueItem.id;
  }

  /**
   * Start processing queue
   */
  startProcessing() {
    if (this.processing) return;

    this.processing = true;
    this.processInterval = setInterval(() => {
      this.processNext();
    }, 1000); // Process every second
  }

  /**
   * Process next message in queue
   */
  async processNext() {
    if (this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();

    try {
      await this.processMessage(item);
    } catch (error) {
      console.error('Error processing message:', error);

      // Retry logic
      if (item.attempts < 3) {
        item.attempts++;
        this.queue.push(item); // Re-queue
      } else {
        console.error(`Message ${item.id} failed after 3 attempts`);
      }
    }
  }

  /**
   * Process individual message
   */
  async processMessage(item) {
    // This will be implemented by the WhatsApp service
    const WhatsAppService = require('./whatsappService');
    const whatsappService = new WhatsAppService();

    await whatsappService.sendMessage(
      item.data.phoneNumber,
      item.data.message,
      item.data.options
    );
  }

  /**
   * Stop processing
   */
  stopProcessing() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    this.processing = false;
  }

  /**
   * Get queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing
    };
  }

  /**
   * Generate ID
   */
  generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let queueInstance = null;

module.exports = {
  getQueue: () => {
    if (!queueInstance) {
      queueInstance = new MessageQueue();
    }
    return queueInstance;
  }
};
