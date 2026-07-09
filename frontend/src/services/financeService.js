/**
 * Finance Service — read-only Finance Overview and Profit & Loss.
 */

import api from '../utils/api';

export const getFinanceOverview = async (params = {}) => {
  try {
    const response = await api.get('/api/finance/overview', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getProfitLoss = async (params = {}) => {
  try {
    const response = await api.get('/api/finance/profit-loss', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default { getFinanceOverview, getProfitLoss };
