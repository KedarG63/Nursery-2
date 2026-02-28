/**
 * Mock External Services
 * Phase 19 - Testing Framework
 *
 * Mock implementations of external services for testing
 */

/**
 * Mock WhatsApp Service
 */
const mockWhatsAppService = {
  sendMessage: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'msg_' + Date.now(),
    status: 'sent'
  }),

  sendTemplate: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'tmpl_' + Date.now(),
    status: 'sent'
  }),

  sendOrderConfirmation: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'order_' + Date.now()
  }),

  sendPaymentReminder: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'payment_' + Date.now()
  }),

  sendDeliveryUpdate: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'delivery_' + Date.now()
  }),

  getMessageStatus: jest.fn().mockResolvedValue({
    status: 'delivered',
    readAt: new Date()
  })
};

/**
 * Mock Payment Gateway (Razorpay)
 */
const mockPaymentGateway = {
  processPayment: jest.fn().mockResolvedValue({
    id: 'pay_' + Date.now(),
    status: 'captured',
    amount: 10000,
    currency: 'INR',
    method: 'upi',
    transactionId: 'txn_' + Date.now(),
    createdAt: new Date()
  }),

  verifyPayment: jest.fn().mockResolvedValue({
    verified: true,
    signature: 'valid_signature',
    status: 'success'
  }),

  createOrder: jest.fn().mockResolvedValue({
    id: 'order_' + Date.now(),
    amount: 10000,
    currency: 'INR',
    status: 'created'
  }),

  refundPayment: jest.fn().mockResolvedValue({
    id: 'rfnd_' + Date.now(),
    amount: 10000,
    status: 'processed',
    createdAt: new Date()
  }),

  getPaymentStatus: jest.fn().mockResolvedValue({
    status: 'captured',
    method: 'upi'
  })
};

/**
 * Mock GPS Tracking Service
 */
const mockGPSService = {
  getCurrentLocation: jest.fn().mockResolvedValue({
    latitude: 28.6139,
    longitude: 77.2090,
    accuracy: 10,
    timestamp: new Date()
  }),

  trackVehicle: jest.fn().mockResolvedValue({
    tracking: true,
    vehicleId: 'vehicle_123',
    location: {
      latitude: 28.6139,
      longitude: 77.2090
    }
  }),

  stopTracking: jest.fn().mockResolvedValue({
    tracking: false
  }),

  getLocationHistory: jest.fn().mockResolvedValue([
    {
      latitude: 28.6139,
      longitude: 77.2090,
      timestamp: new Date()
    }
  ]),

  calculateDistance: jest.fn().mockResolvedValue({
    distance: 5.2,
    unit: 'km',
    duration: 15,
    durationUnit: 'minutes'
  })
};

/**
 * Mock Email Service
 */
const mockEmailService = {
  sendEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'email_' + Date.now()
  }),

  sendPasswordResetEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'reset_' + Date.now()
  }),

  sendWelcomeEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'welcome_' + Date.now()
  }),

  sendOrderConfirmation: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'order_email_' + Date.now()
  })
};

/**
 * Mock File Storage Service (AWS S3)
 */
const mockStorageService = {
  uploadFile: jest.fn().mockResolvedValue({
    success: true,
    fileUrl: 'https://mock-storage.com/file_' + Date.now(),
    key: 'uploads/file_' + Date.now(),
    size: 1024
  }),

  deleteFile: jest.fn().mockResolvedValue({
    success: true
  }),

  getSignedUrl: jest.fn().mockResolvedValue({
    url: 'https://mock-storage.com/signed_' + Date.now(),
    expiresAt: new Date(Date.now() + 3600000)
  }),

  listFiles: jest.fn().mockResolvedValue({
    files: []
  })
};

/**
 * Mock Google Maps Service
 */
const mockMapsService = {
  geocode: jest.fn().mockResolvedValue({
    latitude: 28.6139,
    longitude: 77.2090,
    formattedAddress: 'New Delhi, Delhi, India'
  }),

  reverseGeocode: jest.fn().mockResolvedValue({
    address: 'New Delhi, Delhi, India',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    postalCode: '110001'
  }),

  getDistanceMatrix: jest.fn().mockResolvedValue({
    distance: {
      value: 5200,
      text: '5.2 km'
    },
    duration: {
      value: 900,
      text: '15 mins'
    }
  }),

  optimizeRoute: jest.fn().mockResolvedValue({
    optimizedOrder: [0, 2, 1, 3],
    totalDistance: 25.5,
    totalDuration: 65
  })
};

/**
 * Mock Cache Service (Redis)
 */
const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),

  set: jest.fn().mockResolvedValue('OK'),

  del: jest.fn().mockResolvedValue(1),

  exists: jest.fn().mockResolvedValue(0),

  expire: jest.fn().mockResolvedValue(1),

  flush: jest.fn().mockResolvedValue('OK')
};

/**
 * Reset all mocks
 * Call this in beforeEach to clear mock call history
 */
function resetAllMocks() {
  Object.values(mockWhatsAppService).forEach(fn => fn.mockClear());
  Object.values(mockPaymentGateway).forEach(fn => fn.mockClear());
  Object.values(mockGPSService).forEach(fn => fn.mockClear());
  Object.values(mockEmailService).forEach(fn => fn.mockClear());
  Object.values(mockStorageService).forEach(fn => fn.mockClear());
  Object.values(mockMapsService).forEach(fn => fn.mockClear());
  Object.values(mockCacheService).forEach(fn => fn.mockClear());
}

/**
 * Setup mock failures for error testing
 */
function setupMockFailures() {
  mockWhatsAppService.sendMessage.mockRejectedValueOnce(
    new Error('WhatsApp service unavailable')
  );

  mockPaymentGateway.processPayment.mockRejectedValueOnce(
    new Error('Payment processing failed')
  );

  mockGPSService.getCurrentLocation.mockRejectedValueOnce(
    new Error('GPS service unavailable')
  );
}

module.exports = {
  mockWhatsAppService,
  mockPaymentGateway,
  mockGPSService,
  mockEmailService,
  mockStorageService,
  mockMapsService,
  mockCacheService,
  resetAllMocks,
  setupMockFailures
};
