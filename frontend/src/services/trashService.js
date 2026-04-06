import api from './api';

const trashService = {
  listTrash: (params = {}) => api.get('/api/trash', { params }).then((r) => r.data),
  getCount: () => api.get('/api/trash/count').then((r) => r.data),
  restoreLot: (id) => api.post(`/api/trash/lots/${id}/restore`).then((r) => r.data),
  restoreOrder: (id) => api.post(`/api/trash/orders/${id}/restore`).then((r) => r.data),
  restoreCustomer: (id) => api.post(`/api/trash/customers/${id}/restore`).then((r) => r.data),
  restorePurchase: (id) => api.post(`/api/trash/purchases/${id}/restore`).then((r) => r.data),
  permanentDelete: (type, id) => api.delete(`/api/trash/${type}/${id}/permanent`).then((r) => r.data),
};

export default trashService;
