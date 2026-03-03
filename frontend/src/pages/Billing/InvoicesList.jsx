import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, TextField, Chip, Stack,
  TablePagination, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import { getInvoices } from '../../services/invoiceService';
import InvoicesTable from '../../components/Billing/InvoicesTable';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

const InvoicesList = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search)      params.search     = search;
      if (statusFilter) params.status    = statusFilter;
      if (fromDate)    params.from_date  = format(fromDate, 'yyyy-MM-dd');
      if (toDate)      params.to_date    = format(toDate, 'yyyy-MM-dd');

      const result = await getInvoices(params);
      setInvoices(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      toast.error(err?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, statusFilter, fromDate, toDate]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleStatusFilter = (value) => {
    setStatusFilter(value === statusFilter ? '' : value);
    setPage(0);
  };

  const handleExport = () => {
    if (!invoices.length) return;
    const rows = invoices.map((inv) => ({
      'Invoice #': inv.invoice_number,
      Customer: inv.customer_name,
      'Order #': inv.order_number || '',
      'Invoice Date': inv.invoice_date,
      'Due Date': inv.due_date,
      Status: inv.status,
      Total: inv.total_amount,
      Paid: inv.paid_amount,
      Balance: inv.balance_amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices-${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const canCreate = user?.roles?.some((r) => ['Admin', 'Manager', 'Sales'].includes(r));

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Invoices</Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<FileDownloadIcon />} onClick={handleExport} variant="outlined" size="small">
            Export
          </Button>
          {canCreate && (
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              onClick={() => navigate('/billing/invoices/create')}
            >
              Create Invoice
            </Button>
          )}
        </Stack>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              size="small"
              placeholder="Search invoice # or customer…"
              value={search}
              onChange={handleSearchChange}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ flex: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
            </Box>
          </Stack>

          {/* Status filter chips */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {STATUS_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                onClick={() => handleStatusFilter(opt.value)}
                color={statusFilter === opt.value ? 'primary' : 'default'}
                variant={statusFilter === opt.value ? 'filled' : 'outlined'}
                size="small"
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* Total count */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {total} invoice{total !== 1 ? 's' : ''} found
      </Typography>

      {/* Table */}
      <InvoicesTable invoices={invoices} loading={loading} />

      {/* Pagination */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
    </Box>
  );
};

export default InvoicesList;
