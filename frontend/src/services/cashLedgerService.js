/**
 * Cash Ledger Service — Tally-style cash book for Cash-in-Hand.
 */

import api from '../utils/api';

export const getCashAccounts = async () => {
  try {
    const response = await api.get('/api/cash-accounts');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const upsertCashAccount = async (data, id = null) => {
  try {
    const response = id
      ? await api.put(`/api/cash-accounts/${id}`, data)
      : await api.post('/api/cash-accounts', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const setOpeningBalance = async (accountId, data) => {
  try {
    const response = await api.post(`/api/cash-accounts/${accountId}/opening-balance`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getLedger = async (accountId, params = {}) => {
  try {
    const response = await api.get(`/api/cash-accounts/${accountId}/ledger`, { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const addManualEntry = async (accountId, data) => {
  try {
    const response = await api.post(`/api/cash-accounts/${accountId}/entries`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const editManualEntry = async (accountId, entryId, data) => {
  try {
    const response = await api.put(`/api/cash-accounts/${accountId}/entries/${entryId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteManualEntry = async (accountId, entryId) => {
  try {
    const response = await api.delete(`/api/cash-accounts/${accountId}/entries/${entryId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getMonthlySummary = async (accountId, financial_year) => {
  try {
    const response = await api.get(`/api/cash-accounts/${accountId}/summary`, {
      params: { financial_year },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getCashAccounts,
  upsertCashAccount,
  setOpeningBalance,
  getLedger,
  addManualEntry,
  editManualEntry,
  deleteManualEntry,
  getMonthlySummary,
};
