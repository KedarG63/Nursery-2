import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, InputLabel, Select, MenuItem,
  TextField, Typography, Box, Alert, CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { getPayments } from '../../services/paymentService';
import { applyPayment } from '../../services/invoiceService';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * ApplyPaymentModal
 *
 * Props:
 *  open         - boolean
 *  invoiceId    - string
 *  customerId   - string
 *  balanceDue   - number
 *  onClose      - () => void
 *  onSuccess    - () => void
 */
const ApplyPaymentModal = ({ open, invoiceId, customerId, balanceDue, onClose, onSuccess }) => {
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [amountApplied, setAmountApplied] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch customer's successful payments when modal opens
  useEffect(() => {
    if (!open || !customerId) return;

    const fetchPayments = async () => {
      setLoadingPayments(true);
      setError('');
      try {
        const result = await getPayments({ customer_id: customerId, status: 'success', limit: 100 });
        setPayments(result.data || []);
      } catch {
        setError('Could not load payments. Please try again.');
      } finally {
        setLoadingPayments(false);
      }
    };
    fetchPayments();
  }, [open, customerId]);

  // Auto-fill amount when payment is selected
  const handlePaymentSelect = (paymentId) => {
    setSelectedPaymentId(paymentId);
    const payment = payments.find((p) => p.id === paymentId);
    if (payment) {
      const available = parseFloat(payment.amount) - parseFloat(payment.already_applied || 0);
      const suggested = Math.min(available, parseFloat(balanceDue));
      setAmountApplied(suggested.toFixed(2));
    }
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedPaymentId) {
      setError('Please select a payment.');
      return;
    }
    const amt = parseFloat(amountApplied);
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }
    if (amt > parseFloat(balanceDue) + 0.01) {
      setError(`Amount cannot exceed invoice balance (${formatCurrency(balanceDue)}).`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await applyPayment(invoiceId, {
        payment_id: selectedPaymentId,
        amount_applied: amt,
        notes: notes || undefined,
      });
      toast.success('Payment applied successfully');
      handleClose();
      onSuccess && onSuccess();
    } catch (err) {
      setError(err?.message || 'Failed to apply payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPaymentId('');
    setAmountApplied('');
    setNotes('');
    setError('');
    onClose();
  };

  const selectedPayment = payments.find((p) => p.id === selectedPaymentId);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Apply Payment to Invoice</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Invoice Balance Due: <strong>{formatCurrency(balanceDue)}</strong>
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}

          {loadingPayments ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : payments.length === 0 ? (
            <Alert severity="info">
              No successful payments found for this customer. Record a payment first from the Payments module.
            </Alert>
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel>Select Payment</InputLabel>
              <Select
                value={selectedPaymentId}
                label="Select Payment"
                onChange={(e) => handlePaymentSelect(e.target.value)}
              >
                {payments.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {p.transaction_id} — {formatCurrency(p.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.payment_method?.toUpperCase()} · {formatDate(p.payment_date)}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedPayment && (
            <Typography variant="caption" color="text.secondary">
              Payment total: {formatCurrency(selectedPayment.amount)}
            </Typography>
          )}

          <TextField
            label="Amount to Apply"
            type="number"
            size="small"
            fullWidth
            value={amountApplied}
            onChange={(e) => setAmountApplied(e.target.value)}
            inputProps={{ min: 0.01, step: '0.01' }}
          />

          <TextField
            label="Notes (optional)"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || loadingPayments || payments.length === 0}
        >
          {submitting ? 'Applying…' : 'Apply Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ApplyPaymentModal;
