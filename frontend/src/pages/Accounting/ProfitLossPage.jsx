import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Alert, CircularProgress,
  Table, TableRow, TableCell, TableBody, TableContainer, Paper, Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { getProfitLoss } from '../../services/financeService';
import PeriodPicker, { periodRange } from '../../components/Accounting/PeriodPicker';
import { formatCurrency } from '../../utils/formatters';

const GREEN = '#2e7d32';
const RED = '#c62828';

// Statement row: label + amount, with variants for section headers and totals.
const Row = ({ label, amount, variant, color, indent }) => {
  const isHeader = variant === 'header';
  const isTotal = variant === 'total';
  return (
    <TableRow sx={isHeader ? { bgcolor: 'action.hover' } : {}}>
      <TableCell sx={{ pl: indent ? 5 : 2, border: 0, py: isHeader ? 1 : 0.75 }}>
        <Typography variant="body2" fontWeight={isHeader || isTotal ? 700 : 400}
          color={isHeader ? 'text.secondary' : 'text.primary'}
          sx={isHeader ? { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 } : {}}>
          {label}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ border: 0, py: isHeader ? 1 : 0.75 }}>
        {amount !== undefined && (
          <Typography variant="body2" fontWeight={isTotal ? 700 : 500} sx={color ? { color } : {}}>
            {formatCurrency(amount)}
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
};

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const ProfitLossPage = () => {
  const { t } = useTranslation();
  const [window_, setWindow] = useState(periodRange('this_month'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getProfitLoss(window_);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load profit & loss');
    } finally {
      setLoading(false);
    }
  }, [window_]);

  useEffect(() => { load(); }, [load]);

  const profitable = (data?.net_profit || 0) >= 0;
  const chartData = (data?.monthly || []).map((m) => ({ ...m, label: monthLabel(m.month_key) }));

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} mb={3} spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <TrendingUpIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('finance.plTitle', 'Profit & Loss')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('finance.plSub', 'Income minus purchases, expenses and payroll for the selected period')}
            </Typography>
          </Box>
        </Stack>
        <PeriodPicker value={window_} onChange={setWindow} />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>}

      {!loading && data && (
        <Grid container spacing={2}>
          {/* Headline */}
          <Grid item xs={12}>
            <Card elevation={2} sx={{ borderTop: `4px solid ${profitable ? GREEN : RED}` }}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} alignItems={{ sm: 'center' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {profitable ? t('finance.netProfit', 'Net Profit') : t('finance.netLoss', 'Net Loss')}
                      {' '}· {data.window.start} → {data.window.end}
                    </Typography>
                    <Typography variant="h3" fontWeight={800} sx={{ color: profitable ? GREEN : RED }}>
                      {formatCurrency(Math.abs(data.net_profit))}
                    </Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">{t('finance.totalIncome', 'Total Income')}</Typography>
                    <Typography variant="h6" fontWeight={700} sx={{ color: GREEN }}>{formatCurrency(data.income.total)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">{t('finance.totalCosts', 'Total Costs')}</Typography>
                    <Typography variant="h6" fontWeight={700} sx={{ color: RED }}>{formatCurrency(data.costs.total)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">{t('finance.margin', 'Margin')}</Typography>
                    <Typography variant="h6" fontWeight={700}>{data.margin_pct}%</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Statement */}
          <Grid item xs={12} md={chartData.length > 1 ? 6 : 8}>
            <TableContainer component={Paper} elevation={2}>
              <Table size="small">
                <TableBody>
                  <Row variant="header" label={t('finance.income', 'Income')} />
                  <Row label={t('finance.productSales', 'Plant / Product Sales')} amount={data.income.product_sales} indent />
                  <Row label={t('finance.serviceIncome', 'Service (Grow-Only) Income')} amount={data.income.service_income} indent />
                  <Row variant="total" label={t('finance.totalIncome', 'Total Income')} amount={data.income.total} color={GREEN} />

                  <Row variant="header" label={t('finance.costs', 'Costs')} />
                  <Row label={t('finance.purchases', 'Material / Seed Purchases')} amount={data.costs.purchases} indent />
                  {data.costs.vendor_returns > 0 && (
                    <Row label={t('finance.lessReturns', 'Less: Vendor Returns')} amount={-data.costs.vendor_returns} indent />
                  )}
                  {data.costs.expenses_by_category.map((c) => (
                    <Row key={c.category} label={c.category} amount={c.total} indent />
                  ))}
                  <Row label={t('finance.payrollCost', 'Salaries & Wages (paid)')} amount={data.costs.payroll} indent />
                  <Row variant="total" label={t('finance.totalCosts', 'Total Costs')} amount={data.costs.total} color={RED} />

                  <Row variant="total"
                    label={profitable ? t('finance.netProfit', 'Net Profit') : t('finance.netLoss', 'Net Loss')}
                    amount={data.net_profit} color={profitable ? GREEN : RED} />
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          {/* Monthly trend — only meaningful for multi-month windows */}
          {chartData.length > 1 && (
            <Grid item xs={12} md={6}>
              <Card elevation={2} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} mb={1}>
                    {t('finance.monthlyTrend', 'Month by Month')}
                  </Typography>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                      <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
                      <Legend />
                      <Bar dataKey="income" name={t('finance.income', 'Income')} fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="costs" name={t('finance.costs', 'Costs')} fill={RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
};

export default ProfitLossPage;
