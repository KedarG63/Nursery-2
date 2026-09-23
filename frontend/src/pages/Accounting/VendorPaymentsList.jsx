import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, TextField, Button, Stack, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Skeleton,
} from '@mui/material';
import { Search as SearchIcon, Add as AddIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { getVendorPayments } from '../../services/vendorPaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const METHOD_LABELS = { bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash' };

/**
 * Vendor Payments — every payment made to a vendor that settles one or more
 * bills, with how much of it is still held as advance.
 */
const VendorPaymentsList = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const r = await getVendorPayments(params);
      setRows(r.data || []);
      setTotal(r.pagination?.total || 0);
    } catch (e) {
      toast.error(e?.message || 'Failed to load vendor payments');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, fromDate, toDate]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>Vendor Payments</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/accounting/vendor-payments/new')}>
          Pay Vendor
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        One payment to a vendor, adjusted against several bills. Anything not yet adjusted is held as an advance.
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            placeholder="Search payment #, vendor or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ flex: 1 }}
          />
          <TextField label="From" type="date" size="small" InputLabelProps={{ shrink: true }}
            value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
          <TextField label="To" type="date" size="small" InputLabelProps={{ shrink: true }}
            value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50' } }}>
              <TableCell>Payment #</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Paid From</TableCell>
              <TableCell>Method / Ref</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Adjusted</TableCell>
              <TableCell align="right">Advance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && [...Array(4)].map((_, i) => (
              <TableRow key={i}>{[...Array(8)].map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No vendor payments yet. Use “Pay Vendor” to record one payment against several bills.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const advance = Number(r.advance_amount);
              return (
                <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/accounting/vendor-payments/${r.id}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>{r.payment_number}</TableCell>
                  <TableCell>{formatDate(r.payment_date, 'DD MMM YYYY')}</TableCell>
                  <TableCell>{r.vendor_name}</TableCell>
                  <TableCell>{r.payment_source === 'bank' ? r.bank_account_name : r.cash_account_name}</TableCell>
                  <TableCell>
                    {METHOD_LABELS[r.payment_method] || r.payment_method}
                    {r.reference_number && (
                      <Typography variant="caption" color="text.secondary" display="block">{r.reference_number}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.amount)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(r.allocated_amount)}</TableCell>
                  <TableCell align="right" sx={{ color: advance > 0.005 ? 'warning.main' : 'text.secondary' }}>
                    {advance > 0.005 ? formatCurrency(advance) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </TableContainer>
    </Box>
  );
};

export default VendorPaymentsList;
