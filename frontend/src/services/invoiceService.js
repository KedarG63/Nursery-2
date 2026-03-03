/**
 * Invoice Service
 * Phase 23: Billing & Accounting
 */

import api from '../utils/api';

export const getInvoices = async (params = {}) => {
  try {
    const response = await api.get('/api/invoices', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getInvoice = async (id) => {
  try {
    const response = await api.get(`/api/invoices/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createInvoice = async (data) => {
  try {
    const response = await api.post('/api/invoices', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateInvoice = async (id, data) => {
  try {
    const response = await api.put(`/api/invoices/${id}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const issueInvoice = async (id) => {
  try {
    const response = await api.post(`/api/invoices/${id}/issue`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const voidInvoice = async (id) => {
  try {
    const response = await api.post(`/api/invoices/${id}/void`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const applyPayment = async (id, paymentData) => {
  try {
    const response = await api.post(`/api/invoices/${id}/payments`, paymentData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const removePayment = async (invoiceId, paymentId) => {
  try {
    const response = await api.delete(`/api/invoices/${invoiceId}/payments/${paymentId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Opens the invoice PDF/HTML in a new browser tab for printing.
 */
export const openInvoicePDF = (id) => {
  const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('token');
  // Build URL and open in new tab; auth is via token in header (handled by axios interceptors).
  // Since window.open doesn't send headers, we fetch as blob and open.
  return api
    .get(`/api/invoices/${id}/pdf`, { responseType: 'text' })
    .then((response) => {
      const blob = new Blob([response.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, '_blank');
      // Clean up object URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return tab;
    });
};

export const getAgingReport = async (params = {}) => {
  try {
    const response = await api.get('/api/invoices/reports/aging', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getInvoiceRegister = async (params = {}) => {
  try {
    const response = await api.get('/api/invoices/reports/register', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  issueInvoice,
  voidInvoice,
  applyPayment,
  removePayment,
  openInvoicePDF,
  getAgingReport,
  getInvoiceRegister,
};
