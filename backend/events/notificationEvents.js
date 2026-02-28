/**
 * Notification Event Emitters
 * Trigger WhatsApp notifications on specific events
 * Issue #44: Implement Automated Notification Triggers
 */

const EventEmitter = require('events');
const NotificationService = require('../services/notificationService');

const notificationService = new NotificationService();

class NotificationEvents extends EventEmitter {
  constructor() {
    super();
    this.setupListeners();
  }

  setupListeners() {
    // Order events
    this.on('order:created', this.handleOrderCreated.bind(this));
    this.on('order:ready', this.handleOrderReady.bind(this));

    // Delivery events
    this.on('delivery:dispatched', this.handleDeliveryDispatched.bind(this));
    this.on('delivery:eta', this.handleDeliveryETA.bind(this));
    this.on('delivery:completed', this.handleDeliveryCompleted.bind(this));
    this.on('delivery:failed', this.handleDeliveryFailed.bind(this));

    // Payment events
    this.on('payment:received', this.handlePaymentReceived.bind(this));
    this.on('payment:reminder', this.handlePaymentReminder.bind(this));
  }

  async handleOrderCreated(data) {
    try {
      await notificationService.sendOrderConfirmation(data.orderId);
      console.log(`✅ Order confirmation sent for order ${data.orderId}`);
    } catch (error) {
      console.error('Error sending order confirmation:', error.message);
    }
  }

  async handleOrderReady(data) {
    try {
      await notificationService.sendOrderReady(data.orderId);
      console.log(`✅ Order ready notification sent for order ${data.orderId}`);
    } catch (error) {
      console.error('Error sending order ready notification:', error.message);
    }
  }

  async handleDeliveryDispatched(data) {
    try {
      await notificationService.sendDeliveryDispatched(data.routeId);
      console.log(`✅ Delivery dispatched notification sent for route ${data.routeId}`);
    } catch (error) {
      console.error('Error sending dispatch notification:', error.message);
    }
  }

  async handleDeliveryETA(data) {
    try {
      await notificationService.sendETAAlert(data.stopId, data.etaMinutes);
      console.log(`✅ ETA alert sent for stop ${data.stopId}`);
    } catch (error) {
      console.error('Error sending ETA alert:', error.message);
    }
  }

  async handleDeliveryCompleted(data) {
    try {
      await notificationService.sendDeliveryCompleted(data.stopId);
      console.log(`✅ Delivery completed notification sent for stop ${data.stopId}`);
    } catch (error) {
      console.error('Error sending delivery completed notification:', error.message);
    }
  }

  async handleDeliveryFailed(data) {
    try {
      await notificationService.sendDeliveryFailed(data.stopId, data.failureReason);
      console.log(`❌ Delivery failed notification sent for stop ${data.stopId}`);
    } catch (error) {
      console.error('Error handling delivery failure:', error.message);
    }
  }

  async handlePaymentReceived(data) {
    try {
      await notificationService.sendPaymentReceived(data.paymentId);
      console.log(`✅ Payment received confirmation sent for payment ${data.paymentId}`);
    } catch (error) {
      console.error('Error sending payment confirmation:', error.message);
    }
  }

  async handlePaymentReminder(data) {
    try {
      await notificationService.sendPaymentReminder(data.paymentId);
      console.log(`✅ Payment reminder sent for payment ${data.paymentId}`);
    } catch (error) {
      console.error('Error sending payment reminder:', error.message);
    }
  }
}

// Singleton instance
const notificationEvents = new NotificationEvents();

module.exports = notificationEvents;
