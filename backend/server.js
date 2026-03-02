require('dotenv').config();
require('express-async-errors'); // Phase 17: Handle async errors
const express = require('express');
const cors = require('cors');
const db = require('./utils/db');
const logger = require('./config/logger'); // Phase 17: Winston logger
const requestLogger = require('./middleware/requestLogger'); // Phase 17: Request logging
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler'); // Phase 17: Error handling

const app = express();
const PORT = process.env.PORT || 5000;

// Webhook routes BEFORE body parser (needs raw body for signature verification)
const paymentWebhook = require('./webhooks/paymentWebhook');
const gpsWebhook = require('./webhooks/gpsWebhook');
const whatsappWebhook = require('./webhooks/whatsappWebhook');

app.post(
  '/webhooks/payment',
  express.raw({ type: 'application/json' }),
  paymentWebhook.handlePaymentWebhook
);

// GPS webhooks (for future real GPS provider integration)
app.post('/webhooks/gps/loconav', express.json(), gpsWebhook.handleLocoNavWebhook);
app.post('/webhooks/gps/fleetx', express.json(), gpsWebhook.handleFleetxWebhook);
app.post('/webhooks/gps/test', express.json(), gpsWebhook.handleTestWebhook);

// WhatsApp webhooks (Phase 9)
app.post('/webhooks/whatsapp/status', express.json(), whatsappWebhook.handleStatusWebhook);
app.post('/webhooks/whatsapp/incoming', express.json(), whatsappWebhook.handleIncomingMessage);
app.post('/webhooks/whatsapp/mock', express.json(), whatsappWebhook.handleMockWebhook);

// Meta WhatsApp Business API webhook
// GET: one-time verification when registering the URL in Meta Developer Console
// POST: receives delivery status updates and inbound messages from Meta
app.get('/webhooks/whatsapp/meta', whatsappWebhook.handleMetaVerification);
app.post('/webhooks/whatsapp/meta', express.json(), whatsappWebhook.handleMetaWebhook);

// Phase 18: Security headers (must be first)
const { helmetConfig, corsOptions } = require('./config/security');
const { httpsRedirect, secureHeaders } = require('./middleware/httpsRedirect');

app.use(helmetConfig); // Apply security headers
app.use(httpsRedirect); // HTTPS redirect in production
app.use(secureHeaders); // Secure headers for sensitive endpoints

// Middleware
app.use(cors(corsOptions)); // Use enhanced CORS configuration
app.disable('x-powered-by'); // Extra protection

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phase 18: Compression middleware (before rate limiting)
const { compressionMiddleware, compressionStats } = require('./middleware/compression');
app.use(compressionStats); // Track compression stats
app.use(compressionMiddleware); // Enable compression

// Phase 18: Rate limiting middleware
const { globalRateLimiter, whitelistMiddleware } = require('./middleware/rateLimiter');
app.use(whitelistMiddleware); // Apply whitelist check first
app.use(globalRateLimiter); // Apply global rate limiter to all routes

// Phase 17: Request logging middleware
app.use(requestLogger);

// Phase 20: GCP Cloud Monitoring metrics middleware
const metricsMiddleware = require('./middleware/cloudwatchMetrics');
app.use(metricsMiddleware);

// Phase 20: Health check routes (before other routes)
const healthRoutes = require('./routes/health');
app.use('/health', healthRoutes);

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const skuRoutes = require('./routes/skus');
const lotRoutes = require('./routes/lots');
const inventoryRoutes = require('./routes/inventory'); // Phase 21 - Part 1
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const deliveryRoutes = require('./routes/delivery');
const driverRoutes = require('./routes/driver');
const vehicleRoutes = require('./routes/vehicles');
const uploadRoutes = require('./routes/upload');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');
const vendorRoutes = require('./routes/vendors'); // Phase 22
const purchaseRoutes = require('./routes/purchases'); // Phase 22

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/inventory', inventoryRoutes); // Phase 21 - Part 1
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/delivery', deliveryRoutes); // Delivery summary endpoints - must be BEFORE /api/routes
app.use('/api/routes', deliveryRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/vendors', vendorRoutes); // Phase 22
app.use('/api/purchases', purchaseRoutes); // Phase 22

// Serve uploaded files (delivery proofs)
app.use('/uploads', express.static('uploads'));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Nursery Management System API' });
});

// Phase 17: 404 handler (after all routes)
app.use(notFoundHandler);

// Phase 17: Global error handler (must be last)
app.use(errorHandler);

// Start server with database connection test
async function startServer() {
  try {
    // Test database connection
    const isConnected = await db.testConnection();

    if (isConnected) {
      logger.info('✓ Database connection successful');
    } else {
      logger.warn('⚠ Database connection failed - server will start but database operations will fail');
    }

    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Phase 20: Track application start
      const cloudwatch = require('./config/cloudwatch');
      cloudwatch.putMetric('ApplicationStart', 1, 'Count');

      // Initialize notification cron jobs (Phase 9)
      const NotificationJobs = require('./jobs/notificationJobs');
      NotificationJobs.initializeJobs();

      // Initialize Phase 16 automated jobs
      logger.info('🤖 Initializing Phase 16 automation jobs...');
      const ReadyNotificationJob = require('./jobs/readyNotificationJob');
      const PaymentReminderJob = require('./jobs/paymentReminderJob');
      const GrowthProgressJob = require('./jobs/growthProgressJob');

      ReadyNotificationJob.initialize();
      PaymentReminderJob.initialize();
      GrowthProgressJob.initialize();

      logger.info('✅ All automation jobs initialized successfully');
    });

    // Store server reference for graceful shutdown
    app.set('server', server);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Phase 20: Graceful shutdown with GCP Monitoring tracking
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');

  const cloudwatch = require('./config/cloudwatch');
  await cloudwatch.putMetric('ApplicationShutdown', 1, 'Count');

  const server = app.get('server');
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await db.closePool();
      process.exit(0);
    });
  } else {
    await db.closePool();
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');

  const cloudwatch = require('./config/cloudwatch');
  await cloudwatch.putMetric('ApplicationShutdown', 1, 'Count');

  const server = app.get('server');
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await db.closePool();
      process.exit(0);
    });
  } else {
    await db.closePool();
    process.exit(0);
  }
});

// Phase 17: Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Phase 17: Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

startServer();


