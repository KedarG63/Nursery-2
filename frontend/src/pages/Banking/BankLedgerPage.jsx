import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, Chip, Alert,
  CircularProgress, TextField, MenuItem, Select,
  FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Divider,
  Tooltip, IconButton, Pagination,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/OpenInNew';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import BarChartIcon from '@mui/icons-material/BarChart';
import { toast } from 'react-toastify';
import { getLedger, deleteManualEntry } from '../../services/bankLedgerService';
import AddTransactionModal from '../../components/Banking/AddTransactionModal';
import useAuth from '../../hooks/useAuth';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Current FY start/end defaults
function currentFYDates() {
  const now = new Date();
  const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${yr}-04-01`, to: `${yr + 1}-03-31` };
}

const SOURCE_LABEL = {
  manual: null,
  customer_payment: 'Customer Payment',
  vendor_payment: 'Vendor Payment',
};

const BankLedgerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const fyDefaults = currentFYDates();
  const [filters, setFilters] = useState({
    from_date: fyDefaults.from,
    to_date: fyDefaults.to,
    entry_type: '',
    page: 1,
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        entry_type: filters.entry_type || undefined,
        page: filters.page,
        limit: 50,
      };
      const res = await getLedger(id, params);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load ledger.');
    } finally {
      setLoading(false);
    }
  }, [id, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = (field, value) => {
    setFilters((f) => ({ ...f, [field]: value, page: 1 }));
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this ledger entry? This cannot be undone.')) return;
    try {
      await deleteManualEntry(id, entryId);
      toast.success('Entry deleted.');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete entry.');
    }
  };

  // Compute totals for the current visible set
  const entries = data?.data || [];
  const totalCredits = entries
    .filter((e) => e.entry_type === 'credit' || e.entry_type === 'opening_balance')
    .reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalDebits = entries
    .filter((e) => e.entry_type === 'debit')
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  const account = data?.account || {};
  const openingBalance = data?.opening_balance || 0;
  const pagination = data?.pagination || {};

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <IconButton onClick={() => navigate('/banking')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box flexGrow={1}>
          <Typography variant="h5" fontWeight={700}>
            {account.account_name || 'Bank Ledger'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {account.bank_name} &bull; {account.account_number}
          </Typography>
        </Box>
        <Button
          startIcon={<BarChartIcon />}
          variant="outlined"
          size="small"
          onClick={() => navigate(`/banking/${id}/summary`)}
        >
          Monthly Summary
        </Button>
        {canWrite && (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => setAddOpen(true)}
          >
            Add Entry
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
          <TextField
            label="From Date"
            type="date"
            size="small"
            value={filters.from_date}
            onChange={(e) => handleFilterChange('from_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            label="To Date"
            type="date"
            size="small"
            value={filters.to_date}
            onChange={(e) => handleFilterChange('to_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={filters.entry_type}
              onChange={(e) => handleFilterChange('entry_type', e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="credit">Credits Only</MenuItem>
              <MenuItem value="debit">Debits Only</MenuItem>
              <MenuItem value="opening_balance">Opening Balance</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Summary strip */}
      <Stack direction="row" spacing={2} mb={2}>
        <Paper sx={{ p: 1.5, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #1565c0' }}>
          <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
          <Typography variant="h6" fontWeight={700} color="primary.main">{fmt(openingBalance)}</Typography>
        </Paper>
        <Paper sx={{ p: 1.5, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #2e7d32' }}>
          <Typography variant="caption" color="text.secondary">Total Credits (In)</Typography>
          <Typography variant="h6" fontWeight={700} sx={{ color: '#2e7d32' }}>{fmt(totalCredits)}</Typography>
        </Paper>
        <Paper sx={{ p: 1.5, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #c62828' }}>
          <Typography variant="caption" color="text.secondary">Total Debits (Out)</Typography>
          <Typography variant="h6" fontWeight={700} sx={{ color: '#c62828' }}>{fmt(totalDebits)}</Typography>
        </Paper>
        <Paper sx={{ p: 1.5, flexGrow: 1, textAlign: 'center', borderTop: '3px solid #5c4b00' }}>
          <Typography variant="caption" color="text.secondary">Net for Period</Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ color: totalCredits - totalDebits >= 0 ? '#2e7d32' : '#c62828' }}
          >
            {fmt(totalCredits - totalDebits)}
          </Typography>
        </Paper>
      </Stack>

      {/* Ledger Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={1}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: '#f5f5f5', fontWeight: 700 } }}>
                <TableCell>Date</TableCell>
                <TableCell>Narration</TableCell>
                <TableCell>Party</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell align="right" sx={{ color: '#c62828' }}>Debit (₹)</TableCell>
                <TableCell align="right" sx={{ color: '#2e7d32' }}>Credit (₹)</TableCell>
                <TableCell align="right">Balance (₹)</TableCell>
                {canWrite && <TableCell align="center" sx={{ width: 80 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 8 : 7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No entries found for the selected period.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((row) => {
                const isOB = row.entry_type === 'opening_balance';
                const isCredit = row.entry_type === 'credit' || isOB;
                const sourceLabel = SOURCE_LABEL[row.source_type];

                return (
                  <TableRow
                    key={row.id}
                    sx={{
                      backgroundColor: isOB
                        ? '#f3f4f6'
                        : isCredit
                        ? 'rgba(46,125,50,0.04)'
                        : 'rgba(198,40,40,0.04)',
                      fontStyle: isOB ? 'italic' : 'normal',
                      '&:hover': { backgroundColor: isOB ? '#ebebeb' : isCredit ? 'rgba(46,125,50,0.08)' : 'rgba(198,40,40,0.08)' },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.8rem' }}>
                      {fmtDate(row.entry_date)}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {isCredit ? (
                          <SouthWestIcon sx={{ fontSize: '0.9rem', color: '#2e7d32' }} />
                        ) : (
                          <NorthEastIcon sx={{ fontSize: '0.9rem', color: '#c62828' }} />
                        )}
                        <Typography variant="body2">
                          {row.narration || (isOB ? 'Opening Balance' : '—')}
                        </Typography>
                        {sourceLabel && (
                          <Chip
                            label={sourceLabel}
                            size="small"
                            variant="outlined"
                            icon={<LinkIcon sx={{ fontSize: '0.7rem !important' }} />}
                            sx={{ fontSize: '0.65rem', height: 18, ml: 0.5 }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.party_name || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                        {row.reference_number || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {!isCredit && (
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#c62828' }}>
                          {fmt(row.amount)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {isCredit && (
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#2e7d32' }}>
                          {fmt(row.amount)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{ color: row.running_balance >= 0 ? 'text.primary' : '#c62828' }}
                      >
                        {fmt(row.running_balance)}
                      </Typography>
                    </TableCell>
                    {canWrite && (
                      <TableCell align="center">
                        {row.source_type === 'manual' && !isOB && (
                          <Tooltip title="Delete entry">
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(row.id)}
                              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                            >
                              <DeleteIcon sx={{ fontSize: '1rem' }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination
            count={pagination.totalPages}
            page={filters.page}
            onChange={(_, p) => setFilters((f) => ({ ...f, page: p }))}
            color="primary"
          />
        </Box>
      )}

      {/* Add Entry Modal */}
      <AddTransactionModal
        open={addOpen}
        accountId={id}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          toast.success('Entry added.');
          load();
        }}
      />
    </Box>
  );
};

export default BankLedgerPage;
