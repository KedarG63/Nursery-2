/**
 * Party 360° Summary Service — windowed (year/month/week) aggregates for a
 * specific customer, vendor, or employee.
 */

import api from '../utils/api';

export const getCustomerSummary = async (id, params = {}) => {
  try { return (await api.get(`/api/customers/${id}/summary`, { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const getVendorSummary = async (id, params = {}) => {
  try { return (await api.get(`/api/vendors/${id}/summary`, { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const getEmployeeSummary = async (id, params = {}) => {
  try { return (await api.get(`/api/employees/${id}/summary`, { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export default { getCustomerSummary, getVendorSummary, getEmployeeSummary };
