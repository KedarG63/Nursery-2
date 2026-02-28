import api from '../utils/api';

const deliveryService = {
  // Route Management APIs
  createRoute: async (data) => {
    const response = await api.post('/api/routes', data);
    return response.data;
  },

  getRoutes: async (params = {}) => {
    const response = await api.get('/api/routes', { params });
    return response.data;
  },

  getRouteById: async (id) => {
    const response = await api.get(`/api/routes/${id}`);
    return response.data;
  },

  assignRoute: async (id, data) => {
    const response = await api.put(`/api/routes/${id}/assign`, data);
    return response.data;
  },

  startRoute: async (id, data = {}) => {
    const response = await api.put(`/api/routes/${id}/start`, data);
    return response.data;
  },

  getRouteProgress: async (id) => {
    const response = await api.get(`/api/routes/${id}/progress`);
    return response.data;
  },

  // Delivery Summary and Available Orders
  getDeliverySummary: async () => {
    const response = await api.get('/api/delivery/summary');
    return response.data;
  },

  getAvailableOrders: async (deliveryDate = null) => {
    const params = deliveryDate ? { delivery_date: deliveryDate } : {};
    const response = await api.get('/api/delivery/available-orders', { params });
    return response.data;
  }
};

export default deliveryService;
