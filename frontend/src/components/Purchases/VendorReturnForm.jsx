import React, { useState } from 'react';
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
import vendorReturnService from '../../services/vendorReturnService';

/**
 * VendorReturnForm
 *
 * Dialog for creating a vendor return note against a seed purchase.
 * Shows purchase context (vendor, product, cost per packet, remaining packets)
 * so the user can see what's available to return.
 *
 * Props:
 *   open              – boolean
 *   purchase          – seed_purchase row (with vendor_name, product_name, etc.)
 *   onClose           – () => void
 *   onCreated         – (returnNote) => void  — called after successful creation
 */
const VendorReturnForm = ({ open, purchase, onClose, onCreated }) => {
  const [packetsReturned, setPacketsReturned] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!purchase) return null;

  const packetsAvailable =
    (parseInt(purchase.number_of_packets) || 0) -
    (parseInt(purchase.packets_returned) || 0);

  const costPerPacket = parseFloat(purchase.cost_per_packet) || 0;
  const returnAmount  = (parseInt(packetsReturned) || 0) * costPerPacket;

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

  const handleSubmit = async () => {
    setError('');
    if (!packetsReturned || parseInt(packetsReturned) <= 0) {
      setError('Enter a valid number of packets to return.');
      return;
    }
    if (parseInt(packetsReturned) > packetsAvailable) {
      setError(`Cannot return more than ${packetsAvailable} available packets.`);
      return;
    }

    setLoading(true);
    try {
      const result = await vendorReturnService.createReturn({
        seed_purchase_id: purchase.id,
        return_date:      returnDate,
        packets_returned: parseInt(packetsReturned),
        reason:           reason || undefined,
        notes:            notes  || undefined,
      });
      onCreated?.(result.data);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create return note.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setPacketsReturned('');
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setNotes('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Return Seeds to Vendor</DialogTitle>

      <DialogContent dividers>
        {/* Purchase context */}
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 3 }}>
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Purchase</Typography>
              <Typography variant="body2" fontWeight={600}>{purchase.purchase_number}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Vendor</Typography>
              <Typography variant="body2" fontWeight={600}>{purchase.vendor_name}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Product</Typography>
              <Typography variant="body2">{purchase.product_name}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Seed Lot</Typography>
              <Typography variant="body2">{purchase.seed_lot_number}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Cost / Packet</Typography>
              <Typography variant="body2">{formatCurrency(costPerPacket)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Packets Available to Return</Typography>
              <Typography variant="body2" fontWeight={600} color={packetsAvailable === 0 ? 'error.main' : 'success.main'}>
                {packetsAvailable}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {packetsAvailable === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            All packets have already been returned for this purchase.
          </Alert>
        )}

        <Divider sx={{ mb: 2 }} />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Packets to Return"
              type="number"
              value={packetsReturned}
              onChange={(e) => setPacketsReturned(e.target.value)}
              inputProps={{ min: 1, max: packetsAvailable }}
              disabled={packetsAvailable === 0 || loading}
              required
              helperText={`Max: ${packetsAvailable} packets`}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Return Date"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={loading}
              required
            />
          </Grid>

          {/* Calculated return amount */}
          {parseInt(packetsReturned) > 0 && (
            <Grid item xs={12}>
              <Box sx={{ bgcolor: 'primary.50', border: 1, borderColor: 'primary.200', borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" color="text.secondary">Return Amount</Typography>
                <Typography variant="h6" color="primary.main" fontWeight={700}>
                  {formatCurrency(returnAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {packetsReturned} packets × {formatCurrency(costPerPacket)} / packet
                </Typography>
              </Box>
            </Grid>
          )}

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Reason for Return"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approaching expiry, excess stock"
              disabled={loading}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Additional Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              disabled={loading}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || packetsAvailable === 0}
        >
          {loading ? 'Creating...' : 'Create Return Note'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VendorReturnForm;
