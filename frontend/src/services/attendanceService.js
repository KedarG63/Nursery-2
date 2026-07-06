/**
 * Attendance Service — per-day attendance for daily-wage workers.
 */

import api from '../utils/api';

export const getAttendance = async (params = {}) => {
  try { return (await api.get('/api/attendance', { params })).data; }
  catch (error) { throw error.response?.data || error; }
};

export const markAttendance = async (data) => {
  try { return (await api.post('/api/attendance', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const bulkMarkAttendance = async (data) => {
  try { return (await api.post('/api/attendance/bulk', data)).data; }
  catch (error) { throw error.response?.data || error; }
};

export const deleteAttendance = async (id) => {
  try { return (await api.delete(`/api/attendance/${id}`)).data; }
  catch (error) { throw error.response?.data || error; }
};

export default { getAttendance, markAttendance, bulkMarkAttendance, deleteAttendance };
