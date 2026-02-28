/**
 * Report Service
 * API calls for analytics and reporting
 */

import api from '../utils/api';

/**
 * Get sales analytics report
 * @param {Object} params - start_date, end_date, group_by (day|week|month)
 * @returns {Promise} Sales analytics data
 */
export const getSalesReport = async (params = {}) => {
  const response = await api.get('/api/reports/sales', { params });
  return response.data;
};

/**
 * Get inventory analytics report
 * @param {Object} params - product, location, status
 * @returns {Promise} Inventory analytics data
 */
export const getInventoryReport = async (params = {}) => {
  const response = await api.get('/api/reports/inventory', { params });
  return response.data;
};

/**
 * Get delivery performance analytics
 * @param {Object} params - start_date, end_date, driver_id, vehicle_id
 * @returns {Promise} Delivery analytics data
 */
export const getDeliveryReport = async (params = {}) => {
  const response = await api.get('/api/reports/delivery', { params });
  return response.data;
};

/**
 * Export sales report to Excel/PDF
 * @param {Object} params - Report parameters and format
 * @returns {Promise} File blob
 */
export const exportSalesReport = async (params = {}) => {
  const response = await api.get('/api/reports/sales/export', {
    params,
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Export inventory report to Excel
 * @param {Object} params - Report parameters
 * @returns {Promise} File blob
 */
export const exportInventoryReport = async (params = {}) => {
  const response = await api.get('/api/reports/inventory/export', {
    params,
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Export delivery report
 * @param {Object} params - Report parameters
 * @returns {Promise} File blob
 */
export const exportDeliveryReport = async (params = {}) => {
  const response = await api.get('/api/reports/delivery/export', {
    params,
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Get financial report (Phase 21)
 * @param {Object} params - start_date, end_date, group_by
 * @returns {Promise} Financial report data
 */
export const getFinancialReport = async (params = {}) => {
  const response = await api.get('/api/reports/financial', { params });
  return response.data;
};

export default {
  getSalesReport,
  getInventoryReport,
  getDeliveryReport,
  exportSalesReport,
  exportInventoryReport,
  exportDeliveryReport,
  getFinancialReport,
};
