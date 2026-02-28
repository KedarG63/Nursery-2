import api from '../utils/api';

const skuService = {
  // Get all SKUs with filters
  getAllSKUs: async (params = {}) => {
    const response = await api.get('/api/skus', { params });
    return response.data;
  },

  // Get single SKU by ID
  getSKUById: async (id) => {
    const response = await api.get(`/api/skus/${id}`);
    return response.data;
  },

  // Create new SKU
  createSKU: async (skuData) => {
    const response = await api.post('/api/skus', skuData);
    return response.data;
  },

  // Update SKU
  updateSKU: async (id, skuData) => {
    const response = await api.put(`/api/skus/${id}`, skuData);
    return response.data;
  },

  // Delete SKU (soft delete)
  deleteSKU: async (id) => {
    const response = await api.delete(`/api/skus/${id}`);
    return response.data;
  },

  // Get size options - must match backend database enum
  getSizes: () => {
    return ['small', 'medium', 'large'];
  },

  // Get display names for sizes
  getSizeDisplayName: (size) => {
    const displayNames = {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
    };
    return displayNames[size] || size;
  },

  // Get container type options - must match backend database enum
  getContainerTypes: () => {
    return ['tray', 'pot', 'seedling_tray', 'grow_bag'];
  },

  // Get display names for container types
  getContainerTypeDisplayName: (containerType) => {
    const displayNames = {
      tray: 'Tray',
      pot: 'Pot',
      seedling_tray: 'Seedling Tray',
      grow_bag: 'Grow Bag',
    };
    return displayNames[containerType] || containerType;
  },
};

export default skuService;
