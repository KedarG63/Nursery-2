import api from '../utils/api';

/**
 * Get list of customers with filters and pagination
 * @param {object} params - Query parameters (search, type, page, limit)
 * @returns {Promise} Customer list data
 */
export const getCustomers = async (params = {}) => {
  try {
    const response = await api.get('/api/customers', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get single customer by ID
 * @param {string} id - Customer ID
 * @returns {Promise} Customer data
 */
export const getCustomer = async (id) => {
  try {
    const response = await api.get(`/api/customers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Create new customer
 * @param {object} customerData - Customer data including addresses
 * @returns {Promise} Created customer data
 */
export const createCustomer = async (customerData) => {
  try {
    const response = await api.post('/api/customers', customerData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Update existing customer
 * @param {string} id - Customer ID
 * @param {object} customerData - Updated customer data
 * @returns {Promise} Updated customer data
 */
export const updateCustomer = async (id, customerData) => {
  try {
    const response = await api.put(`/api/customers/${id}`, customerData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Delete customer (soft delete)
 * @param {string} id - Customer ID
 * @returns {Promise} Delete confirmation
 */
export const deleteCustomer = async (id) => {
  try {
    const response = await api.delete(`/api/customers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Create customer address
 * @param {object} addressData - Address data with customer_id
 * @returns {Promise} Created address data
 */
export const createAddress = async (addressData) => {
  try {
    const response = await api.post('/api/customers/addresses', addressData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Update customer address
 * @param {string} id - Address ID
 * @param {object} addressData - Updated address data
 * @returns {Promise} Updated address data
 */
export const updateAddress = async (id, addressData) => {
  try {
    const response = await api.put(`/api/customers/addresses/${id}`, addressData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Delete customer address
 * @param {string} id - Address ID
 * @returns {Promise} Delete confirmation
 */
export const deleteAddress = async (id) => {
  try {
    const response = await api.delete(`/api/customers/addresses/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get customer credit information
 * @param {string} id - Customer ID
 * @returns {Promise} Credit data
 */
export const getCustomerCredit = async (id) => {
  try {
    const response = await api.get(`/api/customers/${id}/credit`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createAddress,
  updateAddress,
  deleteAddress,
  getCustomerCredit
};
