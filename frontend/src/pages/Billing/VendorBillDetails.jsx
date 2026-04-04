import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Stack, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, CircularProgress, Breadcrumbs, Link, IconButton,
  Button, TextField, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import { getVendorBill, updateDueDate, recordPayment } from '../../services/vendorBillService';
import BillingStatusBadge from '../../components/Billing/BillingStatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const PAYMENT_METHODS = ['cash', 'cheque', 'upi', 'bank_transfer'];

const REFERENCE_LABELS = {
  cash:          'Receipt Number *',
  cheque:        'Cheque Number *',
  upi:           'UPI Transaction ID / UTR *',
  bank_transfer: 'Bank Reference / UTR *',
};

const VendorBillDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Due date edit
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [newDueDate, setNewDueDate] = useState(null);
  const [savingDueDate, setSavingDueDate] = useState(false);

  // Payment recording
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_method: 'cash',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    transaction_reference: '',
    notes: '',
  });
  const [paymentError, setPaymentError] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const isAdmin = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const fetchBill = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getVendorBill(id);
      setBill(result.data);
      setNewDueDate(result.data.due_date ? new Date(result.data.due_date) : null);
    } catch (err) {
      setError(err?.message || 'Failed to load vendor bill');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBill(); }, [id]);

  const handleSaveDueDate = async () => {
    if (!newDueDate) { toast.error('Please select a date'); return; }
    setSavingDueDate(true);
    try {
      await updateDueDate(id, format(newDueDate, 'yyyy-MM-dd'));
      toast.success('Due date updated');
      setEditingDueDate(false);
      fetchBill();
    } catch (err) {
      toast.error(err?.message || 'Failed to update due date');
    } finally {
      setSavingDueDate(false);
    }
  };

  const handleRecordPayment = async () => {
    setPaymentError('');
    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError('Amount must be > 0'); return; }
    const balance = parseFloat(bill.balance_due || 0);
    if (amt > balance + 0.01) { setPaymentError(`Amount exceeds balance due (${formatCurrency(balance)})`); return; }
    if (!paymentData.transaction_reference || paymentData.transaction_reference.trim() === '') {
      setPaymentError(`${REFERENCE_LABELS[paymentData.payment_method].replace(' *', '')} is required`);
      return;
    }

    setSubmittingPayment(true);
    try {
      await recordPayment(id, {
        ...paymentData,
        amount: amt,
      });
      toast.success('Payment recorded');
      setShowPaymentForm(false);
      setPaymentData({ amount: '', payment_method: 'cash', payment_date: format(new Date(), 'yyyy-MM-dd'), transaction_reference: '', notes: '' });
      fetchBill();
    } catch (err) {
      setPaymentError(err?.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
  if (!bill) return null;

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/billing/vendor-bills" underline="hover" color="inherit">Vendor Bills</Link>
        <Typography color="text.primary">{bill.purchase_number}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/billing/vendor-bills')} size="small"><ArrowBackIcon /></IconButton>
        <Typography variant="h5" fontWeight={700}>{bill.purchase_number}</Typography>
        <BillingStatusBadge status={bill.payment_status} />
        {bill.days_overdue > 0 && (
          <Typography variant="caption" color="error.main" fontWeight={700}>{bill.days_overdue} days overdue</Typography>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Vendor */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">Vendor</Typography>
            <Typography variant="subtitle1" fontWeight={600}>{bill.vendor_name}</Typography>
            <Typography variant="body2" color="text.secondary">{bill.vendor_code}</Typography>
            {bill.contact_person && <Typography variant="body2">{bill.contact_person}</Typography>}
            {bill.vendor_phone && <Typography variant="body2">{bill.vendor_phone}</Typography>}
            {bill.vendor_gst && <Typography variant="body2">GSTIN: {bill.vendor_gst}</Typography>}
          </Paper>
        </Grid>

        {/* Bill Info */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">Bill Details</Typography>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Product</Typography>
                <Typography variant="body2">{bill.product_name} {bill.variety ? `· ${bill.variety}` : ''}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Invoice #</Typography>
                <Typography variant="body2">{bill.invoice_number || '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Invoice Date</Typography>
                <Typography variant="body2">{formatDate(bill.invoice_date)}</Typography>
              </Box>
              {/* Due Date with inline edit */}
              <Box>
                <Typography variant="caption" color="text.secondary">Due Date</Typography>
                {editingDueDate ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <DatePicker
                      selected={newDueDate}
                      onChange={setNewDueDate}
                      dateFormat="dd/MM/yyyy"
                      customInput={<TextField size="small" sx={{ width: 140 }} />}
                    />
                    <IconButton size="small" color="success" onClick={handleSaveDueDate} disabled={savingDueDate}><CheckIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setEditingDueDate(false)}><CloseIcon fontSize="small" /></IconButton>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color={bill.days_overdue > 0 ? 'error.main' : 'text.primary'}>
                      {bill.due_date ? formatDate(bill.due_date) : 'Not set'}
                    </Typography>
                    {isAdmin && bill.payment_status !== 'paid' && (
                      <IconButton size="small" onClick={() => setEditingDueDate(true)}><EditIcon fontSize="small" /></IconButton>
                    )}
                  </Stack>
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Financials */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="overline" color="text.secondary">Financials</Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                <Typography variant="body2">{formatCurrency(bill.grand_total)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="success.main">Paid</Typography>
                <Typography variant="body2" color="success.main">{formatCurrency(bill.amount_paid)}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" color={parseFloat(bill.balance_due) > 0 ? 'error.main' : 'text.secondary'}>
                  Balance Due
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color={parseFloat(bill.balance_due) > 0 ? 'error.main' : 'text.secondary'}>
                  {formatCurrency(bill.balance_due)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Payment History */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">Payment History</Typography>
          {isAdmin && bill.payment_status !== 'paid' && (
            <Button startIcon={<AddIcon />} size="small" variant="outlined" onClick={() => setShowPaymentForm(true)}>
              Record Payment
            </Button>
          )}
        </Box>

        {/* Payment Form */}
        {showPaymentForm && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Record New Payment</Typography>
            {paymentError && <Alert severity="error" sx={{ mb: 1 }}>{paymentError}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Amount *"
                  type="number"
                  size="small"
                  fullWidth
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  inputProps={{ min: 0.01 }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Method *</InputLabel>
                  <Select
                    value={paymentData.payment_method}
                    label="Method *"
                    onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <MenuItem key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <DatePicker
                  selected={paymentData.payment_date ? new Date(paymentData.payment_date) : new Date()}
                  onChange={(d) => setPaymentData({ ...paymentData, payment_date: format(d, 'yyyy-MM-dd') })}
                  dateFormat="dd/MM/yyyy"
                  customInput={<TextField size="small" label="Date *" fullWidth />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label={REFERENCE_LABELS[paymentData.payment_method]}
                  size="small"
                  fullWidth
                  required
                  value={paymentData.transaction_reference}
                  onChange={(e) => setPaymentData({ ...paymentData, transaction_reference: e.target.value })}
                  placeholder={
                    paymentData.payment_method === 'cash' ? 'e.g. REC-2026-001' :
                    paymentData.payment_method === 'cheque' ? 'e.g. 123456' :
                    'e.g. UTR123456789'
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  size="small"
                  fullWidth
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" size="small" onClick={handleRecordPayment} disabled={submittingPayment}>
                    {submittingPayment ? 'Saving…' : 'Save Payment'}
                  </Button>
                  <Button size="small" onClick={() => { setShowPaymentForm(false); setPaymentError(''); }}>
                    Cancel
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Paper>
        )}

        {(!bill.payments || bill.payments.length === 0) ? (
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography color="text.secondary" variant="body2">No payments recorded yet.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600 } }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Recorded By</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bill.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell>{p.payment_method?.replace(/_/g, ' ').toUpperCase()}</TableCell>
                    <TableCell>{p.transaction_reference || '—'}</TableCell>
                    <TableCell>{p.recorded_by_name || '—'}</TableCell>
                    <TableCell align="right"><Typography fontWeight={600} color="success.main">{formatCurrency(p.amount)}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default VendorBillDetails;
