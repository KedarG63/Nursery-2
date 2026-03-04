import api from '../utils/api';

const userService = {
  /**
   * Get all users
   */
  getUsers: async () => {
    const response = await api.get('/api/users');
    return response.data;
  },

  /**
   * Get users by role
   */
  getUsersByRole: async (role) => {
    const response = await api.get(`/api/users/role/${role}`);
    return response.data;
  },

  createUser: async ({ email, password, full_name, phone, role }) => {
    const response = await api.post('/api/users', { email, password, full_name, phone, role });
    return response.data;
  },

  updateUser: async (id, { full_name, phone }) => {
    const response = await api.put(`/api/users/${id}`, { full_name, phone });
    return response.data;
  },

  updateRole: async (id, role) => {
    const response = await api.put(`/api/users/${id}/role`, { role });
    return response.data;
  },

  resetPassword: async (id, newPassword) => {
    const response = await api.put(`/api/users/${id}/reset-password`, { new_password: newPassword });
    return response.data;
  },

  toggleStatus: async (id, status) => {
    const response = await api.put(`/api/users/${id}/status`, { status });
    return response.data;
  },

  // Legacy — kept for DriversManagement page compatibility
  createDriver: async (driverData) => {
    const response = await api.post('/api/users', {
      email: driverData.email,
      password: driverData.password,
      full_name: driverData.fullName,
      phone: driverData.phone,
      role: 'Delivery',
      license_number: driverData.licenseNumber,
      license_expiry: driverData.licenseExpiry
    });
    return response.data;
  },

  /**
   * Update driver
   */
  updateDriver: async (driverId, driverData) => {
    const response = await api.put(`/api/users/${driverId}`, {
      full_name: driverData.fullName,
      phone: driverData.phone,
      license_number: driverData.licenseNumber,
      license_expiry: driverData.licenseExpiry
    });
    return response.data;
  },

  /**
   * Delete user
   */
  deleteUser: async (userId) => {
    const response = await api.delete(`/api/users/${userId}`);
    return response.data;
  },

  /**
   * Get user profile
   */
  getProfile: async () => {
    const response = await api.get('/api/auth/profile');
    return response.data;
  }
};

export default userService;
