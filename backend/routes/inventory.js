/**
 * Inventory Routes
 * Phase 21 - Part 1: Inventory Management API Routes
 * Enhanced with Seeds & Saplings tracking
 */

const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/inventory/summary
 * @desc    Get inventory summary grouped by product/SKU/stage (legacy - saplings only)
 * @access  Private
 * @query   product_id (optional) - Filter by product
 * @query   growth_stage (optional) - Filter by growth stage
 */
router.get('/summary', authenticate, inventoryController.getInventorySummary);

/**
 * @route   GET /api/inventory/seeds
 * @desc    Get seed inventory summary from purchases
 * @access  Private
 * @query   product_id, sku_id, inventory_status, vendor_id, expiring_days
 */
router.get('/seeds', authenticate, inventoryController.getSeedInventory);

/**
 * @route   GET /api/inventory/saplings
 * @desc    Get sapling (lots) inventory summary
 * @access  Private
 * @query   product_id, sku_id, growth_stage, location
 */
router.get('/saplings', authenticate, inventoryController.getSaplingInventory);

/**
 * @route   GET /api/inventory/combined
 * @desc    Get combined inventory (seeds + saplings)
 * @access  Private
 * @query   product_id, sku_id
 */
router.get('/combined', authenticate, inventoryController.getCombinedInventory);

/**
 * @route   GET /api/inventory/seeds/:product_id
 * @desc    Get seed inventory details for a specific product
 * @access  Private
 * @param   product_id - Product UUID
 */
router.get('/seeds/:product_id', authenticate, inventoryController.getSeedsByProduct);

/**
 * @route   GET /api/inventory/saplings/:product_id
 * @desc    Get sapling inventory details for a specific product
 * @access  Private
 * @param   product_id - Product UUID
 */
router.get('/saplings/:product_id', authenticate, inventoryController.getSaplingsByProduct);

/**
 * @route   GET /api/inventory/seeds/available-for-lot
 * @desc    Get available seeds for lot creation
 * @access  Private
 * @query   product_id (required), sku_id (optional)
 */
router.get('/seeds/available-for-lot', authenticate, inventoryController.getAvailableSeeds);

/**
 * @route   GET /api/inventory/product/:product_id/breakdown
 * @desc    Get detailed lot breakdown for a specific product (legacy)
 * @access  Private
 * @param   product_id - Product UUID
 */
router.get('/product/:product_id/breakdown', authenticate, inventoryController.getProductInventoryBreakdown);

/**
 * @route   GET /api/inventory/stats
 * @desc    Get overall inventory statistics (enhanced with seeds + saplings)
 * @access  Private
 */
router.get('/stats', authenticate, inventoryController.getInventoryStats);

module.exports = router;
