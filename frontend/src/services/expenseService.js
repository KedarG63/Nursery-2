/**
 * Expense Service — daily business expenses with cash/bank ledger posting.
 */

import api from '../utils/api';

export const getExpenses = async (params = {}) => {
  try {
    const response = await api.get('/api/expenses', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getExpenseSummary = async (params = {}) => {
  try {
    const response = await api.get('/api/expenses/summary', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createExpense = async (data) => {
  try {
    const response = await api.post('/api/expenses', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateExpense = async (id, data) => {
  try {
    const response = await api.put(`/api/expenses/${id}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteExpense = async (id) => {
  try {
    const response = await api.delete(`/api/expenses/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getCategories = async (params = {}) => {
  try {
    const response = await api.get('/api/expenses/categories', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createCategory = async (data) => {
  try {
    const response = await api.post('/api/expenses/categories', data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateCategory = async (id, data) => {
  try {
    const response = await api.put(`/api/expenses/categories/${id}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export default {
  getExpenses,
  getExpenseSummary,
  createExpense,
  updateExpense,
  deleteExpense,
  getCategories,
  createCategory,
  updateCategory,
};
