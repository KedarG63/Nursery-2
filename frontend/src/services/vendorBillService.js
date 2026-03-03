/**
 * Vendor Bill Service (Accounts Payable)
 * Phase 23: Billing & Accounting
 */

import api from '../utils/api';

export const getVendorBills = async (params = {}) => {
  try {
    const response = await api.get('/api/vendor-bills', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getVendorBill = async (id) => {
  try {
    const response = await api.get(`/api/vendor-bills/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateDueDate = async (id, due_date) => {
  try {
    const response = await api.put(`/api/vendor-bills/${id}/due-date`, { due_date });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const recordPayment = async (id, data) => {
  try {
    const response = await api.post(`/api/vendor-bills/${id}/payments`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getAgingReport = async (params = {}) => {
  try {
    const response = await api.get('/api/vendor-bills/reports/aging', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getVendorBills,
  getVendorBill,
  updateDueDate,
  recordPayment,
  getAgingReport,
};
