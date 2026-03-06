import { useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Box,
  Typography
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PropTypes from 'prop-types';
import AddressFields from './AddressFields';

/**
 * Validation schema for customer form
 */
const addressSchema = z.object({
  address_line1: z.string().min(1, 'Address line 1 is required'),
  address_line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  is_default: z.boolean().optional()
});

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().regex(/^[6-9][0-9]{9}$/, 'Must be a valid 10-digit Indian mobile number (starts with 6-9)'),
  whatsapp_number: z
    .string()
    .regex(/^[6-9][0-9]{9}$/, 'Must be a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),
  customer_type: z.enum(['farmer', 'retailer', 'home_gardener', 'institutional']),
  // User enters 10 digits; +91 is prepended automatically on submit
  credit_limit: z.number().min(0, 'Credit limit cannot be negative'),
  credit_days: z
    .number()
    .min(1, 'Credit days must be at least 1')
    .max(365, 'Credit days cannot exceed 365'),
  whatsapp_opt_in: z.boolean().optional(),
  addresses: z.array(addressSchema).min(1, 'At least one address is required')
});

/**
 * Customer Form Component
 * Issue #55: Create/Edit customer with address management
 */
const CustomerForm = ({ open, customer, onClose, onSubmit, loading }) => {
  const isEditMode = !!customer?.id;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      whatsapp_number: '',
      customer_type: 'retailer',
      credit_limit: 0,
      credit_days: 30,
      whatsapp_opt_in: false,
      addresses: [
        {
          address_line1: '',
          address_line2: '',
          city: '',
          state: '',
          pincode: '',
          is_default: true
        }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'addresses'
  });

  /**
   * Load customer data when editing
   */
  useEffect(() => {
    if (customer && open) {
      reset({
        name: customer.name || '',
        email: customer.email || '',
        // Strip +91 prefix so the 10-digit input field shows correctly
        phone: (customer.phone || '').replace(/^\+91/, ''),
        whatsapp_number: (customer.whatsapp_number || '').replace(/^\+91/, ''),
        customer_type: customer.customer_type || 'retailer',
        credit_limit: customer.credit_limit || 0,
        credit_days: customer.credit_days || 30,
        whatsapp_opt_in: customer.whatsapp_opt_in || false,
        addresses: customer.addresses?.length
          ? customer.addresses
          : [
              {
                address_line1: '',
                address_line2: '',
                city: '',
                state: '',
                pincode: '',
                is_default: true
              }
            ]
      });
    } else if (!customer && open) {
      reset();
    }
  }, [customer, open, reset]);

  /**
   * Handle form submission
   */
  const handleFormSubmit = (data) => {
    // Ensure at least one address is default
    const hasDefault = data.addresses.some((addr) => addr.is_default);
    if (!hasDefault && data.addresses.length > 0) {
      data.addresses[0].is_default = true;
    }

    // Prepend +91 country code — DB constraint requires +91XXXXXXXXXX format
    // Strip empty strings so backend .optional() validators skip them correctly
    onSubmit({
      ...data,
      email: data.email || undefined,
      phone: `+91${data.phone}`,
      whatsapp_number: data.whatsapp_number ? `+91${data.whatsapp_number}` : `+91${data.phone}`,
    });
  };

  /**
   * Handle add address
   */
  const handleAddAddress = () => {
    append({
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: '',
      is_default: false
    });
  };

  /**
   * Handle close dialog
   */
  const handleClose = () => {
    if (!loading) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Basic Information
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Name"
                {...register('name')}
                error={!!errors.name}
                helperText={errors.name?.message}
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Customer Type *</InputLabel>
                <Select {...register('customer_type')} label="Customer Type *" required>
                  <MenuItem value="farmer">Farmer</MenuItem>
                  <MenuItem value="retailer">Retailer</MenuItem>
                  <MenuItem value="home_gardener">Home Gardener</MenuItem>
                  <MenuItem value="institutional">Institutional</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                {...register('phone')}
                error={!!errors.phone}
                helperText={errors.phone?.message || '10-digit mobile number'}
                required
                inputProps={{ maxLength: 10 }}
                InputProps={{ startAdornment: <span style={{ marginRight: 4, color: '#666' }}>+91</span> }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                {...register('email')}
                error={!!errors.email}
                helperText={errors.email?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="WhatsApp Number"
                {...register('whatsapp_number')}
                error={!!errors.whatsapp_number}
                helperText={errors.whatsapp_number?.message || 'Leave blank to use same as phone'}
                inputProps={{ maxLength: 10 }}
                InputProps={{ startAdornment: <span style={{ marginRight: 4, color: '#666' }}>+91</span> }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Checkbox {...register('whatsapp_opt_in')} />}
                label="WhatsApp notifications enabled"
              />
            </Grid>

            {/* Credit Information */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Credit Information
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Credit Limit"
                type="number"
                {...register('credit_limit', { valueAsNumber: true })}
                error={!!errors.credit_limit}
                helperText={errors.credit_limit?.message}
                InputProps={{ inputProps: { min: 0, step: 100 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Credit Days"
                type="number"
                {...register('credit_days', { valueAsNumber: true })}
                error={!!errors.credit_days}
                helperText={errors.credit_days?.message}
                InputProps={{ inputProps: { min: 0, max: 365 } }}
              />
            </Grid>

            {/* Addresses */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle2" color="primary">
                  Delivery Addresses
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddAddress}
                  variant="outlined"
                >
                  Add Address
                </Button>
              </Box>
            </Grid>

            <Grid item xs={12}>
              {fields.map((field, index) => (
                <AddressFields
                  key={field.id}
                  address={field}
                  index={index}
                  register={register}
                  errors={errors}
                  onRemove={remove}
                  canRemove={fields.length > 1}
                />
              ))}
            </Grid>

            {errors.addresses?.root && (
              <Grid item xs={12}>
                <Typography color="error" variant="caption">
                  {errors.addresses.root.message}
                </Typography>
              </Grid>
            )}
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

CustomerForm.propTypes = {
  open: PropTypes.bool.isRequired,
  customer: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

export default CustomerForm;
