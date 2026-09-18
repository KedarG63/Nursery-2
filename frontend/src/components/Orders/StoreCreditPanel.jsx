import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import { CardGiftcard as CreditIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import customerReturnService from '../../services/customerReturnService';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

/**
 * StoreCreditPanel
 *
 * Shows the customer's store credit on an order, and lets a person spend it
 * against that order.
 *
 * Applying is deliberately explicit and confirmed, never automatic. Credit that
 * is silently consumed cannot be explained to a customer standing at the
 * counter, and an order whose balance changed on its own is the kind of thing
 * that gets reconciled by guesswork later. The button states the amount, and
 * the dialog restates it before anything is written.
 *
 * Props:
 *   order     – order row (needs id, customer_id, total_amount, paid_amount, credit_applied)
 *   onApplied – () => void  called after credit is applied, to refresh the order
 */
const StoreCreditPanel = ({ order, onApplied }) => {
  const { user } = useSelector((state) => state.auth);
  const canWrite = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applied = parseFloat(order?.credit_applied || 0);
  const outstanding = Math.max(
    0,
    parseFloat(order?.total_amount || 0)
      - parseFloat(order?.paid_amount || 0)
      - applied
  );
  // Never offer more than the order can absorb — the server enforces both
  // limits, but the button should not promise something it cannot do.
  const applicable = Math.min(balance, outstanding);

  const fetchBalance = useCallback(async () => {
    if (!order?.customer_id) return;
    try {
      const res = await customerReturnService.getStoreCredit(order.customer_id);
      setBalance(parseFloat(res.data?.balance || 0));
    } catch (err) {
      console.error('Failed to load store credit:', err);
    } finally {
      setLoading(false);
    }
  }, [order?.customer_id]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const openDialog = () => {
    setAmount(applicable.toFixed(2));
    setError('');
    setDialogOpen(true);
  };

  const handleApply = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!(amt > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (amt > applicable + 0.005) {
      setError(`At most ${formatCurrency(applicable)} can be applied to this order.`);
      return;
    }

    setSaving(true);
    try {
      const result = await customerReturnService.applyStoreCredit(order.id, amt);
      toast.success(result.message || 'Store credit applied');
      setDialogOpen(false);
      await fetchBalance();
      onApplied?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply store credit.');
    } finally {
      setSaving(false);
    }
  };

  // Nothing to show: no credit available and none ever applied here.
  if (loading || (balance <= 0.005 && applied <= 0.005)) return null;

  return (
    <>
      <Paper sx={{ p: 2, mb: 3, borderLeft: 4, borderColor: 'info.main' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CreditIcon color="info" />
            <Box>
              <Typography variant="subtitle2">Store Credit</Typography>
              <Typography variant="body2" color="text.secondary">
                {balance > 0.005
                  ? <>This customer has <strong>{formatCurrency(balance)}</strong> available from earlier returns.</>
                  : 'No credit remaining on this customer.'}
              </Typography>
              {applied > 0.005 && (
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ mt: 0.5 }}
                  label={`${formatCurrency(applied)} already applied to this order`}
                />
              )}
            </Box>
          </Box>

          {canWrite && applicable > 0.005 && (
            <Button variant="contained" color="info" onClick={openDialog}>
              Apply {formatCurrency(applicable)}
            </Button>
          )}
        </Box>

        {balance > 0.005 && outstanding <= 0.005 && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Nothing is outstanding on this order, so the credit stays on the
            customer's account for a future one.
          </Alert>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={saving ? undefined : () => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apply Store Credit?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This reduces what the customer owes on order{' '}
            <strong>{order?.order_number}</strong>. No money changes hands.
          </Typography>

          <Box sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Credit available</Typography>
              <Typography variant="caption" fontWeight={600}>{formatCurrency(balance)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Outstanding on this order</Typography>
              <Typography variant="caption" fontWeight={600}>{formatCurrency(outstanding)}</Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Most that can be applied</Typography>
              <Typography variant="caption" fontWeight={700}>{formatCurrency(applicable)}</Typography>
            </Box>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth
            size="small"
            label="Amount to Apply"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, step: '0.01' }}
            disabled={saving}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" color="info" onClick={handleApply} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Apply Credit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default StoreCreditPanel;
