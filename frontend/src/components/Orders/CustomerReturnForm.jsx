import { useState, useEffect, Fragment } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  MenuItem,
  CircularProgress,
  Chip,
} from '@mui/material';
import customerReturnService from '../../services/customerReturnService';
import lotService from '../../services/lotService';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

/**
 * CustomerReturnForm
 *
 * Records plants a customer brought back, against the order they were sold on.
 * Creates a DRAFT only — nothing moves in stock or money until it is accepted.
 *
 * Returns are taken only if the plants are resellable, so every accepted return
 * restocks. That is a business rule, not a UI convenience: there is no scrap
 * path, and the note below says so where staff will read it.
 *
 * Props:
 *   open      – boolean
 *   orderId   – uuid
 *   onClose   – () => void
 *   onCreated – (note) => void
 */
const CustomerReturnForm = ({ open, orderId, onClose, onCreated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  // order_item_id -> { checked, quantity, lot_id }
  const [selection, setSelection] = useState({});
  // sku_id -> lot list, for items sold without an allocated lot
  const [lotsBySku, setLotsBySku] = useState({});

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !orderId) return;

    setLoading(true);
    setError('');
    setSelection({});
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setNotes('');

    customerReturnService
      .getReturnable(orderId)
      .then(async (res) => {
        const data = res.data || {};
        setOrder(data.order || null);
        const list = data.items || [];
        setItems(list);

        // Items sold without a lot need an explicit destination lot, so load
        // the candidate lots for just those SKUs.
        const needLot = [...new Set(list.filter((i) => !i.lot_id && i.returnable > 0).map((i) => i.sku_id))];
        const loaded = {};
        await Promise.all(
          needLot.map(async (skuId) => {
            try {
              const r = await lotService.getAllLots({ sku_id: skuId, limit: 100 });
              loaded[skuId] = r.data || r.lots || [];
            } catch {
              loaded[skuId] = [];
            }
          })
        );
        setLotsBySku(loaded);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the order.'))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  const toggle = (item) => {
    setSelection((prev) => {
      const cur = prev[item.order_item_id];
      if (cur?.checked) {
        return { ...prev, [item.order_item_id]: { ...cur, checked: false } };
      }
      return {
        ...prev,
        [item.order_item_id]: {
          checked: true,
          quantity: cur?.quantity ?? String(item.returnable),
          lot_id: cur?.lot_id ?? item.lot_id ?? '',
        },
      };
    });
  };

  const update = (orderItemId, patch) =>
    setSelection((prev) => ({ ...prev, [orderItemId]: { ...prev[orderItemId], ...patch } }));

  const chosen = items.filter((i) => selection[i.order_item_id]?.checked);

  // Gross value only — the real, prorated value is computed by the server on
  // acceptance. Showing a precise-looking number here that later differs would
  // be worse than showing an explicitly approximate one.
  const grossEstimate = chosen.reduce((sum, i) => {
    const q = parseInt(selection[i.order_item_id]?.quantity, 10) || 0;
    return sum + q * parseFloat(i.unit_price || 0);
  }, 0);

  const validate = () => {
    if (chosen.length === 0) return 'Select at least one item to return.';
    for (const i of chosen) {
      const sel = selection[i.order_item_id];
      const q = parseInt(sel.quantity, 10);
      if (!Number.isInteger(q) || q <= 0) {
        return `${i.product_name}: enter a whole number of plants above zero.`;
      }
      if (q > i.returnable) {
        return `${i.product_name}: only ${i.returnable} can still be returned.`;
      }
      if (!i.lot_id && !sel.lot_id) {
        return `${i.product_name}: choose the lot the returned plants go into.`;
      }
    }
    return '';
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); return; }

    setError('');
    setSaving(true);
    try {
      const payload = {
        order_id: orderId,
        return_date: returnDate,
        reason: reason || undefined,
        notes: notes || undefined,
        items: chosen.map((i) => ({
          order_item_id: i.order_item_id,
          quantity: parseInt(selection[i.order_item_id].quantity, 10),
          // Sent only when the sale had no lot of its own.
          ...(i.lot_id ? {} : { lot_id: selection[i.order_item_id].lot_id }),
        })),
      };
      const result = await customerReturnService.createReturn(payload);
      onCreated?.(result.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create the return.');
    } finally {
      setSaving(false);
    }
  };

  const nothingReturnable = !loading && items.length > 0 && items.every((i) => i.returnable <= 0);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Record a Customer Return</DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {order && (
              <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 2 }}>
                <Grid container spacing={1}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Order</Typography>
                    <Typography variant="body2" fontWeight={600}>{order.order_number}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Customer</Typography>
                    <Typography variant="body2" fontWeight={600}>{order.customer_name}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Order Total</Typography>
                    <Typography variant="body2">{formatCurrency(order.total_amount)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Still Unpaid</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(order.balance_amount)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            )}

            <Alert severity="info" sx={{ mb: 2 }}>
              Take plants back only if they can be sold again. Dead or damaged plants
              are not accepted — everything recorded here goes back into stock.
            </Alert>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {nothingReturnable && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Everything on this order has already been returned.
              </Alert>
            )}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Plant</TableCell>
                    <TableCell align="right">Sold</TableCell>
                    <TableCell align="right">Already Returned</TableCell>
                    <TableCell align="right">Can Return</TableCell>
                    <TableCell align="right" sx={{ width: 110 }}>Returning</TableCell>
                    <TableCell align="right">Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((i) => {
                    const sel = selection[i.order_item_id];
                    const disabled = i.returnable <= 0;
                    return (
                      <Fragment key={i.order_item_id}>
                        <TableRow hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={Boolean(sel?.checked)}
                              disabled={disabled || saving}
                              onChange={() => toggle(i)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{i.product_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {i.sku_code}{i.variety ? ` · ${i.variety}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{i.sold}</TableCell>
                          <TableCell align="right">
                            {i.already_returned > 0
                              ? <Chip size="small" label={i.already_returned} />
                              : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              color={disabled ? 'text.disabled' : 'success.main'}
                              fontWeight={600}
                            >
                              {i.returnable}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={sel?.checked ? sel.quantity : ''}
                              disabled={!sel?.checked || saving}
                              onChange={(e) => update(i.order_item_id, { quantity: e.target.value })}
                              inputProps={{ min: 1, max: i.returnable, style: { textAlign: 'right' } }}
                            />
                          </TableCell>
                          <TableCell align="right">{formatCurrency(i.unit_price)}</TableCell>
                        </TableRow>

                        {/* Sold without a lot — the plants need somewhere to go. */}
                        {sel?.checked && !i.lot_id && (
                          <TableRow>
                            <TableCell />
                            <TableCell colSpan={6}>
                              <TextField
                                select
                                fullWidth
                                size="small"
                                required
                                label="Lot the returned plants go into"
                                value={sel.lot_id || ''}
                                disabled={saving}
                                onChange={(e) => update(i.order_item_id, { lot_id: e.target.value })}
                                helperText={
                                  (lotsBySku[i.sku_id] || []).length === 0
                                    ? 'No lots found for this plant — create one first'
                                    : 'This sale was not linked to a lot, so choose where these plants should go'
                                }
                              >
                                {(lotsBySku[i.sku_id] || []).map((l) => (
                                  <MenuItem key={l.id} value={l.id}>
                                    {l.lot_number} — {l.available_quantity ?? l.quantity} available
                                  </MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {chosen.length > 0 && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'primary.50', border: 1, borderColor: 'primary.200', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Approximate return value
                </Typography>
                <Typography variant="h6" color="primary.main" fontWeight={700}>
                  {formatCurrency(grossEstimate)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Any discount on the order is applied when the return is accepted, so the
                  final value may be lower than this.
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Return Date"
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={saving}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  size="small"
                  label="Reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Customer ordered too many"
                  disabled={saving}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  rows={2}
                  disabled={saving}
                />
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || loading || chosen.length === 0}
        >
          {saving ? 'Saving...' : 'Create Return'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerReturnForm;
