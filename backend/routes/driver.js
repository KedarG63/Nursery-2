/**
 * Driver Routes
 * Issue #38: Driver mobile app endpoints
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const driverController = require('../controllers/driverController');
const { authenticateDriver } = require('../middleware/driverAuth');
const {
  validateStopArrival,
  validateDeliveryComplete,
  validateProofUpload,
  validateLocationUpdate
} = require('../validators/deliveryValidator');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/proofs/'); // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

// Apply driver authentication to all routes
router.use(authenticateDriver);

/**
 * GET /api/driver/routes/today
 * Get today's routes for authenticated driver
 */
router.get('/routes/today', driverController.getTodayRoutes);

/**
 * POST /api/driver/stops/:id/arrive
 * Mark arrival at a stop
 */
router.post('/stops/:id/arrive', validateStopArrival, driverController.markArrival);

/**
 * POST /api/driver/stops/:id/deliver
 * Mark delivery complete
 */
router.post('/stops/:id/deliver', validateDeliveryComplete, driverController.markDelivered);

/**
 * POST /api/driver/stops/:id/proof
 * Upload delivery proof (signature, photo, feedback)
 * Multipart form-data with file upload
 */
router.post(
  '/stops/:id/proof',
  upload.single('file'),
  validateProofUpload,
  driverController.uploadProof
);

/**
 * GET /api/driver/stops/:id/navigation
 * Get navigation details for a stop
 */
router.get('/stops/:id/navigation', driverController.getNavigation);

/**
 * POST /api/driver/location
 * Update GPS location
 */
router.post('/location', validateLocationUpdate, driverController.updateLocation);

module.exports = router;
