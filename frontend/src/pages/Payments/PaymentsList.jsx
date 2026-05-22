/**
 * Payments List Page
 * Display and manage payments with filtering and export
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  Chip,
  InputAdornment,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  MenuItem,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import PaymentsTable from '../../components/Payments/PaymentsTable';
import RecordPaymentForm from '../../components/Payments/RecordPaymentForm';
import { getPayments, generateReceipt, exportPayments, deletePayment, updatePayment } from '../../services/paymentService';
import { format } from 'date-fns';

const PAYMENT_METHODS_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
];

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'credit', 'razorpay'];
const STATUSES = ['success', 'pending', 'failed', 'refunded'];

const PaymentsList = () => {
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.roles?.some((r) => ['Admin'].includes(r));

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit state
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', payment_method: '', payment_date: '', receipt_number: '', notes: '' });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    paymentMethod: '',
    status: '',
    startDate: null,
    endDate: null,
  });

  useEffect(() => {
    fetchPayments();
  }, [page, limit]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        ...(filters.search && { search: filters.search }),
        ...(filters.paymentMethod && { payment_method: filters.paymentMethod }),
        ...(filters.status && { status: filters.status }),
        ...(filters.startDate && { start_date: format(filters.startDate, 'yyyy-MM-dd') }),
        ...(filters.endDate && { end_date: format(filters.endDate, 'yyyy-MM-dd') }),
      };

      const response = await getPayments(params);
      setPayments(response.data || response.payments || []);
      setTotalCount(response.total || response.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(1);
    fetchPayments();
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      paymentMethod: '',
      status: '',
      startDate: null,
      endDate: null,
    });
    setPage(1);
    setTimeout(fetchPayments, 100);
  };

  const handlePageChange = (newPage, newLimit) => {
    setPage(newPage);
    setLimit(newLimit);
  };

  const handleViewReceipt = async (paymentId) => {
    try {
      const blob = await generateReceipt(paymentId);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error generating receipt:', error);
      toast.error('Failed to generate receipt');
    }
  };

  const handleExport = async () => {
    try {
      const exportFilters = {
        ...(filters.paymentMethod && { payment_method: filters.paymentMethod }),
        ...(filters.status && { status: filters.status }),
        ...(filters.startDate && { start_date: format(filters.startDate, 'yyyy-MM-dd') }),
        ...(filters.endDate && { end_date: format(filters.endDate, 'yyyy-MM-dd') }),
      };

      const blob = await exportPayments(exportFilters);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payments-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
      toast.success('Payments exported successfully');
    } catch (error) {
      console.error('Error exporting payments:', error);
      toast.error('Failed to export payments');
    }
  };

  const handleMethodFilter = (method) => {
    setFilters({
      ...filters,
      paymentMethod: filters.paymentMethod === method ? '' : method,
    });
  };

  const handleStatusFilter = (status) => {
    setFilters({
      ...filters,
      status: filters.status === status ? '' : status,
    });
  };

  const handleDeleteClick = (payment) => setDeleteTarget(payment);

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await deletePayment(deleteTarget.id);
      toast.success('Payment deleted and balances reversed');
      setDeleteTarget(null);
      fetchPayments();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete payment');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEditClick = (payment) => {
    setEditTarget(payment);
    setEditError('');
    setEditForm({
      amount: payment.amount,
      payment_method: payment.payment_method,
      payment_date: payment.payment_date ? format(new Date(payment.payment_date), 'yyyy-MM-dd') : '',
      receipt_number: payment.receipt_number || '',
      notes: payment.notes || '',
    });
  };

  const handleEditSave = async () => {
    setEditError('');
    const amt = parseFloat(editForm.amount);
    if (isNaN(amt) || amt <= 0) { setEditError('Amount must be greater than 0'); return; }
    setEditLoading(true);
    try {
      await updatePayment(editTarget.id, {
        amount: amt,
        payment_method: editForm.payment_method,
        payment_date: editForm.payment_date || undefined,
        receipt_number: editForm.receipt_number || undefined,
        notes: editForm.notes || undefined,
      });
      toast.success('Payment updated successfully');
      setEditTarget(null);
      fetchPayments();
    } catch (err) {
      setEditError(err?.message || 'Failed to update payment');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Payments
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<ExportIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setRecordPaymentOpen(true)}
          >
            Record Payment
          </Button>
        </Stack>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search by order number or transaction ID..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <DatePicker
              selected={filters.startDate}
              onChange={(date) => setFilters({ ...filters, startDate: date })}
              placeholderText="Start Date"
              dateFormat="dd/MM/yyyy"
              customInput={<TextField fullWidth label="Start Date" />}
              isClearable
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <DatePicker
              selected={filters.endDate}
              onChange={(date) => setFilters({ ...filters, endDate: date })}
              placeholderText="End Date"
              dateFormat="dd/MM/yyyy"
              customInput={<TextField fullWidth label="End Date" />}
              minDate={filters.startDate}
              isClearable
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleApplyFilters} fullWidth>
                Apply
              </Button>
              <Button variant="outlined" onClick={handleResetFilters}>
                Reset
              </Button>
            </Stack>
          </Grid>

          {/* Payment Method Filters */}
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Payment Method:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {PAYMENT_METHODS.map((method) => (
                <Chip
                  key={method}
                  label={method.toUpperCase().replace('_', ' ')}
                  onClick={() => handleMethodFilter(method)}
                  color={filters.paymentMethod === method ? 'primary' : 'default'}
                  variant={filters.paymentMethod === method ? 'filled' : 'outlined'}
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          </Grid>

          {/* Status Filters */}
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Status:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={status.toUpperCase()}
                  onClick={() => handleStatusFilter(status)}
                  color={filters.status === status ? 'primary' : 'default'}
                  variant={filters.status === status ? 'filled' : 'outlined'}
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Payments Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <PaymentsTable
          payments={payments}
          totalCount={totalCount}
          page={page}
          limit={limit}
          onPageChange={handlePageChange}
          onViewReceipt={handleViewReceipt}
          isAdmin={isAdmin}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      )}

      {/* Record Payment Modal */}
      <RecordPaymentForm
        open={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        onSuccess={fetchPayments}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleteLoading && setDeleteTarget(null)}>
        <DialogTitle>Delete Payment?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the payment of <strong>₹{parseFloat(deleteTarget?.amount || 0).toLocaleString('en-IN')}</strong> recorded on{' '}
            <strong>{deleteTarget?.payment_date ? format(new Date(deleteTarget.payment_date), 'dd MMM yyyy') : '—'}</strong>.
            <br /><br />
            The order and invoice balances will be automatically reversed. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} disabled={deleteLoading}>
            {deleteLoading ? 'Deleting…' : 'Delete Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={!!editTarget} onClose={() => !editLoading && setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Payment</DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Amount"
              type="number"
              fullWidth
              required
              value={editForm.amount}
              onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              label="Payment Method"
              select
              fullWidth
              value={editForm.payment_method}
              onChange={(e) => setEditForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              {PAYMENT_METHODS_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Payment Date"
              type="date"
              fullWidth
              value={editForm.payment_date}
              onChange={(e) => setEditForm((f) => ({ ...f, payment_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Receipt / Reference Number"
              fullWidth
              value={editForm.receipt_number}
              onChange={(e) => setEditForm((f) => ({ ...f, receipt_number: e.target.value }))}
            />
            <TextField
              label="Notes"
              fullWidth
              multiline
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)} disabled={editLoading}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleEditSave} disabled={editLoading}>
            {editLoading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaymentsList;
