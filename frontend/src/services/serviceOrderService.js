import api from '../utils/api';

/**
 * Service Order API client
 * Feature: Service / Grow-Only orders (customer brings own seeds, flat service fee)
 */

/**
 * Get list of service orders with filters and pagination
 * @param {object} params - Query parameters (customer_id, status, search, page, limit)
 */
export const getServiceOrders = async (params = {}) => {
  try {
    const response = await api.get('/api/service-orders', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get a single service order by ID
 */
export const getServiceOrder = async (id) => {
  try {
    const response = await api.get(`/api/service-orders/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Create a new service order
 */
export const createServiceOrder = async (data) => {
  try {
    const response = await api.post('/api/service-orders', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Update service order details
 */
export const updateServiceOrder = async (id, data) => {
  try {
    const response = await api.put(`/api/service-orders/${id}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Update service order status
 */
export const updateServiceOrderStatus = async (id, status) => {
  try {
    const response = await api.put(`/api/service-orders/${id}/status`, { status });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Record a payment against a service order
 */
export const recordServiceOrderPayment = async (id, payment) => {
  try {
    const response = await api.post(`/api/service-orders/${id}/payments`, payment);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Delete (soft) a service order
 */
export const deleteServiceOrder = async (id) => {
  try {
    const response = await api.delete(`/api/service-orders/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getServiceOrders,
  getServiceOrder,
  createServiceOrder,
  updateServiceOrder,
  updateServiceOrderStatus,
  recordServiceOrderPayment,
  deleteServiceOrder,
};
