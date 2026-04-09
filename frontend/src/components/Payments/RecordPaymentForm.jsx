/**
 * Record Payment Form Component
 * Modal form for recording offline payments
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Autocomplete,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { recordPayment } from '../../services/paymentService';
import { getOrders } from '../../services/orderService';
import { getBankAccounts } from '../../services/bankLedgerService';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

const RecordPaymentForm = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [formData, setFormData] = useState({
    orderId: '',
    amount: '',
    paymentMethod: 'cash',
    transactionRef: '',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    bankAccountId: '',
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      fetchOutstandingOrders();
      fetchBankAccounts();
    }
  }, [open]);

  const fetchBankAccounts = async () => {
    try {
      const response = await getBankAccounts();
      setBankAccounts(response.data || response.accounts || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    }
  };

  const fetchOutstandingOrders = async () => {
    setLoadingOrders(true);
    try {
      const response = await getOrders({ has_balance: true });
      setOrders(response.data || response.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load outstanding orders');
    } finally {
      setLoadingOrders(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.orderId) {
      newErrors.orderId = 'Please select an order';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (selectedOrder && parseFloat(formData.amount) > selectedOrder.balance_amount) {
      newErrors.amount = `Amount cannot exceed outstanding balance of ₹${selectedOrder.balance_amount}`;
    }

    if (
      (formData.paymentMethod === 'bank_transfer' ||
       formData.paymentMethod === 'upi' ||
       formData.paymentMethod === 'cash') &&
      !formData.transactionRef
    ) {
      newErrors.transactionRef =
        formData.paymentMethod === 'cash'
          ? 'Receipt number is required'
          : 'Transaction reference is required';
    }

    if (new Date(formData.paymentDate) > new Date()) {
      newErrors.paymentDate = 'Payment date cannot be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Prepare payment data
      const paymentData = {
        order_id: formData.orderId,
        amount: parseFloat(formData.amount),
        payment_method: formData.paymentMethod,
      };

      // Only include receipt_number if it has a value
      if (formData.transactionRef && formData.transactionRef.trim()) {
        paymentData.receipt_number = formData.transactionRef.trim();
      }

      // Only include notes if provided
      if (formData.notes && formData.notes.trim()) {
        paymentData.notes = formData.notes.trim();
      }

      // Include bank account if selected (for non-cash methods)
      if (formData.bankAccountId) {
        paymentData.bank_account_id = formData.bankAccountId;
      }

      console.log('Recording payment with data:', paymentData);

      await recordPayment(paymentData);

      toast.success('Payment recorded successfully');
      handleClose();
      onSuccess?.();
      // Refresh the orders list to show updated balances
      fetchOutstandingOrders();
    } catch (error) {
      console.error('=== Payment Recording Error ===');
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);
      console.error('Full error:', error);

      const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Failed to record payment';
      const validationErrors = error.response?.data?.errors;

      // Show detailed error information
      if (validationErrors && Array.isArray(validationErrors) && validationErrors.length > 0) {
        // Validation errors from backend
        toast.error(`Validation failed: ${validationErrors.join(', ')}`, { autoClose: 5000 });
      } else if (error.response?.data?.errorDetail) {
        // Database error detail
        toast.error(`${errorMsg}: ${error.response.data.errorDetail}`, { autoClose: 5000 });
      } else {
        // Generic error
        toast.error(errorMsg, { autoClose: 5000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      orderId: '',
      amount: '',
      paymentMethod: 'cash',
      transactionRef: '',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
      bankAccountId: '',
    });
    setSelectedOrder(null);
    setErrors({});
    onClose();
  };

  const handleOrderSelect = (event, value) => {
    setSelectedOrder(value);
    setFormData({
      ...formData,
      orderId: value?.id || '',
      amount: value?.balance_amount?.toString() || '',
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record Payment</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={orders}
                getOptionLabel={(option) =>
                  `${option.order_number} - ${option.customer_name} (${formatCurrency(
                    option.balance_amount
                  )})`
                }
                loading={loadingOrders}
                value={selectedOrder}
                onChange={handleOrderSelect}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Order"
                    required
                    error={!!errors.orderId}
                    helperText={errors.orderId}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingOrders ? <CircularProgress size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              {selectedOrder && (
                <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', border: '1px solid #e0e0e0', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Outstanding Balance:
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatCurrency(selectedOrder.balance_amount)}
                  </Typography>
                </Box>
              )}
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                required
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                error={!!errors.amount}
                helperText={errors.amount}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label="Payment Method"
                required
                value={formData.paymentMethod}
                onChange={(e) =>
                  setFormData({ ...formData, paymentMethod: e.target.value })
                }
              >
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method.value} value={method.value}>
                    {method.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {bankAccounts.length > 0 && formData.paymentMethod !== 'cash' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Bank Account (Optional)"
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  helperText="Select the bank account where this payment will be received"
                >
                  <MenuItem value=""><em>— Not specified —</em></MenuItem>
                  {bankAccounts.map((acc) => (
                    <MenuItem key={acc.id} value={acc.id}>
                      {acc.account_name}
                      {acc.bank_name ? ` — ${acc.bank_name}` : ''}
                      {acc.account_number ? ` (****${acc.account_number.slice(-4)})` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}

            {(formData.paymentMethod === 'bank_transfer' ||
              formData.paymentMethod === 'upi' ||
              formData.paymentMethod === 'cash') && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={
                    formData.paymentMethod === 'cash'
                      ? 'Receipt Number'
                      : 'Transaction Reference'
                  }
                  required
                  value={formData.transactionRef}
                  onChange={(e) =>
                    setFormData({ ...formData, transactionRef: e.target.value })
                  }
                  error={!!errors.transactionRef}
                  helperText={errors.transactionRef}
                  placeholder={
                    formData.paymentMethod === 'cash'
                      ? 'Enter receipt number'
                      : 'Enter transaction ID/reference'
                  }
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Payment Date"
                type="date"
                required
                value={formData.paymentDate}
                onChange={(e) =>
                  setFormData({ ...formData, paymentDate: e.target.value })
                }
                error={!!errors.paymentDate}
                helperText={errors.paymentDate}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes (Optional)"
                multiline
                rows={2}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading && <CircularProgress size={20} />}
          >
            {loading ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default RecordPaymentForm;
