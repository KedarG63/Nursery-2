/**
 * Inventory Service
 * API calls for inventory management (seeds and saplings)
 */

import api from '../utils/api';

const inventoryService = {
  /**
   * Get seed inventory summary
   */
  getSeedInventory: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.sku_id) params.append('sku_id', filters.sku_id);
    if (filters.inventory_status) params.append('inventory_status', filters.inventory_status);
    if (filters.vendor_id) params.append('vendor_id', filters.vendor_id);
    if (filters.expiring_days) params.append('expiring_days', filters.expiring_days);

    const response = await api.get(`/api/inventory/seeds?${params.toString()}`);
    return response.data;
  },

  /**
   * Get sapling inventory summary
   */
  getSaplingInventory: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.sku_id) params.append('sku_id', filters.sku_id);
    if (filters.growth_stage) params.append('growth_stage', filters.growth_stage);
    if (filters.location) params.append('location', filters.location);

    const response = await api.get(`/api/inventory/saplings?${params.toString()}`);
    return response.data;
  },

  /**
   * Get combined inventory (seeds + saplings)
   */
  getCombinedInventory: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.product_id) params.append('product_id', filters.product_id);
    if (filters.sku_id) params.append('sku_id', filters.sku_id);

    const response = await api.get(`/api/inventory/combined?${params.toString()}`);
    return response.data;
  },

  /**
   * Get seed inventory for a specific product
   */
  getSeedsByProduct: async (productId) => {
    const response = await api.get(`/api/inventory/seeds/${productId}`);
    return response.data;
  },

  /**
   * Get sapling inventory for a specific product
   */
  getSaplingsByProduct: async (productId) => {
    const response = await api.get(`/api/inventory/saplings/${productId}`);
    return response.data;
  },

  /**
   * Get available seeds for lot creation
   */
  getAvailableSeedsForLot: async (productId, skuId = null) => {
    const params = new URLSearchParams({ product_id: productId });
    if (skuId) params.append('sku_id', skuId);

    const response = await api.get(`/api/inventory/seeds/available-for-lot?${params.toString()}`);
    return response.data;
  },

  /**
   * Get inventory statistics
   */
  getInventoryStats: async () => {
    const response = await api.get('/api/inventory/stats');
    return response.data;
  },

  /**
   * Helper: Get inventory status color
   */
  getInventoryStatusColor: (status) => {
    const colors = {
      available: 'success',
      low_stock: 'warning',
      exhausted: 'error',
      expired: 'error',
    };
    return colors[status] || 'default';
  },

  /**
   * Helper: Get inventory status display text
   */
  getInventoryStatusDisplay: (status) => {
    const displays = {
      available: 'Available',
      low_stock: 'Low Stock',
      exhausted: 'Exhausted',
      expired: 'Expired',
    };
    return displays[status] || status;
  },

  /**
   * Helper: Get growth stage display
   */
  getGrowthStageDisplay: (stage) => {
    const displays = {
      seed: 'Seed',
      germination: 'Germination',
      seedling: 'Seedling',
      transplant: 'Transplant',
      ready: 'Ready',
      sold: 'Sold',
    };
    return displays[stage] || stage;
  },

  /**
   * Helper: Get growth stage color
   */
  getGrowthStageColor: (stage) => {
    const colors = {
      seed: 'default',
      germination: 'info',
      seedling: 'primary',
      transplant: 'secondary',
      ready: 'success',
      sold: 'default',
    };
    return colors[stage] || 'default';
  },
};

export default inventoryService;
