/**
 * Fund Transfer Service — Cash -> Bank deposits.
 */

import api from '../utils/api';

export const getTransfers = async (params = {}) => {
  try {
    const response = await api.get('/api/fund-transfers', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createTransfer = async (data) => {
  try {
    const response = await api.post('/api/fund-transfers', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteTransfer = async (id) => {
  try {
    const response = await api.delete(`/api/fund-transfers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default { getTransfers, createTransfer, deleteTransfer };
