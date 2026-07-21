import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Chip, LinearProgress,
} from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SavingsIcon from '@mui/icons-material/Savings';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { getFinanceOverview } from '../../services/financeService';
import PeriodPicker, { periodRange } from '../../components/Accounting/PeriodPicker';
import { formatCurrency } from '../../utils/formatters';

// Money-in / money-out keep the app's fixed polarity colors.
const GREEN = '#2e7d32';
const RED = '#c62828';

const SOURCE_LABELS = {
  expense: ['finance.srcExpenses', 'Expenses'],
  payroll: ['finance.srcPayroll', 'Salaries & Wages'],
  advance: ['finance.srcAdvances', 'Staff Advances'],
  material_purchase: ['finance.srcSupplies', 'Supplies & Materials'],
  seed_purchase: ['finance.srcSeeds', 'Seed Purchases'],
  manual: ['finance.srcManual', 'Manual Entries'],
};

const StatCard = ({ label, value, color, icon, sub }) => (
  <Card elevation={2} sx={{ height: '100%', borderTop: `4px solid ${color || '#90a4ae'}` }}>
    <CardContent>
      <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
        {icon}
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Stack>
      <Typography variant="h5" fontWeight={800} sx={{ color: color || 'text.primary' }}>
        {formatCurrency(value)}
      </Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </CardContent>
  </Card>
);

const FinanceOverviewPage = () => {
  const { t } = useTranslation();
  const [window_, setWindow] = useState(periodRange('this_month'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getFinanceOverview(window_);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load finance overview');
    } finally {
      setLoading(false);
    }
  }, [window_]);

  useEffect(() => { load(); }, [load]);

  const outBySource = data?.flows?.out_by_source || {};
  const outTotal = Object.values(outBySource).reduce((s, v) => s + v, 0);
  const outRows = Object.entries(outBySource).sort((a, b) => b[1] - a[1]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} mb={3} spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <InsightsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('finance.overviewTitle', 'Finance Overview')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('finance.overviewSub', 'Your whole money position in one place — balances, flows, and what is owed')}
            </Typography>
          </Box>
        </Stack>
        <PeriodPicker value={window_} onChange={setWindow} />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>}

      {!loading && data && (
        <>
          {/* What I have today */}
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            {t('finance.balancesToday', 'BALANCES TODAY')}
          </Typography>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.cashInHand', 'Cash in Hand')} value={data.totals.cash_in_hand}
                icon={<AccountBalanceWalletIcon fontSize="small" color="action" />} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.bankBalance', 'Bank Balance')} value={data.totals.bank_balance}
                icon={<SavingsIcon fontSize="small" color="action" />} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.totalFunds', 'Total Funds')}
                value={data.totals.cash_in_hand + data.totals.bank_balance} color="#1565c0" />
            </Grid>
          </Grid>

          {/* Flows for the selected window */}
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            {t('finance.flowsFor', 'MONEY FLOW')} · {data.window.start} → {data.window.end}
          </Typography>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.moneyIn', 'Money In')} value={data.flows.money_in} color={GREEN}
                icon={<ArrowDownwardIcon fontSize="small" sx={{ color: GREEN }} />} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.moneyOut', 'Money Out')} value={data.flows.money_out} color={RED}
                icon={<ArrowUpwardIcon fontSize="small" sx={{ color: RED }} />} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.netFlow', 'Net Flow')} value={data.flows.net}
                color={data.flows.net >= 0 ? GREEN : RED} />
            </Grid>
          </Grid>

          {/* Owed to me / by me */}
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            {t('finance.owed', 'OUTSTANDING')}
          </Typography>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.receivables', 'To Collect (Customers)')} value={data.receivables.total} color={GREEN}
                sub={`${data.receivables.orders_count + data.receivables.service_orders_count} ${t('finance.receivablesSub', 'orders with balance due')}`} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.payables', 'To Pay (Vendors)')} value={data.payables.total} color={RED}
                sub={`${t('finance.payablesSeeds', 'Seeds')} ${formatCurrency(data.payables.seed_purchases ?? 0)} · ${t('finance.payablesSupplies', 'Supplies')} ${formatCurrency(data.payables.supplies ?? 0)}`} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard label={t('finance.staffAdvances', 'Staff Advances Outstanding')} value={data.staff_advances.total}
                sub={`${data.staff_advances.count} ${t('finance.staffAdvancesSub', 'advances open')}`} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            {/* Where the money went */}
            <Grid item xs={12} md={6}>
              <Card elevation={2}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} mb={2}>
                    {t('finance.whereItWent', 'Where the Money Went')}
                  </Typography>
                  {outRows.length === 0 && (
                    <Typography color="text.secondary" variant="body2">
                      {t('finance.noOutflows', 'No outflows in this period')}
                    </Typography>
                  )}
                  <Stack spacing={1.5}>
                    {outRows.map(([source, amount]) => {
                      const [key, fallback] = SOURCE_LABELS[source] || [null, source];
                      return (
                        <Box key={source}>
                          <Stack direction="row" justifyContent="space-between" mb={0.5}>
                            <Typography variant="body2">{key ? t(key, fallback) : fallback}</Typography>
                            <Typography variant="body2" fontWeight={600}>{formatCurrency(amount)}</Typography>
                          </Stack>
                          <LinearProgress variant="determinate" value={outTotal > 0 ? (amount / outTotal) * 100 : 0}
                            sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: RED, borderRadius: 3 } }} />
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Account balances */}
            <Grid item xs={12} md={6}>
              <Card elevation={2}>
                <CardContent sx={{ pb: 0 }}>
                  <Typography variant="h6" fontWeight={700}>
                    {t('finance.accountBalances', 'Account Balances')}
                  </Typography>
                </CardContent>
                <TableContainer component={Paper} elevation={0}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('finance.account', 'Account')}</TableCell>
                        <TableCell>{t('finance.type', 'Type')}</TableCell>
                        <TableCell align="right">{t('finance.balance', 'Balance')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.accounts.map((a) => (
                        <TableRow key={`${a.type}-${a.id}`} hover>
                          <TableCell>
                            {a.type === 'bank' ? (
                              <Link component={RouterLink} to={`/banking/${a.id}/ledger`} underline="hover">
                                {a.account_name}{a.bank_name ? ` — ${a.bank_name}` : ''}
                              </Link>
                            ) : (
                              <Link component={RouterLink} to="/accounting/cash-book" underline="hover">
                                {a.account_name}
                              </Link>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined"
                              label={a.type === 'bank' ? t('finance.bank', 'Bank') : t('finance.cash', 'Cash')}
                              color={a.type === 'bank' ? 'primary' : 'default'} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: a.balance >= 0 ? GREEN : RED }}>
                            {formatCurrency(a.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default FinanceOverviewPage;
