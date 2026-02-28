const express = require('express');
const router = express.Router();

const skuController = require('../controllers/skuController');
const { validateSKUCreation, validateSKUUpdate } = require('../validators/skuValidator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// GET /api/skus - List all SKUs with filters
router.get('/', skuController.getAllSKUs);

// GET /api/skus/:id/stock-details - Get detailed stock breakdown (must be before /:id)
router.get('/:id/stock-details', skuController.getSKUStockDetails);

// GET /api/skus/:id - Get single SKU details
router.get('/:id', skuController.getSKUById);

// POST /api/skus - Create new SKU (Admin and Manager only)
router.post(
  '/',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateSKUCreation,
  skuController.createSKU
);

// PUT /api/skus/:id - Update SKU (Admin and Manager only)
router.put(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateSKUUpdate,
  skuController.updateSKU
);

// DELETE /api/skus/:id - Deactivate SKU (Admin and Manager only)
router.delete(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  skuController.deleteSKU
);

module.exports = router;
