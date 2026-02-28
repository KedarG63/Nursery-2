import api from '../utils/api';

const vendorService = {
  // Get all vendors with filters and pagination
  getAllVendors: async (params = {}) => {
    // Convert page to offset for backend
    const requestParams = { ...params };
    if (requestParams.page) {
      const page = parseInt(requestParams.page) || 1;
      const limit = parseInt(requestParams.limit) || 20;
      requestParams.offset = (page - 1) * limit;
      delete requestParams.page;
    }
    const response = await api.get('/api/vendors', { params: requestParams });
    // Convert offset-based pagination to page-based for frontend
    if (response.data.pagination) {
      const { offset, limit, total } = response.data.pagination;
      response.data.pagination.totalPages = Math.ceil(total / limit);
      response.data.pagination.currentPage = Math.floor(offset / limit) + 1;
    }
    return response.data;
  },

  // Get single vendor by ID
  getVendorById: async (id) => {
    const response = await api.get(`/api/vendors/${id}`);
    return response.data;
  },

  // Create new vendor
  createVendor: async (vendorData) => {
    const response = await api.post('/api/vendors', vendorData);
    return response.data;
  },

  // Update vendor
  updateVendor: async (id, vendorData) => {
    const response = await api.put(`/api/vendors/${id}`, vendorData);
    return response.data;
  },

  // Delete vendor (soft delete)
  deleteVendor: async (id) => {
    const response = await api.delete(`/api/vendors/${id}`);
    return response.data;
  },

  // Get vendor status types
  getStatuses: () => {
    return ['active', 'inactive', 'blacklisted'];
  },

  // Get display names for vendor status
  getStatusDisplay: (status) => {
    const displayNames = {
      active: 'Active',
      inactive: 'Inactive',
      blacklisted: 'Blacklisted',
    };
    return displayNames[status] || status;
  },

  // Get status color for vendor status
  getStatusColor: (status) => {
    const colors = {
      active: 'success',
      inactive: 'default',
      blacklisted: 'error',
    };
    return colors[status] || 'default';
  },
};

export default vendorService;
