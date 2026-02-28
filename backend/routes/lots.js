/**
 * Lot Routes
 * Issues #16, #17: Lot CRUD API endpoints and scanning
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const lotController = require('../controllers/lotController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  validateCreateLot,
  validateUpdateStage,
  validateUpdateLocation,
  validateListLots,
  validateLotId,
  validateScanLot,
} = require('../validators/lotValidator');

// Rate limiter for scan endpoint - 100 requests per minute per IP
const scanRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: 'Too many scan requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/lots
 * @desc    List lots with filters and pagination
 * @access  Admin, Manager, Warehouse
 */
router.get('/', authorize(['Admin', 'Manager', 'Warehouse']), validateListLots, lotController.listLots);

/**
 * @route   GET /api/lots/:id
 * @desc    Get lot details with movement history
 * @access  Admin, Manager, Warehouse
 */
router.get('/:id', authorize(['Admin', 'Manager', 'Warehouse']), validateLotId, lotController.getLotDetails);

/**
 * @route   POST /api/lots
 * @desc    Create new lot with QR code
 * @access  Admin, Manager
 */
router.post('/', authorize(['Admin', 'Manager']), validateCreateLot, lotController.createLot);

/**
 * @route   PUT /api/lots/:id/stage
 * @desc    Update growth stage
 * @access  Admin, Manager, Warehouse
 */
router.put('/:id/stage', authorize(['Admin', 'Manager', 'Warehouse']), validateUpdateStage, lotController.updateLotStage);

/**
 * @route   PUT /api/lots/:id/location
 * @desc    Move lot to new location
 * @access  Admin, Manager, Warehouse
 */
router.put(
  '/:id/location',
  authorize(['Admin', 'Manager', 'Warehouse']),
  validateUpdateLocation,
  lotController.updateLotLocation
);

/**
 * @route   GET /api/lots/:id/qr
 * @desc    Download QR code
 * @access  Admin, Manager, Warehouse
 */
router.get('/:id/qr', authorize(['Admin', 'Manager', 'Warehouse']), validateLotId, lotController.downloadQRCode);

/**
 * @route   PUT /api/lots/:id/regenerate-qr
 * @desc    Regenerate QR code
 * @access  Admin, Manager
 */
router.put('/:id/regenerate-qr', authorize(['Admin', 'Manager']), validateLotId, lotController.regenerateQRCode);

/**
 * @route   DELETE /api/lots/:id
 * @desc    Soft delete lot
 * @access  Admin, Manager
 */
router.delete('/:id', authorize(['Admin', 'Manager']), validateLotId, lotController.deleteLot);

/**
 * @route   POST /api/lots/scan
 * @desc    Scan lot by QR code (optimized for mobile)
 * @access  All authenticated users
 */
router.post('/scan', scanRateLimiter, validateScanLot, lotController.scanLot);

/**
 * @route   GET /api/lots/:id/scan-stats
 * @desc    Get scan statistics for a lot
 * @access  Admin, Manager
 */
router.get('/:id/scan-stats', authorize(['Admin', 'Manager']), validateLotId, lotController.getLotScanStats);

/**
 * @route   GET /api/lots/:id/growth-status
 * @desc    Get lot growth status with timeline
 * @access  Admin, Manager, Warehouse
 * Phase 21 - Part 1
 */
router.get('/:id/growth-status', authorize(['Admin', 'Manager', 'Warehouse']), validateLotId, lotController.getLotGrowthStatus);

/**
 * @route   GET /api/lots/:id/seed-lineage
 * @desc    Get lot seed lineage - trace back to seed purchase
 * @access  Admin, Manager, Warehouse
 * Phase 22
 */
router.get('/:id/seed-lineage', authorize(['Admin', 'Manager', 'Warehouse']), validateLotId, lotController.getLotSeedLineage);

/**
 * @route   GET /api/lots/by-purchase/:purchaseId
 * @desc    Get all lots created from a specific seed purchase
 * @access  Admin, Manager, Warehouse
 * Workflow enhancement - Shows seed usage history
 */
router.get('/by-purchase/:purchaseId', authorize(['Admin', 'Manager', 'Warehouse']), lotController.getLotsByPurchase);

module.exports = router;
