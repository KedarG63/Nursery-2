import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  CircularProgress,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import PropTypes from 'prop-types';
import { getCustomerPurchaseHistory } from '../../services/customerService';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Purchase Summary Component
 * Shows a customer's spend: KPI cards, a 12-month bar chart, and a
 * this-year vs last-year comparison. Combines product + service orders.
 */
const PurchaseSummary = ({ customerId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await getCustomerPurchaseHistory(customerId);
        if (active) setData(response.data || null);
      } catch (error) {
        console.error('Error fetching purchase history:', error);
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (customerId) fetchHistory();
    return () => {
      active = false;
    };
  }, [customerId]);

  const compactCurrency = (value) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
      notation: 'compact',
    }).format(value || 0);

  // "YYYY-MM" -> "Mon" (e.g. "Jan")
  const formatMonthLabel = (period) => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString('en-US', { month: 'short' });
  };

  if (loading) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Purchase History
          </Typography>
          <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, monthly, yearly } = data;

  const currentYear = new Date().getFullYear();
  const thisYear = yearly.find((y) => y.year === currentYear) || { total: 0, order_count: 0 };
  const lastYear = yearly.find((y) => y.year === currentYear - 1) || { total: 0, order_count: 0 };

  const hasSpend = (summary?.order_count || 0) > 0;

  const kpis = [
    { label: 'Total Spent', value: formatCurrency(summary.total_spent), color: 'success.main' },
    { label: 'Orders', value: summary.order_count, color: 'text.primary' },
    { label: 'Avg Order Value', value: formatCurrency(summary.avg_order_value), color: 'text.primary' },
    {
      label: 'Last Order',
      value: summary.last_order_date ? formatDate(summary.last_order_date) : '—',
      color: 'text.primary',
    },
  ];

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Purchase History
        </Typography>

        {/* KPI cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {kpis.map((kpi) => (
            <Grid item xs={6} md={3} key={kpi.label}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    {kpi.label}
                  </Typography>
                  <Typography variant="h6" sx={{ color: kpi.color }}>
                    {kpi.value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {!hasSpend ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No purchases recorded yet for this customer.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* Monthly spend chart */}
            <Grid item xs={12} md={8}>
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                Monthly Spend (last 12 months)
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={formatMonthLabel} fontSize={12} />
                  <YAxis tickFormatter={compactCurrency} fontSize={12} width={60} />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'Spend']}
                    labelFormatter={(label) => {
                      const [year, month] = label.split('-');
                      const date = new Date(Number(year), Number(month) - 1, 1);
                      return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    }}
                  />
                  <Bar dataKey="total" fill="#2e7d32" name="Spend" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Grid>

            {/* This year vs last year */}
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                Year Comparison
              </Typography>
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    This Year ({currentYear})
                  </Typography>
                  <Typography variant="h5" color="primary.main">
                    {formatCurrency(thisYear.total)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {thisYear.order_count} order{thisYear.order_count !== 1 ? 's' : ''}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    Last Year ({currentYear - 1})
                  </Typography>
                  <Typography variant="h5">{formatCurrency(lastYear.total)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {lastYear.order_count} order{lastYear.order_count !== 1 ? 's' : ''}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
};

PurchaseSummary.propTypes = {
  customerId: PropTypes.string.isRequired,
};

export default PurchaseSummary;
