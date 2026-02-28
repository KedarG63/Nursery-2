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
  variety: z.string().max(100, 'Variety must be less than 100 characters').optional(),
  size: z.enum(['small', 'medium', 'large'], {
    errorMap: () => ({ message: 'Please select a size' }),
  }),
  container_type: z.enum(['tray', 'pot', 'seedling_tray', 'grow_bag'], {
    errorMap: () => ({ message: 'Please select a container type' }),
  }),
  price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0.01, 'Price must be greater than 0'),
  cost: z
    .number({ invalid_type_error: 'Cost must be a number' })
    .min(0, 'Cost must be at least 0'),
  min_stock_level: z
    .number({ invalid_type_error: 'Min stock level must be a number' })
    .min(0, 'Min stock level must be at least 0')
    .int('Min stock level must be an integer'),
  max_stock_level: z
    .number({ invalid_type_error: 'Max stock level must be a number' })
    .min(0, 'Max stock level must be at least 0')
    .int('Max stock level must be an integer')
    .optional()
    .nullable(),
}).refine((data) => data.price > data.cost, {
  message: 'Price must be greater than cost',
  path: ['price'],
});

const SKUForm = ({ open, onClose, sku, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const sizes = skuService.getSizes();
  const containerTypes = skuService.getContainerTypes();

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
      size: sku?.size || '',
      container_type: sku?.container_type || '',
      price: sku?.price || 0,
      cost: sku?.cost || 0,
      min_stock_level: sku?.min_stock_level || 10,
      max_stock_level: sku?.max_stock_level || null,
    },
  });

  const watchSize = watch('size');
  const watchContainerType = watch('container_type');

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
        size: sku.size,
        container_type: sku.container_type,
        price: sku.price,
        cost: sku.cost,
        min_stock_level: sku.min_stock_level,
        max_stock_level: sku.max_stock_level,
      });
      // Find and set the selected product
      if (sku.product) {
        setSelectedProduct(sku.product);
      }
    }
  }, [sku, reset]);

  // Auto-generate SKU code when product, size, or container type changes
  useEffect(() => {
    if (selectedProduct && watchSize && watchContainerType && !sku) {
      generateSKUCode(selectedProduct, watchSize, watchContainerType);
    }
  }, [selectedProduct, watchSize, watchContainerType, sku]);

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

  const generateSKUCode = (product, size, containerType) => {
    // Generate SKU code format: {PRODUCT_CODE}-{SIZE_CODE}-{CONTAINER_CODE}
    // Example: TOMATO-MED-POT
    const productCode = product.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);
    const sizeCode = size.substring(0, 3).toUpperCase();

    // Map container types to short codes
    const containerCodes = {
      tray: 'TRY',
      pot: 'POT',
      seedling_tray: 'STR',
      grow_bag: 'BAG',
    };
    const containerCode = containerCodes[containerType] || containerType.substring(0, 3).toUpperCase();

    const skuCode = `${productCode}-${sizeCode}-${containerCode}`;
    setValue('sku_code', skuCode);
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const skuData = {
        ...data,
        max_stock_level: data.max_stock_level || null,
      };

      if (sku) {
        // Update existing SKU
        await skuService.updateSKU(sku.id, skuData);
        toast.success('SKU updated successfully');
      } else {
        // Create new SKU
        await skuService.createSKU(skuData);
        toast.success('SKU created successfully');
      }

      reset();
      setSelectedProduct(null);
      onSuccess && onSuccess();
    } catch (error) {
      console.error('Failed to save SKU:', error);
      toast.error(error.response?.data?.message || 'Failed to save SKU');
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

    // Auto-generate SKU code if size and container type are selected
    if (newValue && watchSize && watchContainerType && !sku) {
      generateSKUCode(newValue, watchSize, watchContainerType);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {sku ? 'Edit SKU' : 'Add SKU'}
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
                  label="Variety (Optional)"
                  fullWidth
                  error={!!errors.variety}
                  helperText={errors.variety?.message}
                  disabled={loading}
                  placeholder="e.g., Cherry, Beefsteak"
                />
              )}
            />

            {/* Size */}
            <Controller
              name="size"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Size"
                  required
                  fullWidth
                  error={!!errors.size}
                  helperText={errors.size?.message}
                  disabled={loading}
                >
                  {sizes.map((size) => (
                    <MenuItem key={size} value={size}>
                      {skuService.getSizeDisplayName(size)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            {/* Container Type */}
            <Controller
              name="container_type"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Container Type"
                  required
                  fullWidth
                  error={!!errors.container_type}
                  helperText={errors.container_type?.message}
                  disabled={loading}
                >
                  {containerTypes.map((containerType) => (
                    <MenuItem key={containerType} value={containerType}>
                      {skuService.getContainerTypeDisplayName(containerType)}
                    </MenuItem>
                  ))}
                </TextField>
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
                  helperText={errors.sku_code?.message || 'Auto-generated from product, size, and pot type'}
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

            {/* Min Stock Level */}
            <Controller
              name="min_stock_level"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Min Stock Level"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
                  error={!!errors.min_stock_level}
                  helperText={errors.min_stock_level?.message}
                  disabled={loading}
                  inputProps={{ min: 0 }}
                />
              )}
            />

            {/* Max Stock Level */}
            <Controller
              name="max_stock_level"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Max Stock Level (Optional)"
                  fullWidth
                  value={value || ''}
                  onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                  error={!!errors.max_stock_level}
                  helperText={errors.max_stock_level?.message}
                  disabled={loading}
                  inputProps={{ min: 0 }}
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
            {loading ? 'Saving...' : sku ? 'Update SKU' : 'Create SKU'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default SKUForm;
