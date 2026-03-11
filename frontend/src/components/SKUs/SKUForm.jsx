import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Autocomplete,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import skuService from '../../services/skuService';
import productService from '../../services/productService';

// Validation schema
const skuSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  sku_code: z.string().min(1, 'SKU Code is required').max(50, 'SKU Code must be less than 50 characters'),
  variety: z.string().min(1, 'Product variety is required').max(100, 'Variety must be less than 100 characters'),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0.01, 'Price must be greater than 0'),
  cost: z
    .number({ invalid_type_error: 'Cost must be a number' })
    .min(0, 'Cost must be at least 0'),
}).refine((data) => data.price > data.cost, {
  message: 'Price must be greater than cost',
  path: ['price'],
});

const SKUForm = ({ open, onClose, sku, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(skuSchema),
    defaultValues: {
      product_id: sku?.product_id || '',
      sku_code: sku?.sku_code || '',
      variety: sku?.variety || '',
      price: sku?.price || 0,
      cost: sku?.cost || 0,
    },
  });

  const watchVariety = watch('variety');

  // Fetch products for dropdown
  useEffect(() => {
    fetchProducts();
  }, []);

  // Reset form when SKU changes
  useEffect(() => {
    if (sku) {
      reset({
        product_id: sku.product_id,
        sku_code: sku.sku_code,
        variety: sku.variety || '',
        price: sku.price,
        cost: sku.cost,
      });
      // Find and set the selected product
      if (sku.product) {
        setSelectedProduct(sku.product);
      }
    }
  }, [sku, reset]);

  // Auto-generate SKU code when product or variety changes
  useEffect(() => {
    if (selectedProduct && watchVariety && !sku) {
      generateSKUCode(selectedProduct, watchVariety);
    }
  }, [selectedProduct, watchVariety, sku]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await productService.getAllProducts({ limit: 1000, is_active: true });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const generateSKUCode = (product, variety) => {
    // Generate SKU code format: {PRODUCT_CODE}-{VARIETY_CODE}
    // Example: TOMATO-CHERRY
    const productCode = product.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);
    const varietyCode = variety
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6);

    const skuCode = `${productCode}-${varietyCode}`;
    setValue('sku_code', skuCode);
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const skuData = { ...data };

      if (sku) {
        // Update existing SKU
        await skuService.updateSKU(sku.id, skuData);
        toast.success('Product variety updated successfully');
      } else {
        // Create new SKU
        await skuService.createSKU(skuData);
        toast.success('Product variety created successfully');
      }

      reset();
      setSelectedProduct(null);
      onSuccess && onSuccess();
    } catch (error) {
      console.error('Failed to save product variety:', error);
      toast.error(error.response?.data?.message || 'Failed to save product variety');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      setSelectedProduct(null);
      onClose();
    }
  };

  const handleProductChange = (event, newValue) => {
    setSelectedProduct(newValue);
    setValue('product_id', newValue?.id || '');

    // Auto-generate SKU code if variety is entered
    if (newValue && watchVariety && !sku) {
      generateSKUCode(newValue, watchVariety);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {sku ? 'Edit Product Variety' : 'Add Product Variety'}
          </Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Product Autocomplete */}
            <Controller
              name="product_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  options={products}
                  getOptionLabel={(option) => option.name || ''}
                  loading={loadingProducts}
                  value={selectedProduct}
                  onChange={handleProductChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Product"
                      required
                      error={!!errors.product_id}
                      helperText={errors.product_id?.message}
                      disabled={loading}
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
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                />
              )}
            />

            {/* Variety */}
            <Controller
              name="variety"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Product Variety"
                  required
                  fullWidth
                  error={!!errors.variety}
                  helperText={errors.variety?.message}
                  disabled={loading}
                  placeholder="e.g., Cherry, Beefsteak, Hybrid"
                />
              )}
            />

            {/* SKU Code */}
            <Controller
              name="sku_code"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="SKU Code"
                  required
                  fullWidth
                  error={!!errors.sku_code}
                  helperText={errors.sku_code?.message || 'Auto-generated from product name and variety'}
                  disabled={loading}
                />
              )}
            />

            {/* Price */}
            <Controller
              name="price"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Price"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                  error={!!errors.price}
                  helperText={errors.price?.message}
                  disabled={loading}
                  inputProps={{ min: 0.01, step: 0.01 }}
                />
              )}
            />

            {/* Cost */}
            <Controller
              name="cost"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Cost"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                  error={!!errors.cost}
                  helperText={errors.cost?.message}
                  disabled={loading}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              )}
            />
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
            {loading ? 'Saving...' : sku ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default SKUForm;
