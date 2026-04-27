import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
  Chip,
  TextField,
  Alert,
  Divider,
} from '@mui/material';
import { formatDate } from '../../utils/formatters';
import lotService from '../../services/lotService';
import { allocateLots } from '../../services/orderService';
import { toast } from 'react-toastify';

const LotSelectionDialog = ({ open, order, onClose, onAllocated }) => {
  const [lotsBySkuId, setLotsBySkuId] = useState({});
  const [loadingLots, setLoadingLots] = useState(false);
  // selections: { [item_id]: { lot_id, quantity } }
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const unallocatedItems = (order?.items || []).filter(
    (item) => !item.lot_id && !item.lot_number
  );

  // Use delivery_date if set; fall back to today (walk-in / no delivery date)
  const deliveryDate = order?.delivery_date
    ? order.delivery_date.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const fetchAvailableLots = useCallback(async () => {
    if (!open || unallocatedItems.length === 0) return;

    setLoadingLots(true);
    setLotsBySkuId({});
    setSelections({});

    const uniqueSkuIds = [...new Set(unallocatedItems.map((i) => i.sku_id))];
    const results = {};

    await Promise.all(
      uniqueSkuIds.map(async (skuId) => {
        try {
          const response = await lotService.getAllLots({
            sku_id: skuId,
            ready_date_to: deliveryDate,
            available_only: 'true',
            sort_by: 'planted_date',
            sort_order: 'asc',
            limit: 50,
          });
          results[skuId] = response.data || response.lots || [];
        } catch {
          results[skuId] = [];
        }
      })
    );

    setLotsBySkuId(results);
    setLoadingLots(false);
  }, [open, order?.id]);

  useEffect(() => {
    if (open) fetchAvailableLots();
  }, [open, fetchAvailableLots]);

  const handleLotSelect = (itemId, lotId, skuId) => {
    const lots = lotsBySkuId[skuId] || [];
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return;
    const item = unallocatedItems.find((i) => i.id === itemId);
    const defaultQty = Math.min(item?.quantity || 0, lot.available_quantity);
    setSelections((prev) => ({ ...prev, [itemId]: { lot_id: lotId, quantity: defaultQty } }));
  };

  const handleQuantityChange = (itemId, value, maxQty) => {
    const qty = Math.max(1, Math.min(parseInt(value) || 1, maxQty));
    setSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], quantity: qty } }));
  };

  const allItemsSelected = unallocatedItems.every(
    (item) => selections[item.id]?.lot_id && selections[item.id]?.quantity > 0
  );

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const allocations = unallocatedItems
        .filter((item) => selections[item.id]?.lot_id)
        .map((item) => ({
          item_id: item.id,
          lot_id: selections[item.id].lot_id,
          quantity: selections[item.id].quantity,
        }));

      await allocateLots(order.id, { allocations });
      toast.success('Lots allocated successfully');
      onAllocated();
      onClose();
    } catch (error) {
      const msg = error?.error?.message || error?.message || 'Allocation failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoAllocate = async () => {
    setSubmitting(true);
    try {
      await allocateLots(order.id, { auto: true });
      toast.success('Lots allocated successfully');
      onAllocated();
      onClose();
    } catch (error) {
      const msg = error?.error?.message || error?.message || 'Allocation failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={submitting}
    >
      <DialogTitle>Select Lots for Allocation</DialogTitle>

      <DialogContent dividers>
        {loadingLots ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : unallocatedItems.length === 0 ? (
          <Typography color="text.secondary">All items are already allocated.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {unallocatedItems.map((item, idx) => {
              const lots = lotsBySkuId[item.sku_id] || [];
              const selection = selections[item.id];
              const selectedLot = lots.find((l) => l.id === selection?.lot_id);
              const isPartial = selectedLot && selection.quantity < item.quantity;

              return (
                <Box key={item.id}>
                  {idx > 0 && <Divider sx={{ mb: 3 }} />}

                  {/* Item header */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {item.product_name} — {item.variety || item.sku_code || item.sku_variety || '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Quantity needed: <strong>{item.quantity}</strong>
                    </Typography>
                  </Box>

                  {lots.length === 0 ? (
                    <Alert severity="warning">
                      No lots available by {formatDate(deliveryDate)}. Use Auto Allocate or adjust the
                      delivery date.
                    </Alert>
                  ) : (
                    <>
                      <RadioGroup
                        value={selection?.lot_id || ''}
                        onChange={(e) => handleLotSelect(item.id, e.target.value, item.sku_id)}
                      >
                        {lots.map((lot) => {
                          const isSufficient = lot.available_quantity >= item.quantity;
                          const isSelected = selection?.lot_id === lot.id;
                          return (
                            <FormControlLabel
                              key={lot.id}
                              value={lot.id}
                              control={<Radio size="small" />}
                              label={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 1.5,
                                    py: 0.5,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    fontWeight="medium"
                                    sx={{ minWidth: 150 }}
                                  >
                                    {lot.lot_number}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ minWidth: 130 }}
                                  >
                                    Created: {formatDate(lot.planted_date || lot.created_at)}
                                  </Typography>
                                  <Chip
                                    label={`${lot.available_quantity} available`}
                                    size="small"
                                    color={isSufficient ? 'success' : 'warning'}
                                    variant="outlined"
                                  />
                                  <Typography variant="body2" color="text.secondary">
                                    Ready: {formatDate(lot.expected_ready_date)}
                                  </Typography>
                                  {lot.current_location && (
                                    <Typography variant="caption" color="text.secondary">
                                      @ {lot.current_location}
                                    </Typography>
                                  )}
                                </Box>
                              }
                              sx={{
                                border: '1px solid',
                                borderColor: isSelected ? 'primary.main' : 'divider',
                                borderRadius: 1,
                                mb: 1,
                                mx: 0,
                                px: 1,
                                bgcolor: isSelected ? 'action.selected' : 'transparent',
                                transition: 'background-color 0.15s, border-color 0.15s',
                              }}
                            />
                          );
                        })}
                      </RadioGroup>

                      {selection?.lot_id && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                          <Typography variant="body2" color="text.secondary">
                            Quantity to allocate:
                          </Typography>
                          <TextField
                            type="number"
                            size="small"
                            value={selection.quantity}
                            onChange={(e) =>
                              handleQuantityChange(
                                item.id,
                                e.target.value,
                                selectedLot?.available_quantity || item.quantity
                              )
                            }
                            inputProps={{
                              min: 1,
                              max: selectedLot?.available_quantity || item.quantity,
                            }}
                            sx={{ width: 110 }}
                          />
                          {isPartial && (
                            <Typography variant="caption" color="warning.main">
                              Partial — {item.quantity - selection.quantity} units will remain
                              unallocated
                            </Typography>
                          )}
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          onClick={handleAutoAllocate}
          disabled={submitting || loadingLots}
          sx={{ mr: 1 }}
        >
          {submitting ? <CircularProgress size={18} /> : 'Auto Allocate (FIFO)'}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!allItemsSelected || submitting || loadingLots}
        >
          {submitting ? <CircularProgress size={18} /> : 'Confirm Selection'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LotSelectionDialog;
