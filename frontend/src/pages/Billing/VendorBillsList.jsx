import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Chip, Stack,
  TablePagination, InputAdornment, FormControlLabel, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Skeleton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getVendorBills } from '../../services/vendorBillService';
import BillingStatusBadge from '../../components/Billing/BillingStatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

const VendorBillsList = () => {
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search)        params.search           = search;
      if (statusFilter)  params.payment_status   = statusFilter;
      if (overdueOnly)   params.overdue_only      = 'true';
      if (fromDate)      params.from_date         = format(fromDate, 'yyyy-MM-dd');
      if (toDate)        params.to_date           = format(toDate, 'yyyy-MM-dd');

      const result = await getVendorBills(params);
      setBills(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      toast.error(err?.message || 'Failed to load vendor bills');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, statusFilter, overdueOnly, fromDate, toDate]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Vendor Bills</Typography>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <TextField
              size="small"
              placeholder="Search purchase # or vendor…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ flex: 1 }}
            />
            <DatePicker
              selected={fromDate}
              onChange={(d) => { setFromDate(d); setPage(0); }}
              placeholderText="From date"
              dateFormat="dd/MM/yyyy"
              customInput={<TextField size="small" label="From" sx={{ width: 140 }} />}
              isClearable
            />
            <DatePicker
              selected={toDate}
              onChange={(d) => { setToDate(d); setPage(0); }}
              placeholderText="To date"
              dateFormat="dd/MM/yyyy"
              customInput={<TextField size="small" label="To" sx={{ width: 140 }} />}
              isClearable
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={overdueOnly}
                  onChange={(e) => { setOverdueOnly(e.target.checked); setPage(0); }}
                  color="error"
                />
              }
              label={<Typography variant="body2" color="error.main">Overdue Only</Typography>}
            />
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {STATUS_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                onClick={() => { setStatusFilter(opt.value === statusFilter ? '' : opt.value); setPage(0); }}
                color={statusFilter === opt.value ? 'primary' : 'default'}
                variant={statusFilter === opt.value ? 'filled' : 'outlined'}
                size="small"
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Stack>
      </Paper>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total} bill{total !== 1 ? 's' : ''} found
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50' } }}>
              <TableCell>Purchase #</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Invoice #</TableCell>
              <TableCell>Invoice Date</TableCell>
              <TableCell>Due Date</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Overdue</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(11)].map((__, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              : bills.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No vendor bills found.
                    </TableCell>
                  </TableRow>
                )
              : bills.map((bill) => (
                  <TableRow
                    key={bill.id}
                    hover
                    onClick={() => navigate(`/billing/vendor-bills/${bill.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell><Typography variant="body2" fontWeight={600}>{bill.purchase_number}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="body2">{bill.vendor_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{bill.vendor_code}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2">{bill.product_name}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{bill.invoice_number || '—'}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{formatDate(bill.invoice_date)}</Typography></TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={bill.days_overdue > 0 ? 'error.main' : 'text.primary'}
                        fontWeight={bill.days_overdue > 0 ? 600 : 400}
                      >
                        {bill.due_date ? formatDate(bill.due_date) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right"><Typography variant="body2">{formatCurrency(bill.grand_total)}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" color="success.main">{formatCurrency(bill.amount_paid)}</Typography></TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={parseFloat(bill.balance_due) > 0 ? 600 : 400} color={parseFloat(bill.balance_due) > 0 ? 'error.main' : 'text.secondary'}>
                        {formatCurrency(bill.balance_due)}
                      </Typography>
                    </TableCell>
                    <TableCell><BillingStatusBadge status={bill.payment_status} /></TableCell>
                    <TableCell align="center">
                      {bill.days_overdue > 0
                        ? <Typography variant="caption" color="error.main" fontWeight={700}>{bill.days_overdue}d</Typography>
                        : <Typography variant="caption" color="text.disabled">—</Typography>
                      }
                    </TableCell>
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50]}
      />
    </Box>
  );
};

export default VendorBillsList;
