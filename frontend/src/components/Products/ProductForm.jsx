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
  Card,
  CardMedia,
} from '@mui/material';
import { Close as CloseIcon, CloudUpload as UploadIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import productService from '../../services/productService';
import { uploadProductImage, getImagePreview, revokeImagePreview } from '../../utils/imageUpload';

// Validation schema
const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  category: z.enum(['leafy_greens', 'fruiting', 'root', 'herbs'], {
    errorMap: () => ({ message: 'Please select a category' }),
  }),
  status: z.enum(['active', 'inactive', 'discontinued'], {
    errorMap: () => ({ message: 'Please select a status' }),
  }),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  growth_period_days: z
    .number({ invalid_type_error: 'Growth period must be a number' })
    .min(1, 'Growth period must be at least 1 day')
    .max(365, 'Growth period must be less than 365 days'),
  lot_size: z
    .number({ invalid_type_error: 'Lot size must be a number' })
    .min(1, 'Lot size must be at least 1')
    .max(100000, 'Lot size must be less than 100000'),
});

const ProductForm = ({ open, onClose, product, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image_url || null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const categories = productService.getCategories();

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || '',
      category: product?.category || '',
      status: product?.status || 'active',
      description: product?.description || '',
      growth_period_days: product?.growth_period_days || 30,
      lot_size: product?.lot_size || 1000,
    },
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        category: product.category,
        status: product.status || 'active',
        description: product.description || '',
        growth_period_days: product.growth_period_days || 30,
        lot_size: product.lot_size || 1000,
      });
      setImagePreview(product.image_url || null);
    }
  }, [product, reset]);

  useEffect(() => {
    // Cleanup image preview on unmount
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        revokeImagePreview(imagePreview);
      }
    };
  }, []);

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload JPG, PNG, or WebP image.');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size too large. Maximum size is 5MB.');
      return;
    }

    setImageFile(file);

    // Create preview
    const preview = getImagePreview(file);
    if (imagePreview && imagePreview.startsWith('blob:')) {
      revokeImagePreview(imagePreview);
    }
    setImagePreview(preview);
  };

  const handleRemoveImage = () => {
    if (imagePreview && imagePreview.startsWith('blob:')) {
      revokeImagePreview(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      let imageUrl = product?.image_url || null;

      // Upload image if new file selected
      if (imageFile) {
        setUploadingImage(true);
        try {
          imageUrl = await uploadProductImage(imageFile);
        } catch (error) {
          toast.error(error.message || 'Failed to upload image');
          setUploadingImage(false);
          setLoading(false);
          return;
        }
        setUploadingImage(false);
      }

      const productData = {
        ...data,
        image_url: imageUrl,
      };

      if (product) {
        // Update existing product
        await productService.updateProduct(product.id, productData);
        toast.success('Product updated successfully');
      } else {
        // Create new product
        await productService.createProduct(productData);
        toast.success('Product created successfully');
      }

      reset();
      handleRemoveImage();
      onSuccess && onSuccess();
    } catch (error) {
      console.error('Failed to save product:', error);
      toast.error(error.response?.data?.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      handleRemoveImage();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {product ? 'Edit Product' : 'Add Product'}
          </Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Name */}
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Product Name"
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  disabled={loading}
                />
              )}
            />

            {/* Category */}
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Category"
                  required
                  fullWidth
                  error={!!errors.category}
                  helperText={errors.category?.message}
                  disabled={loading}
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {productService.getCategoryDisplayName(category)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            {/* Status */}
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Status"
                  required
                  fullWidth
                  error={!!errors.status}
                  helperText={errors.status?.message}
                  disabled={loading}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                  <MenuItem value="discontinued">Discontinued</MenuItem>
                </TextField>
              )}
            />

            {/* Growth Period */}
            <Controller
              name="growth_period_days"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Growth Period (days)"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
                  error={!!errors.growth_period_days}
                  helperText={errors.growth_period_days?.message}
                  disabled={loading}
                  inputProps={{ min: 1, max: 365 }}
                />
              )}
            />

            {/* Lot Size */}
            <Controller
              name="lot_size"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Standard Lot Size (plants per tray)"
                  required
                  fullWidth
                  value={value}
                  onChange={(e) => onChange(parseInt(e.target.value, 10) || 1000)}
                  error={!!errors.lot_size}
                  helperText={errors.lot_size?.message || 'Standard quantity per lot/tray (e.g., 1000)'}
                  disabled={loading}
                  inputProps={{ min: 1, max: 100000 }}
                />
              )}
            />

            {/* Description */}
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Description"
                  multiline
                  rows={3}
                  fullWidth
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  disabled={loading}
                />
              )}
            />

            {/* Image Upload */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Product Image
              </Typography>

              {imagePreview ? (
                <Box sx={{ position: 'relative', width: 200, height: 200 }}>
                  <Card>
                    <CardMedia
                      component="img"
                      height="200"
                      image={imagePreview}
                      alt="Product preview"
                      sx={{ objectFit: 'cover' }}
                    />
                  </Card>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={handleRemoveImage}
                    disabled={loading}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      bgcolor: 'background.paper',
                      '&:hover': { bgcolor: 'background.paper' },
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Box>
              ) : (
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadIcon />}
                  disabled={loading}
                >
                  Choose Image
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageSelect}
                  />
                </Button>
              )}

              <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
                Accepted formats: JPG, PNG, WebP. Max size: 5MB
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
            disabled={loading || uploadingImage}
            startIcon={loading && <CircularProgress size={20} />}
          >
            {loading
              ? uploadingImage
                ? 'Uploading...'
                : 'Saving...'
              : product
              ? 'Update Product'
              : 'Create Product'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ProductForm;
