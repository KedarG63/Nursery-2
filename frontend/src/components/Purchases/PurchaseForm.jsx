import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Grid,
  CircularProgress,
  IconButton,
  Autocomplete,
  Typography,
  Divider,
  Paper,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import purchaseService from '../../services/purchaseService';
import vendorService from '../../services/vendorService';
import productService from '../../services/productService';
import skuService from '../../services/skuService';

// Header-level fields (shared across all items)
const headerSchema = z.object({
  vendor_id: z.string().min(1, 'Vendor is required'),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  invoice_number: z.string().optional(),
  invoice_date: z.string().optional(),
  storage_location: z.string().optional(),
  storage_conditions: z.string().optional(),
  notes: z.string().optional(),
});

// Edit-mode single-item schema (same as before)
const editSchema = z.object({
  vendor_id: z.string().min(1, 'Vendor is required'),
  product_id: z.string().min(1, 'Product is required'),
  sku_id: z.string().optional(),
  seed_lot_number: z.string().min(1, 'Seed lot number is required').max(100),
  number_of_packets: z.number().min(1),
  seeds_per_packet: z.number().min(1),
  cost_per_packet: z.number().min(0.01),
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

const defaultLineItem = () => ({
  _key: Date.now() + Math.random(),
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
  quality_notes: '',
  skus: [],
  loadingSkus: false,
  errors: {},
});

const PurchaseForm = ({ open, onClose, onSuccess, purchase }) => {
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Multi-item state (create mode only)
  const [lineItems, setLineItems] = useState([defaultLineItem()]);

  const isEditMode = Boolean(purchase);

  // ── react-hook-form for edit mode (single item) ──────────────────────────
  const editForm = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      vendor_id: '', product_id: '', sku_id: '', seed_lot_number: '',
      number_of_packets: 1, seeds_per_packet: 100, cost_per_packet: 0,
      shipping_cost: 0, tax_amount: 0, other_charges: 0,
      germination_rate: 85, purity_percentage: 95,
      expiry_date: '', purchase_date: new Date().toISOString().split('T')[0],
      invoice_number: '', invoice_date: '',
      storage_location: '', storage_conditions: '',
      notes: '', quality_notes: '',
    },
  });

  // ── react-hook-form for create mode header ───────────────────────────────
  const headerForm = useForm({
    resolver: zodResolver(headerSchema),
    defaultValues: {
      vendor_id: '',
      purchase_date: new Date().toISOString().split('T')[0],
      invoice_number: '',
      invoice_date: '',
      storage_location: '',
      storage_conditions: '',
      notes: '',
    },
  });

  // Pre-load vendors and products
  useEffect(() => {
    fetchVendors();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (open) {
      if (purchase) {
        editForm.reset({
          vendor_id: purchase.vendor_id || '',
          product_id: purchase.product_id || '',
          sku_id: purchase.sku_id || '',
          seed_lot_number: purchase.seed_lot_number || '',
          number_of_packets: Number(purchase.number_of_packets) || 1,
          seeds_per_packet: Number(purchase.seeds_per_packet) || 100,
          cost_per_packet: Number(purchase.cost_per_packet) || 0,
          shipping_cost: Number(purchase.shipping_cost) || 0,
          tax_amount: Number(purchase.tax_amount) || 0,
          other_charges: Number(purchase.other_charges) || 0,
          germination_rate: Number(purchase.germination_rate) || 85,
          purity_percentage: Number(purchase.purity_percentage) || 95,
          expiry_date: purchase.expiry_date ? String(purchase.expiry_date).split('T')[0] : '',
          purchase_date: purchase.purchase_date ? String(purchase.purchase_date).split('T')[0] : new Date().toISOString().split('T')[0],
          invoice_number: purchase.invoice_number || '',
          invoice_date: purchase.invoice_date ? String(purchase.invoice_date).split('T')[0] : '',
          storage_location: purchase.storage_location || '',
          storage_conditions: purchase.storage_conditions || '',
          notes: purchase.notes || '',
          quality_notes: purchase.quality_notes || '',
        });
        if (purchase.product_id) fetchEditSKUs(purchase.product_id);
      } else {
        headerForm.reset({
          vendor_id: '',
          purchase_date: new Date().toISOString().split('T')[0],
          invoice_number: '',
          invoice_date: '',
          storage_location: '',
          storage_conditions: '',
          notes: '',
        });
        setLineItems([defaultLineItem()]);
      }
    }
  }, [open, purchase]);

  // SKUs for edit mode
  const [editSkus, setEditSkus] = useState([]);
  const [loadingEditSkus, setLoadingEditSkus] = useState(false);

  const fetchEditSKUs = async (productId) => {
    setLoadingEditSkus(true);
    try {
      const response = await skuService.getAllSKUs({ product_id: productId, limit: 1000 });
      setEditSkus(response.data || response.skus || []);
    } catch {
      setEditSkus([]);
    } finally {
      setLoadingEditSkus(false);
    }
  };

  const watchEditProductId = editForm.watch('product_id');
  useEffect(() => {
    if (watchEditProductId) fetchEditSKUs(watchEditProductId);
  }, [watchEditProductId]);

  const fetchVendors = async () => {
    setLoadingVendors(true);
    try {
      const response = await vendorService.getAllVendors({ status: 'active', limit: 1000 });
      setVendors(response.data || response.vendors || []);
    } catch {
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
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  // ── Line item helpers ────────────────────────────────────────────────────

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value, errors: { ...updated[index].errors, [field]: undefined } };
      return updated;
    });
  };

  const fetchItemSKUs = async (index, productId) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], loadingSkus: true, skus: [], sku_id: '' };
      return updated;
    });
    try {
      const response = await skuService.getAllSKUs({ product_id: productId, limit: 1000 });
      setLineItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], skus: response.data || response.skus || [], loadingSkus: false };
        return updated;
      });
    } catch {
      setLineItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], skus: [], loadingSkus: false };
        return updated;
      });
    }
  };

  const handleProductChange = (index, product) => {
    updateLineItem(index, 'product_id', product?.id || '');
    updateLineItem(index, 'sku_id', '');
    if (product?.id) fetchItemSKUs(index, product.id);
  };

  const addLineItem = () => setLineItems((prev) => [...prev, defaultLineItem()]);

  const removeLineItem = (index) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const validateLineItems = () => {
    let valid = true;
    const updated = lineItems.map((item) => {
      const errors = {};
      if (!item.product_id) errors.product_id = 'Product is required';
      if (!item.seed_lot_number) errors.seed_lot_number = 'Seed lot number is required';
      if (!item.number_of_packets || item.number_of_packets < 1) errors.number_of_packets = 'Min 1';
      if (!item.seeds_per_packet || item.seeds_per_packet < 1) errors.seeds_per_packet = 'Min 1';
      if (!item.cost_per_packet || item.cost_per_packet <= 0) errors.cost_per_packet = 'Required';
      if (!item.expiry_date) errors.expiry_date = 'Required';
      if (Object.keys(errors).length) valid = false;
      return { ...item, errors };
    });
    setLineItems(updated);
    return valid;
  };

  // ── Submit: edit mode ────────────────────────────────────────────────────

  const onEditSubmit = async (data) => {
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
      await purchaseService.updatePurchase(purchase.id, purchaseData);
      toast.success('Purchase updated successfully');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update purchase');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit: create mode (multi-item) ────────────────────────────────────

  const onCreateSubmit = async (headerData) => {
    if (!validateLineItems()) {
      toast.error('Please fix errors in the items below');
      return;
    }
    setLoading(true);
    let created = 0;
    let failed = 0;
    try {
      for (const item of lineItems) {
        try {
          await purchaseService.createPurchase({
            vendor_id: headerData.vendor_id,
            purchase_date: headerData.purchase_date,
            invoice_number: headerData.invoice_number || undefined,
            invoice_date: headerData.invoice_date || undefined,
            storage_location: headerData.storage_location || undefined,
            storage_conditions: headerData.storage_conditions || undefined,
            notes: headerData.notes || undefined,
            product_id: item.product_id,
            sku_id: item.sku_id || undefined,
            seed_lot_number: item.seed_lot_number,
            number_of_packets: item.number_of_packets,
            seeds_per_packet: item.seeds_per_packet,
            cost_per_packet: item.cost_per_packet,
            shipping_cost: item.shipping_cost || 0,
            tax_amount: item.tax_amount || 0,
            other_charges: item.other_charges || 0,
            germination_rate: item.germination_rate || undefined,
            purity_percentage: item.purity_percentage || undefined,
            expiry_date: item.expiry_date,
            quality_notes: item.quality_notes || undefined,
          });
          created++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) {
        toast.success(`${created} purchase${created > 1 ? 's' : ''} created successfully`);
      } else {
        toast.warning(`${created} created, ${failed} failed`);
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  // ── Grand totals across all items ────────────────────────────────────────
  const grandTotalAll = lineItems.reduce((sum, item) => {
    const itemCost = (item.number_of_packets || 0) * (item.cost_per_packet || 0);
    return sum + itemCost + (item.shipping_cost || 0) + (item.tax_amount || 0) + (item.other_charges || 0);
  }, 0);

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  if (isEditMode) {
    // ── Edit mode: single-item form (unchanged behaviour) ─────────────────
    const { control, handleSubmit, watch: watchEdit, formState: { errors } } = editForm;
    const watchPackets = watchEdit('number_of_packets');
    const watchSeedsPerPacket = watchEdit('seeds_per_packet');
    const watchCostPerPacket = watchEdit('cost_per_packet');
    const watchShipping = watchEdit('shipping_cost');
    const watchTax = watchEdit('tax_amount');
    const watchOther = watchEdit('other_charges');
    const totalSeeds = (watchPackets || 0) * (watchSeedsPerPacket || 0);
    const totalCost = (watchPackets || 0) * (watchCostPerPacket || 0);
    const grandTotal = totalCost + (watchShipping || 0) + (watchTax || 0) + (watchOther || 0);
    const costPerSeed = watchSeedsPerPacket > 0 ? (watchCostPerPacket / watchSeedsPerPacket).toFixed(4) : 0;

    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          Edit Seed Purchase
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <form onSubmit={handleSubmit(onEditSubmit)}>
          <DialogContent dividers>
            <Grid container spacing={3}>
              <Grid item xs={12}><Typography variant="h6">Basic Information</Typography></Grid>

              <Grid item xs={12} md={6}>
                <Controller name="vendor_id" control={control} render={({ field }) => (
                  <Autocomplete {...field}
                    options={vendors}
                    getOptionLabel={(o) => typeof o === 'string' ? vendors.find((v) => v.id === o)?.vendor_name || '' : o.vendor_name || ''}
                    value={vendors.find((v) => v.id === field.value) || null}
                    onChange={(_, v) => field.onChange(v?.id || '')}
                    loading={loadingVendors}
                    renderInput={(params) => (
                      <TextField {...params} label="Vendor" required error={!!errors.vendor_id} helperText={errors.vendor_id?.message} />
                    )} />
                )} />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller name="product_id" control={control} render={({ field }) => (
                  <Autocomplete {...field}
                    options={products}
                    getOptionLabel={(o) => typeof o === 'string' ? products.find((p) => p.id === o)?.product_name || products.find((p) => p.id === o)?.name || '' : o.product_name || o.name || ''}
                    value={products.find((p) => p.id === field.value) || null}
                    onChange={(_, v) => { field.onChange(v?.id || ''); editForm.setValue('sku_id', ''); }}
                    loading={loadingProducts}
                    renderInput={(params) => (
                      <TextField {...params} label="Product" required error={!!errors.product_id} helperText={errors.product_id?.message} />
                    )} />
                )} />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller name="sku_id" control={control} render={({ field }) => (
                  <Autocomplete {...field}
                    options={editSkus}
                    getOptionLabel={(o) => typeof o === 'string' ? editSkus.find((s) => s.id === o)?.sku_code || '' : o.sku_code || ''}
                    value={editSkus.find((s) => s.id === field.value) || null}
                    onChange={(_, v) => field.onChange(v?.id || '')}
                    loading={loadingEditSkus}
                    disabled={!watchEdit('product_id')}
                    renderInput={(params) => (
                      <TextField {...params} label="Product Variety (Optional)" helperText="Select a product first" />
                    )} />
                )} />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller name="seed_lot_number" control={control} render={({ field }) => (
                  <TextField {...field} label="Seed Lot Number" fullWidth required error={!!errors.seed_lot_number} helperText={errors.seed_lot_number?.message} />
                )} />
              </Grid>

              <Grid item xs={12}><Typography variant="h6">Quantity Details</Typography></Grid>

              <Grid item xs={12} md={4}>
                <Controller name="number_of_packets" control={control} render={({ field }) => (
                  <TextField {...field} label="Number of Packets" type="number" fullWidth required error={!!errors.number_of_packets} helperText={errors.number_of_packets?.message} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="seeds_per_packet" control={control} render={({ field }) => (
                  <TextField {...field} label="Seeds per Packet" type="number" fullWidth required error={!!errors.seeds_per_packet} helperText={errors.seeds_per_packet?.message} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Total Seeds" value={totalSeeds} fullWidth disabled />
              </Grid>

              <Grid item xs={12}><Typography variant="h6">Pricing</Typography></Grid>

              <Grid item xs={12} md={3}>
                <Controller name="cost_per_packet" control={control} render={({ field }) => (
                  <TextField {...field} label="Cost per Packet" type="number" fullWidth required error={!!errors.cost_per_packet} helperText={errors.cost_per_packet?.message} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01' }} />
                )} />
              </Grid>
              <Grid item xs={12} md={3}><TextField label="Cost per Seed" value={`₹${costPerSeed}`} fullWidth disabled /></Grid>
              <Grid item xs={12} md={3}><TextField label="Total Cost" value={`₹${totalCost.toFixed(2)}`} fullWidth disabled /></Grid>
              <Grid item xs={12} md={3}>
                <Controller name="shipping_cost" control={control} render={({ field }) => (
                  <TextField {...field} label="Shipping Cost" type="number" fullWidth onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01' }} />
                )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="tax_amount" control={control} render={({ field }) => (
                  <TextField {...field} label="Tax Amount" type="number" fullWidth onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01' }} />
                )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="other_charges" control={control} render={({ field }) => (
                  <TextField {...field} label="Other Charges" type="number" fullWidth onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01' }} />
                )} />
              </Grid>
              <Grid item xs={12} md={4}><TextField label="Grand Total" value={`₹${grandTotal.toFixed(2)}`} fullWidth disabled /></Grid>

              <Grid item xs={12}><Typography variant="h6">Quality & Dates</Typography></Grid>

              <Grid item xs={12} md={3}>
                <Controller name="germination_rate" control={control} render={({ field }) => (
                  <TextField {...field} label="Germination Rate (%)" type="number" fullWidth onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01', min: 0, max: 100 }} />
                )} />
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name="purity_percentage" control={control} render={({ field }) => (
                  <TextField {...field} label="Purity (%)" type="number" fullWidth onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} inputProps={{ step: '0.01', min: 0, max: 100 }} />
                )} />
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name="purchase_date" control={control} render={({ field }) => (
                  <TextField {...field} label="Purchase Date" type="date" fullWidth required error={!!errors.purchase_date} helperText={errors.purchase_date?.message} InputLabelProps={{ shrink: true }} />
                )} />
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name="expiry_date" control={control} render={({ field }) => (
                  <TextField {...field} label="Expiry Date" type="date" fullWidth required error={!!errors.expiry_date} helperText={errors.expiry_date?.message} InputLabelProps={{ shrink: true }} />
                )} />
              </Grid>

              <Grid item xs={12}><Typography variant="h6">Invoice Details</Typography></Grid>

              <Grid item xs={12} md={6}>
                <Controller name="invoice_number" control={control} render={({ field }) => (
                  <TextField {...field} label="Invoice Number" fullWidth />
                )} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller name="invoice_date" control={control} render={({ field }) => (
                  <TextField {...field} label="Invoice Date" type="date" fullWidth InputLabelProps={{ shrink: true }} />
                )} />
              </Grid>

              <Grid item xs={12}><Typography variant="h6">Storage Information</Typography></Grid>

              <Grid item xs={12} md={6}>
                <Controller name="storage_location" control={control} render={({ field }) => (
                  <TextField {...field} label="Storage Location" fullWidth />
                )} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller name="storage_conditions" control={control} render={({ field }) => (
                  <TextField {...field} label="Storage Conditions" fullWidth />
                )} />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller name="notes" control={control} render={({ field }) => (
                  <TextField {...field} label="Notes" fullWidth multiline rows={3} />
                )} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller name="quality_notes" control={control} render={({ field }) => (
                  <TextField {...field} label="Quality Notes" fullWidth multiline rows={3} />
                )} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={20} /> : null}>
              Update
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    );
  }

  // ── Create mode: multi-item form ──────────────────────────────────────────
  const { control: hControl, handleSubmit: hSubmit, formState: { errors: hErrors } } = headerForm;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        Add New Seed Purchase
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={hSubmit(onCreateSubmit)}>
        <DialogContent dividers>

          {/* ── Invoice / Header ── */}
          <Typography variant="h6" gutterBottom>Invoice Details</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Controller name="vendor_id" control={hControl} render={({ field }) => (
                <Autocomplete {...field}
                  options={vendors}
                  getOptionLabel={(o) => typeof o === 'string' ? vendors.find((v) => v.id === o)?.vendor_name || '' : o.vendor_name || ''}
                  value={vendors.find((v) => v.id === field.value) || null}
                  onChange={(_, v) => field.onChange(v?.id || '')}
                  loading={loadingVendors}
                  renderInput={(params) => (
                    <TextField {...params} label="Vendor" required error={!!hErrors.vendor_id} helperText={hErrors.vendor_id?.message}
                      InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</> }} />
                  )} />
              )} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Controller name="purchase_date" control={hControl} render={({ field }) => (
                <TextField {...field} label="Purchase Date" type="date" fullWidth required error={!!hErrors.purchase_date} helperText={hErrors.purchase_date?.message} InputLabelProps={{ shrink: true }} />
              )} />
            </Grid>
            <Grid item xs={12} md={3}>
              <Controller name="invoice_number" control={hControl} render={({ field }) => (
                <TextField {...field} label="Invoice Number" fullWidth />
              )} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Controller name="invoice_date" control={hControl} render={({ field }) => (
                <TextField {...field} label="Invoice Date" type="date" fullWidth InputLabelProps={{ shrink: true }} />
              )} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Controller name="storage_location" control={hControl} render={({ field }) => (
                <TextField {...field} label="Storage Location" fullWidth />
              )} />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller name="storage_conditions" control={hControl} render={({ field }) => (
                <TextField {...field} label="Storage Conditions" fullWidth />
              )} />
            </Grid>
            <Grid item xs={12} md={8}>
              <Controller name="notes" control={hControl} render={({ field }) => (
                <TextField {...field} label="Notes" fullWidth />
              )} />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 3 }} />

          {/* ── Line Items ── */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Products Purchased</Typography>
            <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={addLineItem}>
              Add Product
            </Button>
          </Box>

          {lineItems.map((item, index) => {
            const totalSeeds = (item.number_of_packets || 0) * (item.seeds_per_packet || 0);
            const itemTotal = (item.number_of_packets || 0) * (item.cost_per_packet || 0)
              + (item.shipping_cost || 0) + (item.tax_amount || 0) + (item.other_charges || 0);

            return (
              <Paper key={item._key} variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Item {index + 1}
                    {item.product_id && products.find((p) => p.id === item.product_id) &&
                      ` — ${products.find((p) => p.id === item.product_id)?.product_name || products.find((p) => p.id === item.product_id)?.name}`}
                  </Typography>
                  {lineItems.length > 1 && (
                    <IconButton size="small" color="error" onClick={() => removeLineItem(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                <Grid container spacing={2}>
                  {/* Product */}
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      options={products}
                      getOptionLabel={(o) => o.product_name || o.name || ''}
                      value={products.find((p) => p.id === item.product_id) || null}
                      onChange={(_, v) => handleProductChange(index, v)}
                      loading={loadingProducts}
                      renderInput={(params) => (
                        <TextField {...params} label="Product" required
                          error={!!item.errors.product_id} helperText={item.errors.product_id} />
                      )} />
                  </Grid>

                  {/* Product Variety / SKU */}
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      options={item.skus}
                      getOptionLabel={(o) => o.sku_code || ''}
                      value={item.skus.find((s) => s.id === item.sku_id) || null}
                      onChange={(_, v) => updateLineItem(index, 'sku_id', v?.id || '')}
                      loading={item.loadingSkus}
                      disabled={!item.product_id}
                      renderInput={(params) => (
                        <TextField {...params} label="Product Variety (Optional)" helperText={!item.product_id ? 'Select a product first' : ''} />
                      )} />
                  </Grid>

                  {/* Seed Lot Number */}
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Seed Lot Number" fullWidth required
                      value={item.seed_lot_number}
                      onChange={(e) => updateLineItem(index, 'seed_lot_number', e.target.value)}
                      error={!!item.errors.seed_lot_number}
                      helperText={item.errors.seed_lot_number} />
                  </Grid>

                  {/* Packets */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="No. of Packets" type="number" fullWidth required
                      value={item.number_of_packets}
                      onChange={(e) => updateLineItem(index, 'number_of_packets', parseInt(e.target.value) || 0)}
                      error={!!item.errors.number_of_packets}
                      helperText={item.errors.number_of_packets} />
                  </Grid>

                  {/* Seeds per Packet */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Seeds / Packet" type="number" fullWidth required
                      value={item.seeds_per_packet}
                      onChange={(e) => updateLineItem(index, 'seeds_per_packet', parseInt(e.target.value) || 0)}
                      error={!!item.errors.seeds_per_packet}
                      helperText={item.errors.seeds_per_packet} />
                  </Grid>

                  {/* Total Seeds (read-only) */}
                  <Grid item xs={6} md={2}>
                    <TextField label="Total Seeds" value={totalSeeds} fullWidth disabled />
                  </Grid>

                  {/* Cost per Packet */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Cost / Packet (₹)" type="number" fullWidth required
                      value={item.cost_per_packet}
                      onChange={(e) => updateLineItem(index, 'cost_per_packet', parseFloat(e.target.value) || 0)}
                      error={!!item.errors.cost_per_packet}
                      helperText={item.errors.cost_per_packet}
                      inputProps={{ step: '0.01' }} />
                  </Grid>

                  {/* Shipping */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Shipping (₹)" type="number" fullWidth
                      value={item.shipping_cost}
                      onChange={(e) => updateLineItem(index, 'shipping_cost', parseFloat(e.target.value) || 0)}
                      inputProps={{ step: '0.01' }} />
                  </Grid>

                  {/* Other Charges */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Other Charges (₹)" type="number" fullWidth
                      value={item.other_charges}
                      onChange={(e) => updateLineItem(index, 'other_charges', parseFloat(e.target.value) || 0)}
                      inputProps={{ step: '0.01' }} />
                  </Grid>

                  {/* Expiry Date */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Expiry Date" type="date" fullWidth required
                      value={item.expiry_date}
                      onChange={(e) => updateLineItem(index, 'expiry_date', e.target.value)}
                      error={!!item.errors.expiry_date}
                      helperText={item.errors.expiry_date}
                      InputLabelProps={{ shrink: true }} />
                  </Grid>

                  {/* Germination Rate */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Germination (%)" type="number" fullWidth
                      value={item.germination_rate}
                      onChange={(e) => updateLineItem(index, 'germination_rate', parseFloat(e.target.value) || 0)}
                      inputProps={{ step: '0.01', min: 0, max: 100 }} />
                  </Grid>

                  {/* Purity */}
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Purity (%)" type="number" fullWidth
                      value={item.purity_percentage}
                      onChange={(e) => updateLineItem(index, 'purity_percentage', parseFloat(e.target.value) || 0)}
                      inputProps={{ step: '0.01', min: 0, max: 100 }} />
                  </Grid>

                  {/* Item Total (read-only) */}
                  <Grid item xs={6} md={2}>
                    <TextField label="Item Total (₹)" value={itemTotal.toFixed(2)} fullWidth disabled />
                  </Grid>

                  {/* Quality Notes */}
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Quality Notes" fullWidth
                      value={item.quality_notes}
                      onChange={(e) => updateLineItem(index, 'quality_notes', e.target.value)} />
                  </Grid>
                </Grid>
              </Paper>
            );
          })}

          {/* Grand Total across all items */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Typography variant="h6">
              Grand Total: ₹{grandTotalAll.toFixed(2)}
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? 'Creating...' : `Create ${lineItems.length > 1 ? `${lineItems.length} Purchases` : 'Purchase'}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default PurchaseForm;
