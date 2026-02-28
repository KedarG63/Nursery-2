import api from '../utils/api';

const productService = {
  // Get all products with filters and pagination
  getAllProducts: async (params = {}) => {
    const response = await api.get('/api/products', { params });
    return response.data;
  },

  // Get single product by ID
  getProductById: async (id) => {
    const response = await api.get(`/api/products/${id}`);
    return response.data;
  },

  // Create new product
  createProduct: async (productData) => {
    const response = await api.post('/api/products', productData);
    return response.data;
  },

  // Update product
  updateProduct: async (id, productData) => {
    const response = await api.put(`/api/products/${id}`, productData);
    return response.data;
  },

  // Delete product (soft delete)
  deleteProduct: async (id) => {
    const response = await api.delete(`/api/products/${id}`);
    return response.data;
  },

  // Get product categories (enum) - must match backend database enum
  getCategories: () => {
    return ['leafy_greens', 'fruiting', 'root', 'herbs'];
  },

  // Get display names for categories
  getCategoryDisplayName: (category) => {
    const displayNames = {
      leafy_greens: 'Leafy Greens',
      fruiting: 'Fruiting',
      root: 'Root',
      herbs: 'Herbs',
    };
    return displayNames[category] || category;
  },
};

export default productService;
