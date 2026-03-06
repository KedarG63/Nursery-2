import { useState, useEffect } from 'react';
import {
  Box,
  Autocomplete,
  TextField,
  Typography,
  Alert,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import { Warning as WarningIcon, DirectionsWalk as WalkInIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import PropTypes from 'prop-types';
import { toast } from 'react-toastify';
import { getCustomers, getCustomer, createCustomer, createAddress } from '../../services/customerService';
import { formatCurrency, formatPhone } from '../../utils/formatters';

/**
 * Customer Selection Component for Order Wizard
 * Step 1: Select customer for the order
 */
const WALK_IN_NAME = 'Walk-in Customer';

// Default nursery pickup address used for walk-in customers
const NURSERY_PICKUP_ADDRESS = {
  address_line1: 'Nursery Counter / Pickup',
  city: 'Local Pickup',
  state: 'Maharashtra',
  pincode: '411001',
  is_default: true,
};

const CustomerSelect = ({ selectedCustomer, onCustomerSelect, onWalkInName }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [showWalkInName, setShowWalkInName] = useState(false);
  const [inputValue, setInputValue] = useState('');

  /**
   * Fetch customers for autocomplete
   */
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const response = await getCustomers({ limit: 100 });
        setCustomers(response.data || response.customers || []);
      } catch (error) {
        console.error('Error fetching customers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  /**
   * Find or create the walk-in customer and auto-select it
   */
  const handleWalkIn = async () => {
    // Show name field immediately — API resolves in background
    setShowWalkInName(true);
    setWalkInLoading(true);
    try {
      // Check if walk-in customer already exists in loaded list
      let walkIn = customers.find(
        (c) => c.name.toLowerCase() === WALK_IN_NAME.toLowerCase()
      );

      if (!walkIn) {
        // Search via API in case it exists but wasn't loaded
        const response = await getCustomers({ search: WALK_IN_NAME, limit: 5 });
        const found = (response.data || response.customers || []).find(
          (c) => c.name.toLowerCase() === WALK_IN_NAME.toLowerCase()
        );
        if (found) {
          walkIn = found;
          setCustomers((prev) => [...prev, found]);
        }
      }

      if (!walkIn) {
        // Create the walk-in customer (backend restores if soft-deleted, creates if new)
        const created = await createCustomer({
          name: WALK_IN_NAME,
          customer_type: 'retailer',
          phone: '+919999999999',
          credit_limit: 0,
          credit_days: 1,
          notes: 'Auto-created for one-time / cash walk-in sales',
          addresses: [NURSERY_PICKUP_ADDRESS],
        });
        walkIn = created.data || created.customer || created;
        setCustomers((prev) => [...prev, walkIn]);
      } else {
        // Existing walk-in customer: ensure they have at least one address
        const fullResponse = await getCustomer(walkIn.id);
        const fullData = fullResponse.data || fullResponse;
        const existingAddresses = fullData.addresses || [];
        if (existingAddresses.length === 0) {
          await createAddress({ customer_id: walkIn.id, ...NURSERY_PICKUP_ADDRESS });
        }
      }

      onCustomerSelect(walkIn);
    } catch (error) {
      console.error('Failed to set walk-in customer:', error);
      toast.error(error?.error || error?.message || 'Failed to set up walk-in customer');
    } finally {
      setWalkInLoading(false);
    }
  };

  const handleWalkInNameChange = (e) => {
    const name = e.target.value;
    setWalkInName(name);
    if (onWalkInName) onWalkInName(name, walkInPhone);
  };

  const handleWalkInPhoneChange = (e) => {
    const phone = e.target.value.replace(/\D/g, '').slice(0, 10);
    setWalkInPhone(phone);
    if (onWalkInName) onWalkInName(walkInName, phone);
  };

  /**
   * Get credit status for customer
   */
  const getCreditStatus = (customer) => {
    if (!customer) return null;

    const creditLimit = customer.credit_limit || 0;
    const creditUsed = customer.credit_used || 0;
    const creditAvailable = creditLimit - creditUsed;

    if (creditAvailable <= 0) {
      return { type: 'error', message: 'Credit limit exceeded!' };
    }

    if (creditAvailable < creditLimit * 0.2) {
      return { type: 'warning', message: 'Low credit available' };
    }

    return { type: 'success', message: 'Good credit status' };
  };

  const creditStatus = getCreditStatus(selectedCustomer);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Customer
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Choose the customer for this order
      </Typography>

      <Box sx={{ mt: 3 }}>
        <Autocomplete
          options={customers}
          loading={loading}
          value={selectedCustomer}
          onChange={(event, newValue) => onCustomerSelect(newValue)}
          inputValue={inputValue}
          onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
          getOptionLabel={(customer) =>
            `${customer.name} - ${formatPhone(customer.phone)}`
          }
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search Customer"
              placeholder="Type customer name or phone..."
              required
            />
          )}
          renderOption={(props, customer) => (
            <Box component="li" {...props}>
              <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">{customer.name}</Typography>
                  <Chip
                    label={customer.customer_type}
                    size="small"
                    color="primary"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {formatPhone(customer.phone)} • Credit: {formatCurrency((customer.credit_limit || 0) - (customer.credit_used || 0))}
                </Typography>
              </Box>
            </Box>
          )}
          noOptionsText="No customers found"
        />

        <Divider sx={{ my: 2 }}>or</Divider>

        {!showWalkInName ? (
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<WalkInIcon />}
            onClick={handleWalkIn}
            fullWidth
          >
            Walk-in / Cash Customer
          </Button>
        ) : (
          <Box>
            <TextField
              fullWidth
              autoFocus
              label="Customer Name (optional)"
              placeholder="e.g. Ramesh Sharma"
              value={walkInName}
              onChange={handleWalkInNameChange}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              label="Mobile Number (optional)"
              placeholder="e.g. 9876543210"
              value={walkInPhone}
              onChange={handleWalkInPhoneChange}
              inputProps={{ maxLength: 10, inputMode: 'numeric' }}
              InputProps={{
                startAdornment: <span style={{ marginRight: 4, color: '#666' }}>+91</span>,
                endAdornment: !walkInLoading && selectedCustomer
                  ? <CheckIcon color="success" fontSize="small" />
                  : null,
              }}
              helperText={
                walkInLoading
                  ? 'Setting up walk-in account...'
                  : selectedCustomer
                  ? 'Ready — click Next to continue'
                  : 'Enter 10-digit number for the sales record'
              }
            />
            <Button
              size="small"
              onClick={() => {
                setShowWalkInName(false);
                setWalkInName('');
                setWalkInPhone('');
                onCustomerSelect(null);
                if (onWalkInName) onWalkInName('', '');
              }}
              sx={{ mt: 0.5 }}
            >
              ← Back to customer search
            </Button>
          </Box>
        )}
      </Box>

      {/* Selected Customer Details */}
      {selectedCustomer && (
        <Box sx={{ mt: 3 }}>
          <Alert severity={creditStatus?.type || 'info'} icon={<WarningIcon />}>
            <Typography variant="subtitle2" gutterBottom>
              {showWalkInName
                ? (walkInName || 'Walk-in Customer')
                : selectedCustomer.name}{' '}
              ({selectedCustomer.customer_type})
            </Typography>
            {showWalkInName && walkInPhone && (
              <Typography variant="body2">
                Mobile: +91 {walkInPhone.slice(0, 5)} {walkInPhone.slice(5)}
              </Typography>
            )}
            <Typography variant="body2">
              Credit Limit: {formatCurrency(selectedCustomer.credit_limit || 0)}
            </Typography>
            <Typography variant="body2">
              Credit Used: {formatCurrency(selectedCustomer.credit_used || 0)}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              Available: {formatCurrency((selectedCustomer.credit_limit || 0) - (selectedCustomer.credit_used || 0))}
            </Typography>
            {creditStatus && (
              <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                {creditStatus.message}
              </Typography>
            )}
          </Alert>
        </Box>
      )}
    </Box>
  );
};

CustomerSelect.propTypes = {
  selectedCustomer: PropTypes.object,
  onCustomerSelect: PropTypes.func.isRequired,
  onWalkInName: PropTypes.func,
};

export default CustomerSelect;
