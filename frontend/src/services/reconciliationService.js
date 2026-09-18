import api from '../utils/api';

const reconciliationService = {
  /**
   * Recomputes every derived total from the underlying rows and compares it
   * against what is stored. Read-only — safe to run at any time.
   */
  getReturnsReconciliation: async () => {
    const response = await api.get('/api/reconciliation/returns');
    return response.data;
  },
};

export default reconciliationService;
