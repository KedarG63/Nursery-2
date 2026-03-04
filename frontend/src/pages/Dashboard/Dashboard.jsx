import { useEffect, useState } from 'react';
import { Grid, Typography, Box, CircularProgress, Alert, Card, CardActionArea, CardContent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';

import KPICard from '../../components/Dashboard/KPICard';
import RecentOrders from '../../components/Dashboard/RecentOrders';
import QuickActions from '../../components/Dashboard/QuickActions';
import dashboardService from '../../services/dashboardService';
import useAuth from '../../hooks/useAuth';

const REPORT_LINKS = [
  { label: 'Sales Report',    icon: AssessmentIcon,    path: '/reports',                    color: '#1976d2' },
  { label: 'AR Aging',        icon: AccountBalanceIcon, path: '/billing/reports/ar-aging',  color: '#388e3c' },
  { label: 'AP Aging',        icon: PaymentsIcon,       path: '/billing/reports/ap-aging',  color: '#f57c00' },
  { label: 'Invoices',        icon: RequestQuoteIcon,   path: '/billing/invoices',           color: '#7b1fa2' },
];

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
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

      const [overviewResponse, ordersData] = await Promise.all([
        dashboardService.getOverview(),
        dashboardService.getRecentOrders(5),
      ]);

      const { data } = overviewResponse;
      setKpis({
        ordersToday: data.kpis?.activeOrders || 0,
        readyLots: data.kpis?.readyLots || 0,
        pendingDeliveries: data.kpis?.pendingDeliveries || 0,
        revenueThisMonth: data.kpis?.monthlyRevenue || 0,
      });

      setRecentOrders(ordersData.orders || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      try {
        const [kpisData, ordersData] = await Promise.all([
          dashboardService.getKPIs(),
          dashboardService.getRecentOrders(5),
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
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

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title={t('dashboard.ordersToday')} value={kpis.ordersToday} icon={ShoppingCartIcon} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title={t('dashboard.readyLots')} value={kpis.readyLots} icon={InventoryIcon} color="secondary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title={t('dashboard.pendingDeliveries')} value={kpis.pendingDeliveries} icon={LocalShippingIcon} color="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard title={t('dashboard.revenueThisMonth')} value={kpis.revenueThisMonth} icon={CurrencyRupeeIcon} color="success" format="currency" />
        </Grid>
      </Grid>

      {/* Recent Orders and Quick Actions */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={8}>
          <RecentOrders orders={recentOrders} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <QuickActions />
        </Grid>
      </Grid>

      {/* Reports Section */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Reports</Typography>
        <Grid container spacing={2}>
          {REPORT_LINKS.map((r) => {
            const Icon = r.icon;
            return (
              <Grid item xs={6} sm={3} key={r.path}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardActionArea onClick={() => navigate(r.path)} sx={{ p: 2 }}>
                    <CardContent sx={{ p: '0 !important', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ bgcolor: r.color + '18', borderRadius: 1.5, p: 1, display: 'flex' }}>
                        <Icon sx={{ color: r.color, fontSize: 22 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={600} color="text.primary">
                        {r.label}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
};

export default Dashboard;
