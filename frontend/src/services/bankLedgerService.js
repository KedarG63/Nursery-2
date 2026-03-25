/**
 * Bank Ledger Service
 * Tally-style ledger for business bank accounts.
 */

import api from '../utils/api';

export const getBankAccounts = async () => {
  try {
    const response = await api.get('/api/bank-accounts');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const upsertBankAccount = async (data, id = null) => {
  try {
    const response = id
      ? await api.put(`/api/bank-accounts/${id}`, data)
      : await api.post('/api/bank-accounts', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const setOpeningBalance = async (accountId, data) => {
  try {
    const response = await api.post(`/api/bank-accounts/${accountId}/opening-balance`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getLedger = async (accountId, params = {}) => {
  try {
    const response = await api.get(`/api/bank-accounts/${accountId}/ledger`, { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const addManualEntry = async (accountId, data) => {
  try {
    const response = await api.post(`/api/bank-accounts/${accountId}/entries`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const editManualEntry = async (accountId, entryId, data) => {
  try {
    const response = await api.put(`/api/bank-accounts/${accountId}/entries/${entryId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteManualEntry = async (accountId, entryId) => {
  try {
    const response = await api.delete(`/api/bank-accounts/${accountId}/entries/${entryId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getMonthlySummary = async (accountId, financial_year) => {
  try {
    const response = await api.get(`/api/bank-accounts/${accountId}/summary`, {
      params: { financial_year },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const syncTransactions = async (accountId, options = {}) => {
  try {
    const response = await api.post(`/api/bank-accounts/${accountId}/sync`, options);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getBankAccounts,
  upsertBankAccount,
  setOpeningBalance,
  getLedger,
  addManualEntry,
  editManualEntry,
  deleteManualEntry,
  getMonthlySummary,
  syncTransactions,
};
