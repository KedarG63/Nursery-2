import { useEffect, useState } from 'react';
import {
  Grid,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Card,
  CardActionArea,
  CardContent,
  Button,
  Chip,
  Divider,
} from '@mui/material';
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
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import PaymentIcon from '@mui/icons-material/Payment';

import KPICard from '../../components/Dashboard/KPICard';
import dashboardService from '../../services/dashboardService';
import useAuth from '../../hooks/useAuth';

const KPI_CONFIG = [
  { key: 'ordersToday',       title: 'Active Orders',        icon: ShoppingCartIcon,    color: 'primary'   },
  { key: 'readyLots',         title: 'Ready Lots',           icon: InventoryIcon,       color: 'secondary' },
  { key: 'pendingDeliveries', title: 'Pending Deliveries',   icon: LocalShippingIcon,   color: 'info'      },
  { key: 'revenueThisMonth',  title: 'Revenue This Month',   icon: CurrencyRupeeIcon,   color: 'success',  format: 'currency' },
];

const QUICK_ACTIONS = [
  { id: 'create-order',   label: 'Create Order',   icon: AddShoppingCartIcon, color: '#2e7d32', bg: '#e8f5e9', path: '/orders/create',    roles: ['Admin', 'Manager', 'Sales']      },
  { id: 'new-purchase',   label: 'New Purchase',   icon: ShoppingBagIcon,     color: '#e65100', bg: '#fff3e0', path: '/purchases/list',   roles: ['Admin', 'Manager', 'Warehouse']  },
  { id: 'payments',       label: 'Payments',       icon: PaymentIcon,         color: '#1565c0', bg: '#e3f2fd', path: '/payments',          roles: ['Admin', 'Manager']               },
];

const REPORT_LINKS = [
  { label: 'Sales Report', icon: AssessmentIcon,    path: '/reports',                   color: '#1976d2', bg: '#e3f2fd' },
  { label: 'AR Aging',     icon: AccountBalanceIcon, path: '/billing/reports/ar-aging', color: '#388e3c', bg: '#e8f5e9' },
  { label: 'AP Aging',     icon: PaymentsIcon,       path: '/billing/reports/ap-aging', color: '#f57c00', bg: '#fff3e0' },
  { label: 'Invoices',     icon: RequestQuoteIcon,   path: '/billing/invoices',         color: '#7b1fa2', bg: '#f3e5f5' },
];

const STATUS_COLOR = {
  pending:    { label: 'Pending',    color: '#f59e0b', bg: '#fffbeb' },
  confirmed:  { label: 'Confirmed',  color: '#3b82f6', bg: '#eff6ff' },
  preparing:  { label: 'Preparing',  color: '#8b5cf6', bg: '#f5f3ff' },
  ready:      { label: 'Ready',      color: '#10b981', bg: '#ecfdf5' },
  dispatched: { label: 'Dispatched', color: '#06b6d4', bg: '#ecfeff' },
  delivered:  { label: 'Delivered',  color: '#22c55e', bg: '#f0fdf4' },
  cancelled:  { label: 'Cancelled',  color: '#ef4444', bg: '#fef2f2' },
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kpis, setKpis] = useState({ ordersToday: 0, readyLots: 0, pendingDeliveries: 0, revenueThisMonth: 0 });
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewResponse, ordersResponse] = await Promise.all([
        dashboardService.getOverview(),
        dashboardService.getRecentOrders(5),
      ]);

      const { data } = overviewResponse;
      setKpis({
        ordersToday:       data.kpis?.activeOrders       || 0,
        readyLots:         data.kpis?.readyLots          || 0,
        pendingDeliveries: data.kpis?.pendingDeliveries  || 0,
        revenueThisMonth:  data.kpis?.monthlyRevenue     || 0,
      });

      // Backend returns { success, data: [...rows] } with snake_case fields
      const rows = ordersResponse.data || [];
      setRecentOrders(rows.map(r => ({
        id:           r.id,
        orderNumber:  r.order_number,
        customerName: r.customer_name,
        orderDate:    r.order_date || r.created_at,
        totalAmount:  parseFloat(r.total_amount) || 0,
        status:       r.status,
      })));
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const visibleActions = QUICK_ACTIONS.filter(a =>
    user?.roles?.some(r => a.roles.includes(r))
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} color="text.primary">
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Welcome back, {user?.fullName || user?.email || 'User'}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {KPI_CONFIG.map(({ key, title, icon, color, format }) => (
          <Grid item xs={12} sm={6} lg={3} key={key}>
            <KPICard title={title} value={kpis[key]} icon={icon} color={color} format={format} />
          </Grid>
        ))}
      </Grid>

      {/* Quick Actions */}
      {visibleActions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Quick Actions
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <Grid item xs={12} sm={4} key={action.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      border: `1.5px solid ${action.color}30`,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      '&:hover': {
                        borderColor: action.color,
                        boxShadow: `0 4px 16px ${action.color}25`,
                        transform: 'translateY(-2px)',
                      },
                    }}
                    onClick={() => navigate(action.path)}
                  >
                    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '14px !important', px: 2.5 }}>
                      <Box sx={{ bgcolor: action.bg, borderRadius: 1.5, p: 1, display: 'flex', flexShrink: 0 }}>
                        <Icon sx={{ color: action.color, fontSize: 22 }} />
                      </Box>
                      <Typography variant="body1" fontWeight={600} color="text.primary">
                        {action.label}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Recent Orders */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Recent Orders
          </Typography>
          <Typography
            variant="body2"
            color="primary"
            sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate('/orders')}
          >
            View all →
          </Typography>
        </Box>
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          {recentOrders.length === 0 ? (
            <Box sx={{ py: 5, textAlign: 'center' }}>
              <Typography color="text.secondary" variant="body2">No recent orders</Typography>
            </Box>
          ) : (
            <Box>
              {/* Table header */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr',
                  px: 2.5,
                  py: 1,
                  bgcolor: 'grey.50',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {['Order #', 'Customer', 'Date', 'Amount', 'Status'].map(h => (
                  <Typography key={h} variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </Typography>
                ))}
              </Box>
              {recentOrders.map((order, idx) => {
                const sc = STATUS_COLOR[order.status?.toLowerCase()] || { label: order.status, color: '#6b7280', bg: '#f9fafb' };
                return (
                  <Box
                    key={order.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr',
                      px: 2.5,
                      py: 1.5,
                      cursor: 'pointer',
                      borderBottom: idx < recentOrders.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'grey.50' },
                    }}
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <Typography variant="body2" fontWeight={600} color="primary">
                      #{order.orderNumber || order.id?.slice(0, 8)}
                    </Typography>
                    <Typography variant="body2" color="text.primary" noWrap>
                      {order.customerName || 'N/A'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(order.totalAmount)}
                    </Typography>
                    <Box>
                      <Chip
                        label={sc.label}
                        size="small"
                        sx={{
                          bgcolor: sc.bg,
                          color: sc.color,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: 22,
                          border: `1px solid ${sc.color}40`,
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Card>
      </Box>

      {/* Reports */}
      <Box>
        <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
          Reports & Billing
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {REPORT_LINKS.map(r => {
            const Icon = r.icon;
            return (
              <Grid item xs={6} sm={3} key={r.path}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    border: `1.5px solid ${r.color}25`,
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    '&:hover': {
                      borderColor: r.color,
                      boxShadow: `0 4px 16px ${r.color}20`,
                      transform: 'translateY(-2px)',
                    },
                  }}
                  onClick={() => navigate(r.path)}
                >
                  <CardContent sx={{ p: '14px 16px !important', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ bgcolor: r.bg, borderRadius: 1.5, p: 1, display: 'flex', flexShrink: 0 }}>
                      <Icon sx={{ color: r.color, fontSize: 20 }} />
                    </Box>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                      {r.label}
                    </Typography>
                  </CardContent>
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
