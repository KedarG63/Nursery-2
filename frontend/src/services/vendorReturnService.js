import api from '../utils/api';

const vendorReturnService = {
  listReturns: async (params = {}) => {
    const response = await api.get('/api/vendor-returns', { params });
    return response.data;
  },

  getReturn: async (id) => {
    const response = await api.get(`/api/vendor-returns/${id}`);
    return response.data;
  },

  createReturn: async (data) => {
    const response = await api.post('/api/vendor-returns', data);
    return response.data;
  },

  updateReturn: async (id, data) => {
    const response = await api.put(`/api/vendor-returns/${id}`, data);
    return response.data;
  },

  deleteReturn: async (id) => {
    const response = await api.delete(`/api/vendor-returns/${id}`);
    return response.data;
  },

  submitReturn: async (id) => {
    const response = await api.post(`/api/vendor-returns/${id}/submit`);
    return response.data;
  },

  acceptReturn: async (id) => {
    const response = await api.post(`/api/vendor-returns/${id}/accept`);
    return response.data;
  },

  rejectReturn: async (id, notes) => {
    const response = await api.post(`/api/vendor-returns/${id}/reject`, { notes });
    return response.data;
  },

  applyCredit: async (id, targetPurchaseId, amountToApply) => {
    const response = await api.post(`/api/vendor-returns/${id}/apply-credit`, {
      target_purchase_id: targetPurchaseId,
      amount_to_apply: amountToApply,
    });
    return response.data;
  },

  getAvailableCredits: async (vendorId) => {
    const response = await api.get(`/api/vendor-returns/available-credits/${vendorId}`);
    return response.data;
  },

  // ── Display helpers ────────────────────────────────────────────────────────
  getStatusColor: (status) => {
    const map = {
      draft:     'default',
      submitted: 'info',
      accepted:  'success',
      rejected:  'error',
      credited:  'primary',
    };
    return map[status] || 'default';
  },

  getStatusLabel: (status) => {
    const map = {
      draft:     'Draft',
      submitted: 'Submitted',
      accepted:  'Accepted',
      rejected:  'Rejected',
      credited:  'Credited',
    };
    return map[status] || status;
  },
};

export default vendorReturnService;
