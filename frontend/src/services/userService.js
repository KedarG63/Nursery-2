import api from '../utils/api';

const userService = {
  /**
   * Get all users
   */
  getUsers: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  /**
   * Get users by role
   */
  getUsersByRole: async (role) => {
    const response = await api.get(`/users/role/${role}`);
    return response.data;
  },

  /**
   * Create a new driver
   */
  createDriver: async (driverData) => {
    const response = await api.post('/users', {
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
    const response = await api.put(`/users/${driverId}`, {
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
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },

  /**
   * Get user profile
   */
  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  }
};

export default userService;
