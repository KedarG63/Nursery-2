/**
 * Upload Routes
 * Handle file uploads for product images and documents
 * Updated for Phase 17: AWS S3 integration
 */

const express = require('express');
const router = express.Router();
const upload = require('../middleware/fileUpload');
const fileStorageService = require('../services/fileStorageService');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const path = require('path');
const fs = require('fs');

// Ensure local uploads directory exists (for backward compatibility)
const uploadDir = path.join(__dirname, '../uploads/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * @route   POST /api/upload/product-image
 * @desc    Upload product image (legacy local storage)
 * @access  Admin, Manager
 */
router.post(
  '/product-image',
  authenticate,
  authorize(['Admin', 'Manager']),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    // Upload to S3
    const result = await fileStorageService.uploadFile(req.file, 'products');

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: result,
    });
  })
);

/**
 * @route   POST /api/upload/image
 * @desc    Upload generic image to S3
 * @access  Authenticated users
 */
router.post(
  '/image',
  authenticate,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    const result = await fileStorageService.uploadFile(req.file, 'images');
    res.json({ success: true, data: result });
  })
);

/**
 * @route   POST /api/upload/document
 * @desc    Upload document to S3
 * @access  Authenticated users
 */
router.post(
  '/document',
  authenticate,
  upload.single('document'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No document file provided',
      });
    }

    const result = await fileStorageService.uploadFile(req.file, 'documents');
    res.json({ success: true, data: result });
  })
);

/**
 * @route   GET /api/upload/signed-url/:key
 * @desc    Get signed URL for private file access
 * @access  Authenticated users
 */
router.get(
  '/signed-url/:key(*)',
  authenticate,
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const expiresIn = parseInt(req.query.expiresIn) || 3600;

    const signedUrl = await fileStorageService.getSignedUrl(key, expiresIn);
    res.json({ success: true, data: { signedUrl } });
  })
);

/**
 * @route   DELETE /api/upload/:key
 * @desc    Delete file from S3
 * @access  Admin, Manager
 */
router.delete(
  '/:key(*)',
  authenticate,
  authorize(['Admin', 'Manager']),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    await fileStorageService.deleteFile(key);
    res.json({ success: true, message: 'File deleted successfully' });
  })
);

/**
 * @route   DELETE /api/upload/product-image/:filename
 * @desc    Delete product image (legacy - local storage)
 * @access  Admin, Manager
 */
router.delete(
  '/product-image/:filename',
  authenticate,
  authorize(['Admin', 'Manager']),
  (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(uploadDir, filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Image not found',
        });
      }

      // Delete file
      fs.unlinkSync(filePath);

      res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
      });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete image',
        error: error.message,
      });
    }
  }
);

module.exports = router;
