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
  Grid,
  CircularProgress,
  IconButton,
  Autocomplete,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import purchaseService from '../../services/purchaseService';
import vendorService from '../../services/vendorService';
import productService from '../../services/productService';
import skuService from '../../services/skuService';

// Validation schema
const purchaseSchema = z.object({
  vendor_id: z.string().min(1, 'Vendor is required'),
  product_id: z.string().min(1, 'Product is required'),
  sku_id: z.string().optional(),
  seed_lot_number: z.string().min(1, 'Seed lot number is required').max(100),
  number_of_packets: z.number().min(1, 'Number of packets must be at least 1'),
  seeds_per_packet: z.number().min(1, 'Seeds per packet must be at least 1'),
  cost_per_packet: z.number().min(0.01, 'Cost per packet must be greater than 0'),
  shipping_cost: z.number().min(0).optional(),
  tax_amount: z.number().min(0).optional(),
  other_charges: z.number().min(0).optional(),
  germination_rate: z.number().min(0).max(100).optional(),
  purity_percentage: z.number().min(0).max(100).optional(),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  invoice_number: z.string().optional(),
  invoice_date: z.string().optional(),
  storage_location: z.string().optional(),
  storage_conditions: z.string().optional(),
  notes: z.string().optional(),
  quality_notes: z.string().optional(),
});

const PurchaseForm = ({ open, onClose, onSuccess, purchase }) => {
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSKUs, setLoadingSKUs] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const isEditMode = Boolean(purchase);

  const defaultValues = {
    vendor_id: '',
    product_id: '',
    sku_id: '',
    seed_lot_number: '',
    number_of_packets: 1,
    seeds_per_packet: 100,
    cost_per_packet: 0,
    shipping_cost: 0,
    tax_amount: 0,
    other_charges: 0,
    germination_rate: 85,
    purity_percentage: 95,
    expiry_date: '',
    purchase_date: new Date().toISOString().split('T')[0],
    invoice_number: '',
    invoice_date: '',
    storage_location: '',
    storage_conditions: '',
    notes: '',
    quality_notes: '',
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(purchaseSchema),
    defaultValues,
  });

  const watchProductId = watch('product_id');
  const watchPackets = watch('number_of_packets');
  const watchSeedsPerPacket = watch('seeds_per_packet');
  const watchCostPerPacket = watch('cost_per_packet');
  const watchShipping = watch('shipping_cost');
  const watchTax = watch('tax_amount');
  const watchOther = watch('other_charges');

  // Calculate totals
  const totalSeeds = (watchPackets || 0) * (watchSeedsPerPacket || 0);
  const totalCost = (watchPackets || 0) * (watchCostPerPacket || 0);
  const grandTotal = totalCost + (watchShipping || 0) + (watchTax || 0) + (watchOther || 0);
  const costPerSeed = watchSeedsPerPacket > 0 ? (watchCostPerPacket / watchSeedsPerPacket).toFixed(4) : 0;

  useEffect(() => {
    if (open) {
      fetchVendors();
      fetchProducts();
      if (purchase) {
        reset({
          vendor_id: purchase.vendor_id || '',
          product_id: purchase.product_id || '',
          sku_id: purchase.sku_id || '',
          seed_lot_number: purchase.seed_lot_number || '',
          number_of_packets: purchase.number_of_packets || 1,
          seeds_per_packet: purchase.seeds_per_packet || 100,
          cost_per_packet: purchase.cost_per_packet || 0,
          shipping_cost: purchase.shipping_cost || 0,
          tax_amount: purchase.tax_amount || 0,
          other_charges: purchase.other_charges || 0,
          germination_rate: purchase.germination_rate || 85,
          purity_percentage: purchase.purity_percentage || 95,
          expiry_date: purchase.expiry_date?.split('T')[0] || '',
          purchase_date: purchase.purchase_date?.split('T')[0] || new Date().toISOString().split('T')[0],
          invoice_number: purchase.invoice_number || '',
          invoice_date: purchase.invoice_date?.split('T')[0] || '',
          storage_location: purchase.storage_location || '',
          storage_conditions: purchase.storage_conditions || '',
          notes: purchase.notes || '',
          quality_notes: purchase.quality_notes || '',
        });
      } else {
        reset(defaultValues);
      }
    }
  }, [open, purchase]);

  useEffect(() => {
    if (watchProductId) {
      fetchSKUs(watchProductId);
    }
  }, [watchProductId]);

  const fetchVendors = async () => {
    setLoadingVendors(true);
    try {
      const response = await vendorService.getAllVendors({ status: 'active', limit: 1000 });
      setVendors(response.data || response.vendors || []);
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await productService.getAllProducts({ limit: 1000 });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSKUs = async (productId) => {
    setLoadingSKUs(true);
    try {
      const response = await skuService.getAllSKUs({ product_id: productId, limit: 1000 });
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
      const purchaseData = {
        ...data,
        sku_id: data.sku_id || undefined,
        shipping_cost: data.shipping_cost || 0,
        tax_amount: data.tax_amount || 0,
        other_charges: data.other_charges || 0,
        germination_rate: data.germination_rate || undefined,
        purity_percentage: data.purity_percentage || undefined,
        invoice_number: data.invoice_number || undefined,
        invoice_date: data.invoice_date || undefined,
        storage_location: data.storage_location || undefined,
        storage_conditions: data.storage_conditions || undefined,
        notes: data.notes || undefined,
        quality_notes: data.quality_notes || undefined,
      };

      if (isEditMode) {
        await purchaseService.updatePurchase(purchase.id, purchaseData);
        toast.success('Purchase updated successfully');
      } else {
        await purchaseService.createPurchase(purchaseData);
        toast.success('Purchase created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Failed to save purchase:', error);
      toast.error(
        error.response?.data?.message ||
        `Failed to ${isEditMode ? 'update' : 'create'} purchase`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {isEditMode ? 'Edit Seed Purchase' : 'Add New Seed Purchase'}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Basic Information
              </Typography>
            </Grid>

            {/* Vendor */}
            <Grid item xs={12} md={6}>
              <Controller
                name="vendor_id"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    {...field}
                    options={vendors}
                    getOptionLabel={(option) =>
                      typeof option === 'string'
                        ? vendors.find((v) => v.id === option)?.vendor_name || ''
                        : option.vendor_name || ''
                    }
                    value={vendors.find((v) => v.id === field.value) || null}
                    onChange={(_, newValue) => field.onChange(newValue?.id || '')}
                    loading={loadingVendors}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Vendor"
                        required
                        error={!!errors.vendor_id}
                        helperText={errors.vendor_id?.message || (vendors.length === 0 && !loadingVendors ? 'No vendors found. Please add vendors first.' : '')}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingVendors ? <CircularProgress color="inherit" size={20} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                )}
              />
            </Grid>

            {/* Product */}
            <Grid item xs={12} md={6}>
              <Controller
                name="product_id"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    {...field}
                    options={products}
                    getOptionLabel={(option) => {
                      if (typeof option === 'string') {
                        const product = products.find((p) => p.id === option);
                        return product?.product_name || product?.name || '';
                      }
                      return option.product_name || option.name || '';
                    }}
                    value={products.find((p) => p.id === field.value) || null}
                    onChange={(_, newValue) => {
                      field.onChange(newValue?.id || '');
                      setSelectedProduct(newValue);
                      setValue('sku_id', '');
                    }}
                    loading={loadingProducts}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Product"
                        required
                        error={!!errors.product_id}
                        helperText={errors.product_id?.message || (products.length === 0 && !loadingProducts ? 'No products found. Please add products first.' : '')}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingProducts ? <CircularProgress color="inherit" size={20} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                )}
              />
            </Grid>

            {/* SKU (Optional) */}
            <Grid item xs={12} md={6}>
              <Controller
                name="sku_id"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    {...field}
                    options={skus}
                    getOptionLabel={(option) =>
                      typeof option === 'string'
                        ? skus.find((s) => s.id === option)?.sku_code || ''
                        : option.sku_code || ''
                    }
                    value={skus.find((s) => s.id === field.value) || null}
                    onChange={(_, newValue) => field.onChange(newValue?.id || '')}
                    loading={loadingSKUs}
                    disabled={!watchProductId}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="SKU (Optional)"
                        error={!!errors.sku_id}
                        helperText={errors.sku_id?.message || 'Select a product first'}
                      />
                    )}
                  />
                )}
              />
            </Grid>

            {/* Seed Lot Number */}
            <Grid item xs={12} md={6}>
              <Controller
                name="seed_lot_number"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Seed Lot Number"
                    fullWidth
                    required
                    error={!!errors.seed_lot_number}
                    helperText={errors.seed_lot_number?.message}
                  />
                )}
              />
            </Grid>

            {/* Quantity Details */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Quantity Details
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Controller
                name="number_of_packets"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Number of Packets"
                    type="number"
                    fullWidth
                    required
                    error={!!errors.number_of_packets}
                    helperText={errors.number_of_packets?.message}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <Controller
                name="seeds_per_packet"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Seeds per Packet"
                    type="number"
                    fullWidth
                    required
                    error={!!errors.seeds_per_packet}
                    helperText={errors.seeds_per_packet?.message}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="Total Seeds"
                value={totalSeeds}
                fullWidth
                disabled
                InputProps={{ readOnly: true }}
              />
            </Grid>

            {/* Pricing */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Pricing
              </Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="cost_per_packet"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Cost per Packet"
                    type="number"
                    fullWidth
                    required
                    error={!!errors.cost_per_packet}
                    helperText={errors.cost_per_packet?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01' }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <TextField
                label="Cost per Seed"
                value={`₹${costPerSeed}`}
                fullWidth
                disabled
                InputProps={{ readOnly: true }}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <TextField
                label="Total Cost"
                value={`₹${totalCost.toFixed(2)}`}
                fullWidth
                disabled
                InputProps={{ readOnly: true }}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="shipping_cost"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Shipping Cost"
                    type="number"
                    fullWidth
                    error={!!errors.shipping_cost}
                    helperText={errors.shipping_cost?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01' }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <Controller
                name="tax_amount"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Tax Amount"
                    type="number"
                    fullWidth
                    error={!!errors.tax_amount}
                    helperText={errors.tax_amount?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01' }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <Controller
                name="other_charges"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Other Charges"
                    type="number"
                    fullWidth
                    error={!!errors.other_charges}
                    helperText={errors.other_charges?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01' }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="Grand Total"
                value={`₹${grandTotal.toFixed(2)}`}
                fullWidth
                disabled
                InputProps={{ readOnly: true }}
              />
            </Grid>

            {/* Quality & Dates */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Quality & Dates
              </Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="germination_rate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Germination Rate (%)"
                    type="number"
                    fullWidth
                    error={!!errors.germination_rate}
                    helperText={errors.germination_rate?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01', min: 0, max: 100 }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="purity_percentage"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Purity (%)"
                    type="number"
                    fullWidth
                    error={!!errors.purity_percentage}
                    helperText={errors.purity_percentage?.message}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    inputProps={{ step: '0.01', min: 0, max: 100 }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="purchase_date"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Purchase Date"
                    type="date"
                    fullWidth
                    required
                    error={!!errors.purchase_date}
                    helperText={errors.purchase_date?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="expiry_date"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Expiry Date"
                    type="date"
                    fullWidth
                    required
                    error={!!errors.expiry_date}
                    helperText={errors.expiry_date?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              />
            </Grid>

            {/* Invoice Details */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Invoice Details
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="invoice_number"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Invoice Number"
                    fullWidth
                    error={!!errors.invoice_number}
                    helperText={errors.invoice_number?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="invoice_date"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Invoice Date"
                    type="date"
                    fullWidth
                    error={!!errors.invoice_date}
                    helperText={errors.invoice_date?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              />
            </Grid>

            {/* Storage */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Storage Information
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="storage_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Storage Location"
                    fullWidth
                    error={!!errors.storage_location}
                    helperText={errors.storage_location?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="storage_conditions"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Storage Conditions"
                    fullWidth
                    error={!!errors.storage_conditions}
                    helperText={errors.storage_conditions?.message}
                  />
                )}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12} md={6}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Notes"
                    fullWidth
                    multiline
                    rows={3}
                    error={!!errors.notes}
                    helperText={errors.notes?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="quality_notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Quality Notes"
                    fullWidth
                    multiline
                    rows={3}
                    error={!!errors.quality_notes}
                    helperText={errors.quality_notes?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default PurchaseForm;
