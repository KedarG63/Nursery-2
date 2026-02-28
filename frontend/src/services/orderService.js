import api from '../utils/api';

/**
 * Get list of orders with filters and pagination
 * @param {object} params - Query parameters
 * @returns {Promise} Order list data
 */
export const getOrders = async (params = {}) => {
  try {
    const response = await api.get('/api/orders', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get single order by ID
 * @param {string} id - Order ID
 * @returns {Promise} Order data
 */
export const getOrder = async (id) => {
  try {
    const response = await api.get(`/api/orders/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Create new order
 * @param {object} orderData - Order data
 * @returns {Promise} Created order data
 */
export const createOrder = async (orderData) => {
  try {
    const response = await api.post('/api/orders', orderData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Update order status
 * @param {string} id - Order ID
 * @param {object} statusData - Status update data
 * @returns {Promise} Updated order data
 */
export const updateOrderStatus = async (id, statusData) => {
  try {
    const response = await api.put(`/api/orders/${id}/status`, statusData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Allocate lots to order
 * @param {string} id - Order ID
 * @param {object} allocationData - Lot allocation data
 * @returns {Promise} Allocation result
 */
export const allocateLots = async (id, allocationData) => {
  try {
    const response = await api.post(`/api/orders/${id}/allocate`, allocationData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get order status timeline
 * @param {string} id - Order ID
 * @returns {Promise} Timeline data
 */
export const getOrderTimeline = async (id) => {
  try {
    const response = await api.get(`/api/orders/${id}/timeline`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Check lot availability for order items with delivery date validation (Phase 21)
 * @param {array} items - Order items to check
 * @param {string} deliveryDate - Desired delivery date (YYYY-MM-DD)
 * @returns {Promise} Availability data with lot maturity info
 */
export const checkAvailability = async (items, deliveryDate = null) => {
  try {
    const payload = { items };
    if (deliveryDate) {
      payload.delivery_date = deliveryDate;
    }

    const response = await api.post('/api/orders/check-availability', payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  allocateLots,
  getOrderTimeline,
  checkAvailability
};
