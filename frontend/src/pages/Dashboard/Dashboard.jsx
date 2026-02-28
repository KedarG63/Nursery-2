import { useEffect, useState } from 'react';
import { Grid, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

import KPICard from '../../components/Dashboard/KPICard';
import RecentOrders from '../../components/Dashboard/RecentOrders';
import QuickActions from '../../components/Dashboard/QuickActions';
import dashboardService from '../../services/dashboardService';
import useAuth from '../../hooks/useAuth';

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kpis, setKpis] = useState({
    ordersToday: 0,
    readyLots: 0,
    pendingDeliveries: 0,
    revenueThisMonth: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use new overview endpoint (Phase 21)
      const response = await dashboardService.getOverview();
      const { data } = response;

      // Extract KPIs
      setKpis({
        ordersToday: data.kpis?.activeOrders || 0,
        readyLots: data.kpis?.readyLots || 0,
        pendingDeliveries: data.kpis?.pendingDeliveries || 0,
        revenueThisMonth: data.kpis?.monthlyRevenue || 0,
      });

      // Extract recent orders from order insights
      setRecentOrders(data.orderInsights?.readinessTimeline?.slice(0, 10) || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      // Fallback to legacy API if new endpoint fails
      try {
        const [kpisData, ordersData] = await Promise.all([
          dashboardService.getKPIs(),
          dashboardService.getRecentOrders(10),
        ]);
        setKpis(kpisData);
        setRecentOrders(ordersData.orders || []);
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
        setError('Failed to load dashboard data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          {t('dashboard.title')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('common.welcome')}, {user?.fullName || user?.email || 'User'}!
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title={t('dashboard.ordersToday')}
            value={kpis.ordersToday}
            icon={ShoppingCartIcon}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title={t('dashboard.readyLots')}
            value={kpis.readyLots}
            icon={InventoryIcon}
            color="secondary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title={t('dashboard.pendingDeliveries')}
            value={kpis.pendingDeliveries}
            icon={LocalShippingIcon}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title={t('dashboard.revenueThisMonth')}
            value={kpis.revenueThisMonth}
            icon={AttachMoneyIcon}
            color="success"
            format="currency"
          />
        </Grid>
      </Grid>

      {/* Recent Orders and Quick Actions */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <RecentOrders orders={recentOrders} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <QuickActions />
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
