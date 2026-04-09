import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Autocomplete,
  Alert,
  Chip,
} from '@mui/material';
import { Close as CloseIcon, Warning as WarningIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import lotService from '../../services/lotService';
import skuService from '../../services/skuService';
import purchaseService from '../../services/purchaseService';

// Validation schema
const lotSchema = z.object({
  sku_id: z.string().min(1, 'SKU is required'),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .min(1, 'Quantity must be at least 1'),
  current_location: z.enum(['greenhouse', 'field', 'warehouse', 'transit'], {
    errorMap: () => ({ message: 'Please select a location' }),
  }),
  growth_stage: z.enum(['seed', 'germination', 'seedling', 'transplant', 'ready'], {
    errorMap: () => ({ message: 'Please select a stage' }),
  }),
  planted_date: z.string().min(1, 'Planted date is required'),
  notes: z.string().max(500, 'Notes must be less than 500 characters').optional(),
});

const LotForm = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [skus, setSkus] = useState([]);
  const [loadingSKUs, setLoadingSKUs] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState(null);
  const [availableSeeds, setAvailableSeeds] = useState([]);
  const [loadingSeeds, setLoadingSeeds] = useState(false);
  const [seedAvailabilityChecked, setSeedAvailabilityChecked] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');

  const stages = lotService.getStages();

  const defaultValues = {
    sku_id: '',
    quantity: 1,
    current_location: 'greenhouse',
    growth_stage: 'seed',
    planted_date: new Date().toISOString().split('T')[0],
    notes: '',
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm({
    resolver: zodResolver(lotSchema),
    defaultValues,
  });

  // Reset form and fetch SKUs when dialog opens
  useEffect(() => {
    if (open) {
      reset(defaultValues);
      fetchSKUs();
    }
  }, [open]);

  const fetchSKUs = async () => {
    setLoadingSKUs(true);
    try {
      const response = await skuService.getAllSKUs({ limit: 1000 });
      setSkus(response.data || response.skus || []);
    } catch (error) {
      console.error('Failed to fetch SKUs:', error);
      toast.error('Failed to load SKUs');
    } finally {
      setLoadingSKUs(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const lotData = {
        ...data,
        notes: data.notes || undefined,
        seed_purchase_id: selectedPurchaseId || undefined,
      };

      await lotService.createLot(lotData);
      toast.success('Lot created successfully');

      reset(defaultValues);
      setSelectedSKU(null);
      setSelectedPurchaseId('');
      onSuccess && onSuccess();
    } catch (error) {
      console.error('Failed to create lot:', error);
      toast.error(error.response?.data?.message || 'Failed to create lot');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset(defaultValues);
      setSelectedSKU(null);
      setSelectedPurchaseId('');
      onClose();
    }
  };

  const handleSKUChange = (event, newValue) => {
    setSelectedSKU(newValue);
    setSelectedPurchaseId('');
    setValue('sku_id', newValue?.id || '');

    if (newValue && newValue.product_id) {
      loadAvailablePurchases(newValue.product_id, newValue.id);
    } else {
      setAvailableSeeds([]);
      setSeedAvailabilityChecked(false);
    }
  };

  const loadAvailablePurchases = async (productId, skuId = null) => {
    setLoadingSeeds(true);
    setSeedAvailabilityChecked(false);
    try {
      const response = await purchaseService.getAvailableForLot(productId, skuId);
      setAvailableSeeds(response.data || []);
      setSeedAvailabilityChecked(true);
    } catch (error) {
      console.error('Failed to load seed purchases:', error);
      setAvailableSeeds([]);
      setSeedAvailabilityChecked(true);
    } finally {
      setLoadingSeeds(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Create Lot</Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* SKU Autocomplete */}
            <Controller
              name="sku_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  options={skus}
                  getOptionLabel={(option) => {
                    const variety = option.variety || option.sku_code || '';
                    const productName = option.product_name || option.product?.name;
                    return productName ? `${productName} — ${variety}` : variety;
                  }}
                  loading={loadingSKUs}
                  value={selectedSKU}
                  onChange={handleSKUChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="SKU"
                      required
                      error={!!errors.sku_id}
                      helperText={errors.sku_id?.message}
                      disabled={loading}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingSKUs ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                />
              )}
            />

            {/* Quantity */}
            <Controller
              name="quantity"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Quantity"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseInt(e.target.value, 10) || 1)}
                  error={!!errors.quantity}
                  helperText={errors.quantity?.message}
                  disabled={loading}
                  inputProps={{ min: 1 }}
                />
              )}
            />

            {/* Location */}
            <Controller
              name="current_location"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Location"
                  required
                  fullWidth
                  error={!!errors.current_location}
                  helperText={errors.current_location?.message}
                  disabled={loading}
                >
                  <MenuItem value="greenhouse">Greenhouse</MenuItem>
                  <MenuItem value="field">Field</MenuItem>
                  <MenuItem value="warehouse">Warehouse</MenuItem>
                  <MenuItem value="transit">Transit</MenuItem>
                </TextField>
              )}
            />

            {/* Growth Stage */}
            <Controller
              name="growth_stage"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Growth Stage"
                  required
                  fullWidth
                  error={!!errors.growth_stage}
                  helperText={errors.growth_stage?.message}
                  disabled={loading}
                >
                  {stages.map((stage) => (
                    <MenuItem key={stage} value={stage}>
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            {/* Planted Date */}
            <Controller
              name="planted_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Planted Date"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.planted_date}
                  helperText={errors.planted_date?.message}
                  disabled={loading}
                />
              )}
            />

            {/* Notes */}
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Notes (Optional)"
                  multiline
                  rows={3}
                  fullWidth
                  placeholder="Additional notes about this lot..."
                  error={!!errors.notes}
                  helperText={errors.notes?.message}
                  disabled={loading}
                />
              )}
            />

            {/* Seed Purchase Selection */}
            {selectedSKU && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Seed Purchase
                </Typography>

                {loadingSeeds ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="textSecondary">
                      Loading available purchases...
                    </Typography>
                  </Box>
                ) : seedAvailabilityChecked ? (
                  availableSeeds.length > 0 ? (
                    <TextField
                      select
                      fullWidth
                      label="Select Seed Purchase (optional — auto-selects if blank)"
                      value={selectedPurchaseId}
                      onChange={(e) => setSelectedPurchaseId(e.target.value)}
                      disabled={loading}
                    >
                      <MenuItem value="">
                        <em>Auto-select (use earliest expiry)</em>
                      </MenuItem>
                      {availableSeeds.map((purchase) => (
                        <MenuItem key={purchase.id} value={purchase.id}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" fontWeight="medium">
                                {purchase.seed_lot_number || purchase.purchase_number}
                              </Typography>
                              <Chip
                                label={`${purchase.seeds_remaining} seeds`}
                                size="small"
                                color={purchase.inventory_status === 'low_stock' ? 'warning' : 'success'}
                              />
                            </Box>
                            <Typography variant="caption" color="textSecondary">
                              {purchase.vendor_name} · Expiry: {formatDate(purchase.expiry_date)}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Alert severity="warning" icon={<WarningIcon />}>
                      <Typography variant="body2">
                        No seeds available for this product. Consider purchasing seeds first.
                      </Typography>
                    </Alert>
                  )
                ) : null}
              </Box>
            )}

            {/* Info Text */}
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="textSecondary">
                Note: Lot number will be auto-generated by the system
              </Typography>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading && <CircularProgress size={20} />}
          >
            {loading ? 'Creating...' : 'Create Lot'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default LotForm;
