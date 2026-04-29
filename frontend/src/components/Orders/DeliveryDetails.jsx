import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Paper,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Alert,
} from '@mui/material';
import { toast } from 'react-toastify';
import customerService from '../../services/customerService';

const WALK_IN_NAME = 'Walk-in Customer';

/**
 * Delivery Details Component
 * Select delivery address and date
 * Issue #57: Order creation wizard - Step 3
 */
const DeliveryDetails = ({ customer, deliveryAddress, deliveryDate, deliverySlot, onDeliveryChange }) => {
  const isWalkIn = customer?.name === WALK_IN_NAME;
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer?.id) {
      fetchCustomerAddresses();
    }
  }, [customer]);

  const fetchCustomerAddresses = async () => {
    try {
      setLoading(true);
      const response = await customerService.getCustomer(customer.id);
      const customerData = response.data || response.customer || response;
      setAddresses(customerData.addresses || []);

      // Auto-select default address if available
      if (!deliveryAddress && customerData.addresses && customerData.addresses.length > 0) {
        const defaultAddr = customerData.addresses.find(addr => addr.is_default) || customerData.addresses[0];
        onDeliveryChange('deliveryAddress', defaultAddr);
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
      toast.error('Failed to load customer addresses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddressChange = (event) => {
    const selectedAddress = addresses.find(addr => addr.id === event.target.value);
    onDeliveryChange('deliveryAddress', selectedAddress);
  };

  const handleDateChange = (event) => {
    onDeliveryChange('deliveryDate', event.target.value);
  };

  const handleSlotChange = (event) => {
    onDeliveryChange('deliverySlot', event.target.value);
  };


  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Delivery Details
      </Typography>

      <Grid container spacing={3}>
        {/* Walk-in: counter pickup — no address needed */}
        {isWalkIn ? (
          <Grid item xs={12}>
            <Alert severity="info">
              Walk-in / counter pickup — no delivery address required. Customer collects at nursery.
            </Alert>
          </Grid>
        ) : (
          <>
            {/* Delivery Address */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Delivery Address *</InputLabel>
                  <Select
                    value={deliveryAddress?.id || ''}
                    onChange={handleAddressChange}
                    label="Delivery Address *"
                    disabled={loading || addresses.length === 0}
                  >
                    {addresses.map((address) => (
                      <MenuItem key={address.id} value={address.id}>
                        <Box>
                          <Typography variant="body1">
                            {address.address_line1}
                            {address.is_default && (
                              <Typography component="span" color="primary" sx={{ ml: 1, fontSize: '0.75rem' }}>
                                (Default)
                              </Typography>
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {address.address_line2 && `${address.address_line2}, `}
                            {address.city}, {address.state} - {address.pincode}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {addresses.length === 0 && !loading && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    No addresses found for this customer. Please add an address in the customer profile.
                  </Typography>
                )}
              </Paper>
            </Grid>

            {/* Selected Address Preview */}
            {deliveryAddress && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Selected Address:
                  </Typography>
                  <Typography variant="body2">
                    {deliveryAddress.address_line1}
                  </Typography>
                  {deliveryAddress.address_line2 && (
                    <Typography variant="body2">
                      {deliveryAddress.address_line2}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    {deliveryAddress.city}, {deliveryAddress.state} - {deliveryAddress.pincode}
                  </Typography>
                  {deliveryAddress.phone && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Phone: {deliveryAddress.phone}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            )}
          </>
        )}

        {/* Delivery Date */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="date"
            label={isWalkIn ? 'Sale Date (optional)' : 'Delivery Date *'}
            value={deliveryDate || ''}
            onChange={handleDateChange}
            InputLabelProps={{
              shrink: true,
            }}
            inputProps={{
              max: '2099-12-31',
            }}
          />
        </Grid>

        {/* Delivery Time Slot */}
        <Grid item xs={12} md={6}>
          <FormControl component="fieldset" fullWidth>
            <FormLabel component="legend">Delivery Time Slot</FormLabel>
            <RadioGroup
              row
              value={deliverySlot || 'morning'}
              onChange={handleSlotChange}
            >
              <FormControlLabel value="morning" control={<Radio />} label="Morning (8 AM - 12 PM)" />
              <FormControlLabel value="afternoon" control={<Radio />} label="Afternoon (12 PM - 5 PM)" />
              <FormControlLabel value="evening" control={<Radio />} label="Evening (5 PM - 8 PM)" />
            </RadioGroup>
          </FormControl>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DeliveryDetails;
