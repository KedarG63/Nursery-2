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
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import vendorService from '../../services/vendorService';

// Validation schema
const vendorSchema = z.object({
  vendor_code: z.string().min(1, 'Vendor code is required').max(50),
  vendor_name: z.string().min(1, 'Vendor name is required').max(255),
  contact_person: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email').max(255).optional().or(z.literal('')),
  address: z.string().optional(),
  gst_number: z.string().max(50).optional(),
  payment_terms: z.number().min(0, 'Payment terms must be positive').optional(),
  status: z.enum(['active', 'inactive', 'blacklisted']),
  notes: z.string().optional(),
});

const VendorForm = ({ open, onClose, onSuccess, vendor }) => {
  const [loading, setLoading] = useState(false);
  const isEditMode = Boolean(vendor);

  const statuses = vendorService.getStatuses();

  const defaultValues = {
    vendor_code: '',
    vendor_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    gst_number: '',
    payment_terms: 30,
    status: 'active',
    notes: '',
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(vendorSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      if (vendor) {
        reset({
          vendor_code: vendor.vendor_code || '',
          vendor_name: vendor.vendor_name || '',
          contact_person: vendor.contact_person || '',
          phone: vendor.phone || '',
          email: vendor.email || '',
          address: vendor.address || '',
          gst_number: vendor.gst_number || '',
          payment_terms: vendor.payment_terms || 30,
          status: vendor.status || 'active',
          notes: vendor.notes || '',
        });
      } else {
        reset(defaultValues);
      }
    }
  }, [open, vendor]);

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const vendorData = {
        ...data,
        contact_person: data.contact_person || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        gst_number: data.gst_number || undefined,
        payment_terms: data.payment_terms || 30,
        notes: data.notes || undefined,
      };

      if (isEditMode) {
        await vendorService.updateVendor(vendor.id, vendorData);
        toast.success('Vendor updated successfully');
      } else {
        await vendorService.createVendor(vendorData);
        toast.success('Vendor created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Failed to save vendor:', error);
      toast.error(
        error.response?.data?.message ||
        `Failed to ${isEditMode ? 'update' : 'create'} vendor`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditMode ? 'Edit Vendor' : 'Add New Vendor'}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Vendor Code */}
            <Grid item xs={12} md={6}>
              <Controller
                name="vendor_code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Vendor Code"
                    fullWidth
                    required
                    error={!!errors.vendor_code}
                    helperText={errors.vendor_code?.message}
                    disabled={isEditMode}
                  />
                )}
              />
            </Grid>

            {/* Vendor Name */}
            <Grid item xs={12} md={6}>
              <Controller
                name="vendor_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Vendor Name"
                    fullWidth
                    required
                    error={!!errors.vendor_name}
                    helperText={errors.vendor_name?.message}
                  />
                )}
              />
            </Grid>

            {/* Contact Person */}
            <Grid item xs={12} md={6}>
              <Controller
                name="contact_person"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Contact Person"
                    fullWidth
                    error={!!errors.contact_person}
                    helperText={errors.contact_person?.message}
                  />
                )}
              />
            </Grid>

            {/* Phone */}
            <Grid item xs={12} md={6}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Phone"
                    fullWidth
                    error={!!errors.phone}
                    helperText={errors.phone?.message}
                  />
                )}
              />
            </Grid>

            {/* Email */}
            <Grid item xs={12} md={6}>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Email"
                    type="email"
                    fullWidth
                    error={!!errors.email}
                    helperText={errors.email?.message}
                  />
                )}
              />
            </Grid>

            {/* GST Number */}
            <Grid item xs={12} md={6}>
              <Controller
                name="gst_number"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="GST Number"
                    fullWidth
                    error={!!errors.gst_number}
                    helperText={errors.gst_number?.message}
                  />
                )}
              />
            </Grid>

            {/* Payment Terms */}
            <Grid item xs={12} md={6}>
              <Controller
                name="payment_terms"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Payment Terms (Days)"
                    type="number"
                    fullWidth
                    error={!!errors.payment_terms}
                    helperText={errors.payment_terms?.message}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>

            {/* Status */}
            <Grid item xs={12} md={6}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Status"
                    fullWidth
                    required
                    error={!!errors.status}
                    helperText={errors.status?.message}
                  >
                    {statuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {vendorService.getStatusDisplay(status)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            {/* Address */}
            <Grid item xs={12}>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Address"
                    fullWidth
                    multiline
                    rows={2}
                    error={!!errors.address}
                    helperText={errors.address?.message}
                  />
                )}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
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

export default VendorForm;
