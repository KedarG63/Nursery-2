import api from '../utils/api';

const dashboardService = {
  // Get comprehensive dashboard overview (NEW - Phase 21)
  getOverview: async () => {
    try {
      const response = await api.get('/api/dashboard/overview');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard overview:', error);
      throw error;
    }
  },

  // Get dashboard KPIs (Legacy - kept for backward compatibility)
  getKPIs: async () => {
    try {
      const response = await api.get('/api/dashboard/kpis');
      return response.data;
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      // Return mock data if API fails
      return {
        ordersToday: 0,
        readyLots: 0,
        pendingDeliveries: 0,
        revenueThisMonth: 0,
      };
    }
  },

  // Get recent orders (deprecated - use getOverview instead)
  getRecentOrders: async (limit = 10) => {
    try {
      const response = await api.get('/api/dashboard/recent-orders', { params: { limit } });
      return response.data;
    } catch (error) {
      console.error('Error fetching recent orders:', error);
      return { orders: [] };
    }
  },
};

export default dashboardService;
