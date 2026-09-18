import api from '../utils/api';

/**
 * Customer Returns — seedlings/saplings brought back by a customer.
 *
 * The money model, because the UI has to explain it to staff:
 *   accepting a return computes its value, then splits it automatically —
 *     order_offset = min(value, what the customer still owes)   ← automatic
 *     owed_back    = value - order_offset                       ← explicit choice
 *   Only owed_back is settled by a person, as Refund or Store credit.
 */
const customerReturnService = {
  // ── Reads ──────────────────────────────────────────────────────────────────
  getReturnable: async (orderId) => {
    const response = await api.get(`/api/customer-returns/order/${orderId}/returnable`);
    return response.data;
  },

  listReturns: async (params = {}) => {
    const response = await api.get('/api/customer-returns', { params });
    return response.data;
  },

  getReturn: async (id) => {
    const response = await api.get(`/api/customer-returns/${id}`);
    return response.data;
  },

  getStoreCredit: async (customerId) => {
    const response = await api.get(`/api/customer-returns/store-credit/${customerId}`);
    return response.data;
  },

  // ── Writes ─────────────────────────────────────────────────────────────────
  createReturn: async (data) => {
    const response = await api.post('/api/customer-returns', data);
    return response.data;
  },

  /** Restocks, fixes the value, and posts the order offset — all at once. */
  acceptReturn: async (id) => {
    const response = await api.post(`/api/customer-returns/${id}/accept`);
    return response.data;
  },

  /** Money out to the customer. Requires an explicit cash or bank account. */
  recordRefund: async (id, payload) => {
    const response = await api.post(`/api/customer-returns/${id}/refund`, payload);
    return response.data;
  },

  /** Keeps the owed-back amount on account instead of paying it out. */
  issueStoreCredit: async (id, amount, notes) => {
    const response = await api.post(`/api/customer-returns/${id}/store-credit`, { amount, notes });
    return response.data;
  },

  /** Spends store credit against an order. Always explicit, never automatic. */
  applyStoreCredit: async (orderId, amount, notes) => {
    const response = await api.post('/api/customer-returns/store-credit/apply', {
      order_id: orderId,
      amount,
      notes,
    });
    return response.data;
  },

  cancelReturn: async (id) => {
    const response = await api.post(`/api/customer-returns/${id}/cancel`);
    return response.data;
  },

  // ── Display helpers ────────────────────────────────────────────────────────
  getStatusColor: (status) => ({
    draft: 'default',
    accepted: 'success',
    cancelled: 'error',
  }[status] || 'default'),

  getStatusLabel: (status) => ({
    draft: 'Draft',
    accepted: 'Accepted',
    cancelled: 'Cancelled',
  }[status] || status),
};

export default customerReturnService;
