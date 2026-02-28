import api from '../utils/api';

const vehicleService = {
  // Create new vehicle
  createVehicle: async (data) => {
    const response = await api.post('/api/vehicles', data);
    return response.data;
  },

  // Get all vehicles with filters
  getVehicles: async (params = {}) => {
    const response = await api.get('/api/vehicles', { params });
    return response.data;
  },

  // Get vehicle by ID
  getVehicleById: async (id) => {
    const response = await api.get(`/api/vehicles/${id}`);
    return response.data;
  },

  // Update vehicle
  updateVehicle: async (id, data) => {
    const response = await api.put(`/api/vehicles/${id}`, data);
    return response.data;
  },

  // Delete vehicle (soft delete)
  deleteVehicle: async (id) => {
    const response = await api.delete(`/api/vehicles/${id}`);
    return response.data;
  },

  // Get vehicle maintenance history
  getMaintenanceHistory: async (id) => {
    const response = await api.get(`/api/vehicles/${id}/maintenance`);
    return response.data;
  },

  // Get vehicle location history
  getLocationHistory: async (id, params = {}) => {
    const response = await api.get(`/api/vehicles/${id}/location-history`, { params });
    return response.data;
  }
};

export default vehicleService;
