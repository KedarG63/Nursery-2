/**
 * Material / Supplies Purchase Service
 *
 * Vendor-payables register for non-seed supplies (cocopeat, fertilizer, …).
 * Purchases are payables; money moves only when payment tranches are recorded,
 * each posting a debit to the chosen cash/bank ledger.
 */

import api from '../utils/api';

const materialPurchaseService = {
  getAll: async (params = {}) => {
    const response = await api.get('/api/material-purchases', { params });
    return response.data;
  },

  getSummary: async (params = {}) => {
    const response = await api.get('/api/material-purchases/summary', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/api/material-purchases/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/api/material-purchases', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/api/material-purchases/${id}`, data);
    return response.data;
  },

  remove: async (id) => {
    const response = await api.delete(`/api/material-purchases/${id}`);
    return response.data;
  },

  addPayment: async (id, data) => {
    const response = await api.post(`/api/material-purchases/${id}/payments`, data);
    return response.data;
  },

  deletePayment: async (id, paymentId) => {
    const response = await api.delete(`/api/material-purchases/${id}/payments/${paymentId}`);
    return response.data;
  },

  getPaymentStatuses: () => ['pending', 'partial', 'paid'],

  getPaymentStatusDisplay: (status) => ({
    pending: 'Pending',
    partial: 'Partial',
    paid: 'Paid',
  }[status] || status),

  getPaymentStatusColor: (status) => ({
    pending: 'warning',
    partial: 'info',
    paid: 'success',
  }[status] || 'default'),
};

export default materialPurchaseService;
