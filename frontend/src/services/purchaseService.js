import api from '../utils/api';

const purchaseService = {
  // Get all seed purchases with filters and pagination
  getAllPurchases: async (params = {}) => {
    // Convert page to offset for backend
    const requestParams = { ...params };
    if (requestParams.page) {
      const page = parseInt(requestParams.page) || 1;
      const limit = parseInt(requestParams.limit) || 20;
      requestParams.offset = (page - 1) * limit;
      delete requestParams.page;
    }
    const response = await api.get('/api/purchases', { params: requestParams });
    // Convert offset-based pagination to page-based for frontend
    if (response.data.pagination) {
      const { offset, limit, total } = response.data.pagination;
      response.data.pagination.totalPages = Math.ceil(total / limit);
      response.data.pagination.currentPage = Math.floor(offset / limit) + 1;
    }
    return response.data;
  },

  // Get single purchase by ID
  getPurchaseById: async (id) => {
    const response = await api.get(`/api/purchases/${id}`);
    return response.data;
  },

  // Create new seed purchase
  createPurchase: async (purchaseData) => {
    const response = await api.post('/api/purchases', purchaseData);
    return response.data;
  },

  // Update seed purchase
  updatePurchase: async (id, purchaseData) => {
    const response = await api.put(`/api/purchases/${id}`, purchaseData);
    return response.data;
  },

  // Delete seed purchase (soft delete)
  deletePurchase: async (id) => {
    const response = await api.delete(`/api/purchases/${id}`);
    return response.data;
  },

  // Get available seeds for a specific product/SKU
  getAvailableSeeds: async (productId, skuId = null) => {
    const params = { product_id: productId, seeds_needed: 1 };
    if (skuId) params.sku_id = skuId;
    const response = await api.get('/api/purchases/check-availability', { params });
    return response.data;
  },

  // Record seed usage (when creating lots)
  recordSeedUsage: async (purchaseId, seedsUsed) => {
    const response = await api.post(`/api/purchases/${purchaseId}/use-seeds`, {
      seeds_used: seedsUsed,
    });
    return response.data;
  },

  // Add payment to seed purchase
  addPayment: async (purchaseId, paymentData) => {
    const response = await api.post(`/api/purchases/${purchaseId}/payments`, paymentData);
    return response.data;
  },

  // Get payment history for a purchase
  getPaymentHistory: async (purchaseId) => {
    const response = await api.get(`/api/purchases/${purchaseId}/payments`);
    return response.data;
  },

  // Get inventory status types
  getInventoryStatuses: () => {
    return ['available', 'low_stock', 'exhausted', 'expired'];
  },

  // Get payment status types
  getPaymentStatuses: () => {
    return ['pending', 'partial', 'paid'];
  },

  // Get payment methods
  getPaymentMethods: () => {
    return ['cash', 'bank_transfer', 'check', 'upi'];
  },

  // Get display names for inventory status
  getInventoryStatusDisplay: (status) => {
    const displayNames = {
      available: 'Available',
      low_stock: 'Low Stock',
      exhausted: 'Exhausted',
      expired: 'Expired',
    };
    return displayNames[status] || status;
  },

  // Get display names for payment status
  getPaymentStatusDisplay: (status) => {
    const displayNames = {
      pending: 'Pending',
      partial: 'Partial',
      paid: 'Paid',
    };
    return displayNames[status] || status;
  },

  // Get display names for payment methods
  getPaymentMethodDisplay: (method) => {
    const displayNames = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      check: 'Check',
      upi: 'UPI',
    };
    return displayNames[method] || method;
  },

  // Get status color for inventory status
  getInventoryStatusColor: (status) => {
    const colors = {
      available: 'success',
      low_stock: 'warning',
      exhausted: 'error',
      expired: 'error',
    };
    return colors[status] || 'default';
  },

  // Get status color for payment status
  getPaymentStatusColor: (status) => {
    const colors = {
      pending: 'warning',
      partial: 'info',
      paid: 'success',
    };
    return colors[status] || 'default';
  },
};

export default purchaseService;
