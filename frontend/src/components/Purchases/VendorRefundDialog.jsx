import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  Alert,
  Divider,
} from '@mui/material';
import PaymentSourcePicker, {
  validatePaymentSource,
  paymentSourcePayload,
  emptyPaymentSource,
} from '../Common/PaymentSourcePicker';
import vendorReturnService from '../../services/vendorReturnService';

/**
 * VendorRefundDialog
 *
 * The vendor paid the money back instead of issuing credit against a future
 * bill. Money comes IN, so this posts a credit to the chosen cash drawer or
 * bank account.
 *
 * Props:
 *   open        – boolean
 *   returnNote  – vendor return note row (needs id, return_number, open_balance)
 *   onClose     – () => void
 *   onRecorded  – () => void   called after a successful refund
 */
const VendorRefundDialog = ({ open, returnNote, onClose, onRecorded }) => {
  const [amount, setAmount] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState(emptyPaymentSource);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // open_balance comes from the settlement ledger, so it already accounts for
  // credit applied to bills AND any earlier partial refund.
  const open_ = parseFloat(returnNote?.open_balance ?? 0);

  const formatCurrency = (v) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

  // Reset every time the dialog opens, so a previous attempt's amount or error
  // never carries into the next return note.
  useEffect(() => {
    if (!open) return;
    setAmount(open_ > 0 ? open_.toFixed(2) : '');
    setRefundDate(new Date().toISOString().split('T')[0]);
    setSource(emptyPaymentSource);
    setNotes('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, returnNote?.id]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      setError('Enter a refund amount greater than zero.');
      return;
    }
    // The backend enforces this too; checking here keeps the message immediate.
    if (amt > open_ + 0.005) {
      setError(`Only ${formatCurrency(open_)} is still unsettled on this return.`);
      return;
    }
    const sourceError = validatePaymentSource(source);
    if (sourceError) {
      setError(sourceError);
      return;
    }

    setLoading(true);
    try {
      const result = await vendorReturnService.recordRefund(returnNote.id, {
        amount: amt,
        refund_date: refundDate,
        notes: notes || undefined,
        ...paymentSourcePayload(source),
      });
      onRecorded?.(result);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record the refund.');
    } finally {
      setLoading(false);
    }
  };

  if (!returnNote) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Vendor Paid Us Back</DialogTitle>

      <DialogContent dividers>
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 2 }}>
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Return Note</Typography>
              <Typography variant="body2" fontWeight={600}>{returnNote.return_number}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Vendor</Typography>
              <Typography variant="body2" fontWeight={600}>{returnNote.vendor_name}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Return Value</Typography>
              <Typography variant="body2">{formatCurrency(returnNote.return_amount)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Still Unsettled</Typography>
              <Typography variant="body2" fontWeight={700} color="warning.main">
                {formatCurrency(open_)}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          Use this only when the vendor actually returned the money. If they gave
          credit against a future bill instead, use <strong>Apply Credit to a Bill</strong>.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Amount Received"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
              disabled={loading}
              required
              helperText={`Maximum ${formatCurrency(open_)}`}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Date Received"
              type="date"
              value={refundDate}
              onChange={(e) => setRefundDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={loading}
              required
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <PaymentSourcePicker
          value={source}
          onChange={setSource}
          disabled={loading}
          direction="in"
        />

        <TextField
          fullWidth
          size="small"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
          disabled={loading}
          sx={{ mt: 1 }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading || open_ <= 0}>
          {loading ? 'Recording...' : 'Record Refund'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VendorRefundDialog;
