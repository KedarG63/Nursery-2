import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress,
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, MenuItem, Select, FormControl,
  InputLabel, IconButton, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { getMonthlySummary } from '../../services/bankLedgerService';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

// Build list of FY options: 3 years back + current + 1 future
function getFYOptions() {
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [-2, -1, 0, 1].map((offset) => {
    const yr = currentFYStart + offset;
    const label = `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
    return { value: label, label: `FY ${label}` };
  });
}

function currentFY() {
  const now = new Date();
  const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
}

const BankMonthlySummaryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fy, setFY] = useState(currentFY());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fyOptions = getFYOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMonthlySummary(id, fy);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load summary.');
    } finally {
      setLoading(false);
    }
  }, [id, fy]);

  useEffect(() => {
    load();
  }, [load]);

  const account = data?.account || {};
  const months = data?.data || [];

  // Totals for the FY
  const fyTotalCredits = months.reduce((s, m) => s + m.total_credits, 0);
  const fyTotalDebits = months.reduce((s, m) => s + m.total_debits, 0);
  const fyClosing = months.length > 0 ? months[months.length - 1].closing_balance : 0;
  const fyOpening = months.length > 0 ? months[0].opening_balance : 0;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <IconButton onClick={() => navigate('/banking')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box flexGrow={1}>
          <Typography variant="h5" fontWeight={700}>
            Monthly Summary — {account.account_name || ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {account.bank_name} &bull; {account.account_number}
          </Typography>
        </Box>

        <Button
          startIcon={<ListAltIcon />}
          variant="outlined"
          size="small"
          onClick={() => navigate(`/banking/${id}/ledger`)}
        >
          View Ledger
        </Button>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Financial Year</InputLabel>
          <Select
            label="Financial Year"
            value={fy}
            onChange={(e) => setFY(e.target.value)}
          >
            {fyOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* FY Summary Cards */}
      {!loading && data && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
          <Paper sx={{ p: 2, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #1565c0' }}>
            <Typography variant="caption" color="text.secondary">Opening Balance (Apr)</Typography>
            <Typography variant="h6" fontWeight={700} color="primary.main">{fmt(fyOpening)}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #2e7d32' }}>
            <Typography variant="caption" color="text.secondary">Total Credits (FY)</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#2e7d32' }}>{fmt(fyTotalCredits)}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #c62828' }}>
            <Typography variant="caption" color="text.secondary">Total Debits (FY)</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#c62828' }}>{fmt(fyTotalDebits)}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #5c4b00' }}>
            <Typography variant="caption" color="text.secondary">Closing Balance (Mar)</Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ color: fyClosing >= 0 ? '#2e7d32' : '#c62828' }}
            >
              {fmt(fyClosing)}
            </Typography>
          </Paper>
        </Stack>
      )}

      {/* Monthly Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={1}>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: '#f5f5f5', fontWeight: 700 } }}>
                <TableCell>Month</TableCell>
                <TableCell align="right">Opening Balance</TableCell>
                <TableCell align="right" sx={{ color: '#2e7d32' }}>Credits (In)</TableCell>
                <TableCell align="right" sx={{ color: '#c62828' }}>Debits (Out)</TableCell>
                <TableCell align="right">Net</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Closing Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {months.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No transactions found for FY {fy}. Set an opening balance and add entries to see data here.
                  </TableCell>
                </TableRow>
              )}
              {months.map((month, idx) => {
                const net = month.total_credits - month.total_debits;
                const hasActivity = month.total_credits > 0 || month.total_debits > 0;
                return (
                  <TableRow
                    key={month.month_key}
                    sx={{
                      backgroundColor: !hasActivity ? '#fafafa' : 'inherit',
                      '&:hover': { backgroundColor: '#f5f5f5' },
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      navigate(
                        `/banking/${id}/ledger?from_date=${month.month_key}-01&to_date=${month.month_key}-31`
                      )
                    }
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={hasActivity ? 600 : 400}
                        color={hasActivity ? 'text.primary' : 'text.secondary'}
                      >
                        {month.month_label}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {fmt(month.opening_balance)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={month.total_credits > 0 ? 600 : 400}
                        sx={{ color: month.total_credits > 0 ? '#2e7d32' : 'text.disabled' }}
                      >
                        {month.total_credits > 0 ? fmt(month.total_credits) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={month.total_debits > 0 ? 600 : 400}
                        sx={{ color: month.total_debits > 0 ? '#c62828' : 'text.disabled' }}
                      >
                        {month.total_debits > 0 ? fmt(month.total_debits) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {hasActivity && (
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{ color: net >= 0 ? '#2e7d32' : '#c62828' }}
                        >
                          {net >= 0 ? '+' : ''}{fmt(net)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{ color: month.closing_balance >= 0 ? 'text.primary' : '#c62828' }}
                      >
                        {fmt(month.closing_balance)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              {months.length > 0 && (
                <TableRow sx={{ backgroundColor: '#f0f4ff', '& td': { fontWeight: 700, borderTop: '2px solid #ccc' } }}>
                  <TableCell>Full Year Total</TableCell>
                  <TableCell align="right" sx={{ color: '#1565c0' }}>{fmt(fyOpening)}</TableCell>
                  <TableCell align="right" sx={{ color: '#2e7d32' }}>{fmt(fyTotalCredits)}</TableCell>
                  <TableCell align="right" sx={{ color: '#c62828' }}>{fmt(fyTotalDebits)}</TableCell>
                  <TableCell align="right" sx={{ color: fyTotalCredits - fyTotalDebits >= 0 ? '#2e7d32' : '#c62828' }}>
                    {fyTotalCredits - fyTotalDebits >= 0 ? '+' : ''}{fmt(fyTotalCredits - fyTotalDebits)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: fyClosing >= 0 ? '#2e7d32' : '#c62828', fontSize: '1rem' }}>
                    {fmt(fyClosing)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Click any month row to view detailed ledger entries for that month.
      </Typography>
    </Box>
  );
};

export default BankMonthlySummaryPage;
