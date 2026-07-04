import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Stack, CircularProgress, Alert,
  ToggleButton, ToggleButtonGroup, Chip, Paper,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatDate } from '../../utils/formatters';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Reusable 360° summary panel for a customer / vendor / employee.
 *
 * Props:
 *   fetchSummary(params) -> { data: { headline, series, transactions, ... } }
 *   kpis        : [{ key, label, color }]  (read from headline)
 *   seriesBars  : [{ key, label, color }]  (recharts bars)
 *   txTypeColors: { typeName: 'mui color' }
 */
const PartySummary360 = ({ fetchSummary, kpis, seriesBars, txTypeColors = {} }) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchSummary({ period });
      setData(res.data);
    } catch (err) { setError(err.message || 'Failed to load summary'); }
    finally { setLoading(false); }
  }, [fetchSummary, period]);

  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={700}>{t('summary.title', '360° Business Summary')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={period} onChange={(e, v) => v && setPeriod(v)}>
          <ToggleButton value="week">{t('summary.week', 'This Week')}</ToggleButton>
          <ToggleButton value="month">{t('summary.month', 'This Month')}</ToggleButton>
          <ToggleButton value="year">{t('summary.year', 'This Year')}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : data && (
        <>
          {/* KPI cards */}
          <Grid container spacing={2} mb={2}>
            {kpis.map((k) => (
              <Grid item xs={6} sm={4} md={2.4} key={k.key}>
                <Card elevation={1} sx={{ borderTop: `4px solid ${k.color || '#1A3329'}` }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: k.color || 'text.primary' }}>
                      {k.raw ? data.headline[k.key] : formatCurrency(data.headline[k.key])}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Trend chart */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" mb={1}>
              {t('summary.trend', 'Trend')} — {t(`summary.${data.period}`, data.period)}
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <RTooltip formatter={(v) => inr(v)} />
                <Legend />
                {seriesBars.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          {/* Recent transactions */}
          <Paper>
            <Box px={2} pt={2}><Typography variant="subtitle2" color="text.secondary">{t('summary.recent', 'Recent Transactions')}</Typography></Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('summary.type', 'Type')}</TableCell>
                    <TableCell>{t('summary.ref', 'Reference')}</TableCell>
                    <TableCell>{t('summary.date', 'Date')}</TableCell>
                    <TableCell>{t('summary.detail', 'Detail')}</TableCell>
                    <TableCell align="right">{t('summary.amount', 'Amount')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.transactions.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">{t('summary.noTx', 'No transactions in this period')}</Typography>
                    </TableCell></TableRow>
                  )}
                  {data.transactions.map((tx, i) => (
                    <TableRow key={`${tx.type}-${tx.ref}-${i}`} hover>
                      <TableCell><Chip size="small" label={t(`summary.tx_${tx.type}`, tx.type)} color={txTypeColors[tx.type] || 'default'} variant="outlined" /></TableCell>
                      <TableCell>{tx.ref || '-'}</TableCell>
                      <TableCell>{formatDate(tx.date)}</TableCell>
                      <TableCell>{tx.detail || '-'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(tx.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default PartySummary360;
