/**
 * Vendor Payment Service — one payment settling many seed / supplies bills.
 */

import api from '../utils/api';

const unwrap = async (promise) => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getPayableVendors = () => unwrap(api.get('/api/vendor-payments/vendors'));

export const getOpenBills = (vendorId) =>
  unwrap(api.get(`/api/vendor-payments/vendors/${vendorId}/open-bills`));

export const getVendorPayments = (params = {}) => unwrap(api.get('/api/vendor-payments', { params }));

export const getVendorPayment = (id) => unwrap(api.get(`/api/vendor-payments/${id}`));

export const createVendorPayment = (data) => unwrap(api.post('/api/vendor-payments', data));

export const addAllocations = (id, allocations) =>
  unwrap(api.post(`/api/vendor-payments/${id}/allocations`, { allocations }));

export const removeAllocation = (id, billType, allocationId) =>
  unwrap(api.delete(`/api/vendor-payments/${id}/allocations/${billType}/${allocationId}`));

export const voidVendorPayment = (id) => unwrap(api.delete(`/api/vendor-payments/${id}`));

export default {
  getPayableVendors,
  getOpenBills,
  getVendorPayments,
  getVendorPayment,
  createVendorPayment,
  addAllocations,
  removeAllocation,
  voidVendorPayment,
};
