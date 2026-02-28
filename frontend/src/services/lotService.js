import api from '../utils/api';

const lotService = {
  // Get all lots with filters
  getAllLots: async (params = {}) => {
    const response = await api.get('/api/lots', { params });
    return response.data;
  },

  // Get single lot by ID
  getLotById: async (id) => {
    const response = await api.get(`/api/lots/${id}`);
    return response.data;
  },

  // Get lots created from a specific seed purchase
  getLotsByPurchase: async (purchaseId) => {
    const response = await api.get(`/api/lots/by-purchase/${purchaseId}`);
    return response.data;
  },

  // Create new lot
  createLot: async (lotData) => {
    const response = await api.post('/api/lots', lotData);
    return response.data;
  },

  // Update lot stage
  updateLotStage: async (id, newStage, reason = '') => {
    const response = await api.put(`/api/lots/${id}/stage`, { new_stage: newStage, reason });
    return response.data;
  },

  // Update lot location
  updateLotLocation: async (id, newLocation, reason = '') => {
    const response = await api.put(`/api/lots/${id}/location`, { new_location: newLocation, reason });
    return response.data;
  },

  // Get QR code URL for lot
  getQRCodeUrl: (id) => {
    const token = localStorage.getItem('token');
    return `${api.defaults.baseURL}/api/lots/${id}/qr?token=${token}`;
  },

  // Scan lot by QR code
  scanLot: async (qrData) => {
    const response = await api.post('/api/lots/scan', { qr_data: qrData });
    return response.data;
  },

  // Delete lot (soft delete)
  deleteLot: async (id) => {
    const response = await api.delete(`/api/lots/${id}`);
    return response.data;
  },

  // Get lot growth status (Phase 21)
  getLotGrowthStatus: async (id) => {
    const response = await api.get(`/api/lots/${id}/growth-status`);
    return response.data;
  },

  // Get inventory summary (Phase 21)
  getInventorySummary: async (params = {}) => {
    const response = await api.get('/api/inventory/summary', { params });
    return response.data;
  },

  // Get product inventory breakdown (Phase 21)
  getProductBreakdown: async (productId) => {
    const response = await api.get(`/api/inventory/product/${productId}/breakdown`);
    return response.data;
  },

  // Get growth stages
  getStages: () => {
    return ['seed', 'germination', 'seedling', 'transplant', 'ready', 'sold'];
  },

  // Get valid stage transitions
  getValidTransitions: (currentStage) => {
    const transitions = {
      seed: ['germination'],
      germination: ['seedling'],
      seedling: ['transplant'],
      transplant: ['ready'],
      ready: ['sold'],
      sold: [],
    };
    return transitions[currentStage] || [];
  },

  // Calculate days to ready
  calculateDaysToReady: (expectedReadyDate) => {
    if (!expectedReadyDate) return null;
    const today = new Date();
    const readyDate = new Date(expectedReadyDate);
    const diffTime = readyDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  },

  // Get status color based on stage and ready date
  getStatusColor: (stage, expectedReadyDate) => {
    if (stage === 'ready') return 'success';
    if (stage === 'sold') return 'default';
    const daysToReady = lotService.calculateDaysToReady(expectedReadyDate);
    if (daysToReady === null) return 'info';
    if (daysToReady <= 7) return 'warning';
    return 'info';
  },
};

export default lotService;
