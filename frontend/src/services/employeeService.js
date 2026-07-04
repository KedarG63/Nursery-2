/**
 * Employee Service — staff master.
 */

import api from '../utils/api';

export const getEmployees = async (params = {}) => {
  try { return (await api.get('/api/employees', { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const getEmployee = async (id) => {
  try { return (await api.get(`/api/employees/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const createEmployee = async (data) => {
  try { return (await api.post('/api/employees', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const updateEmployee = async (id, data) => {
  try { return (await api.put(`/api/employees/${id}`, data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const deleteEmployee = async (id) => {
  try { return (await api.delete(`/api/employees/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export default { getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee };
