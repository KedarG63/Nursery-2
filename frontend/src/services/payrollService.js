/**
 * Payroll Service — salary & daily-wage runs.
 */

import api from '../utils/api';

export const previewRun = async (data) => {
  try { return (await api.post('/api/payroll/runs/preview', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const getRuns = async (params = {}) => {
  try { return (await api.get('/api/payroll/runs', { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const getRun = async (id) => {
  try { return (await api.get(`/api/payroll/runs/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const createRun = async (data) => {
  try { return (await api.post('/api/payroll/runs', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const payRun = async (id, data) => {
  try { return (await api.post(`/api/payroll/runs/${id}/pay`, data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const deleteRun = async (id) => {
  try { return (await api.delete(`/api/payroll/runs/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export default { previewRun, getRuns, getRun, createRun, payRun, deleteRun };
