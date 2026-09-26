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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Payments as RefundIcon,
  CardGiftcard as CreditIcon,
} from '@mui/icons-material';
import PaymentSourcePicker, {
  validatePaymentSource,
  paymentSourcePayload,
  emptyPaymentSource,
} from '../Common/PaymentSourcePicker';
import customerReturnService from '../../services/customerReturnService';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

/**
 * ReturnSettlementDialog
 *
 * Settles the part of an accepted return that is genuinely owed back to the
 * customer — that is, what they had already paid for the plants they brought in.
 *
 * What is NOT settled here: the part that cancelled an unpaid balance. That
 * offset is arithmetic (min(value, outstanding)) and is posted automatically on
 * acceptance, precisely so nobody can hand out cash for an order that was never
 * paid for. Only the remainder is a human decision, and it is this dialog.
 *
 * Props:
 *   open       – boolean
 *   returnNote – accepted note, needs id, return_number, open_balance, customer_name
 *   onClose    – () => void
 *   onSettled  – (result) => void
 */
const ReturnSettlementDialog = ({ open, returnNote, onClose, onSettled }) => {
  const [mode, setMode] = useState('refund'); // 'refund' | 'store_credit'
  const [amount, setAmount] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState(emptyPaymentSource);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const owed = parseFloat(returnNote?.open_balance ?? 0);
  // Every counter sale shares one "Walk-in Customer" record, so credit kept on
  // it could be spent by whoever is at the counter next. The server refuses it
  // too; hiding the option here saves staff from a dead end.
  const isWalkIn = (returnNote?.customer_name || '').trim().toLowerCase() === 'walk-in customer';

  useEffect(() => {
    if (!open) return;
    setMode('refund');
    setAmount(owed > 0 ? owed.toFixed(2) : '');
    setRefundDate(new Date().toISOString().split('T')[0]);
    setSource(emptyPaymentSource);
    setNotes('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, returnNote?.id]);

  const handleSubmit = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (amt > owed + 0.005) {
      setError(`Only ${formatCurrency(owed)} is owed back on this return.`);
      return;
    }

    if (mode === 'refund') {
      const sourceError = validatePaymentSource(source);
      if (sourceError) { setError(sourceError); return; }
    }

    setSaving(true);
    try {
      const result = mode === 'refund'
        ? await customerReturnService.recordRefund(returnNote.id, {
            amount: amt,
            refund_date: refundDate,
            notes: notes || undefined,
            ...paymentSourcePayload(source),
          })
        : await customerReturnService.issueStoreCredit(returnNote.id, amt, notes || undefined);

      onSettled?.(result);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to settle the return.');
    } finally {
      setSaving(false);
    }
  };

  if (!returnNote) return null;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settle What Is Owed Back</DialogTitle>

      <DialogContent dividers>
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 2 }}>
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Return</Typography>
              <Typography variant="body2" fontWeight={600}>{returnNote.return_number}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Customer</Typography>
              <Typography variant="body2" fontWeight={600}>{returnNote.customer_name}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Return Value</Typography>
              <Typography variant="body2">{formatCurrency(returnNote.return_amount)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Owed Back</Typography>
              <Typography variant="body2" fontWeight={700} color="warning.main">
                {formatCurrency(owed)}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {parseFloat(returnNote.offset_total || 0) > 0 && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {formatCurrency(returnNote.offset_total)} of this return already cancelled
            what the customer still owed on the order. Only the rest is settled here.
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          How is this settled?
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={mode}
          disabled={saving}
          onChange={(e, next) => next && setMode(next)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="refund">
            <RefundIcon fontSize="small" sx={{ mr: 0.5 }} /> Pay the customer
          </ToggleButton>
          <ToggleButton value="store_credit" disabled={isWalkIn}>
            <CreditIcon fontSize="small" sx={{ mr: 0.5 }} /> Keep as store credit
          </ToggleButton>
        </ToggleButtonGroup>
        {isWalkIn && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: -1, mb: 2 }}>
            Walk-in customers share one account, so their returns are always refunded.
          </Typography>
        )}

        <Alert severity="info" sx={{ mb: 2 }}>
          {mode === 'refund'
            ? 'Money leaves the business now. It will appear in the cash drawer or bank account you choose.'
            : 'No money moves. The amount is held on the customer’s account and can be applied to a future order.'}
        </Alert>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={mode === 'refund' ? 6 : 12}>
            <TextField
              fullWidth
              size="small"
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
              disabled={saving}
              required
              helperText={`Maximum ${formatCurrency(owed)}`}
            />
          </Grid>
          {mode === 'refund' && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Refund Date"
                type="date"
                value={refundDate}
                onChange={(e) => setRefundDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                disabled={saving}
                required
              />
            </Grid>
          )}
        </Grid>

        {mode === 'refund' && (
          <>
            <Divider sx={{ my: 2 }} />
            <PaymentSourcePicker
              value={source}
              onChange={setSource}
              disabled={saving}
              direction="out"
            />
          </>
        )}

        <TextField
          fullWidth
          size="small"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
          disabled={saving}
          sx={{ mt: 1 }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || owed <= 0}>
          {saving
            ? 'Saving...'
            : mode === 'refund' ? 'Record Refund' : 'Keep as Store Credit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnSettlementDialog;
