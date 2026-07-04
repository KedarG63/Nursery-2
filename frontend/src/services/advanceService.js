/**
 * Advance Service — salary/wage advances.
 */

import api from '../utils/api';

export const getAdvances = async (params = {}) => {
  try { return (await api.get('/api/advances', { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const createAdvance = async (data) => {
  try { return (await api.post('/api/advances', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const deleteAdvance = async (id) => {
  try { return (await api.delete(`/api/advances/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export default { getAdvances, createAdvance, deleteAdvance };
