const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const { validateProductCreation, validateProductUpdate } = require('../validators/productValidator');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// GET /api/products - List all products with pagination and filters
router.get('/', productController.getAllProducts);

// GET /api/products/:id - Get single product
router.get('/:id', productController.getProductById);

// POST /api/products - Create new product (Admin and Manager only)
router.post(
  '/',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateProductCreation,
  productController.createProduct
);

// PUT /api/products/:id - Update product (Admin and Manager only)
router.put(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  validateProductUpdate,
  productController.updateProduct
);

// DELETE /api/products/:id - Soft delete product (Admin and Manager only)
router.delete(
  '/:id',
  authenticate,
  authorize(['Admin', 'Manager']),
  productController.deleteProduct
);

module.exports = router;
