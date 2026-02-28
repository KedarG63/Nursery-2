import { useState, useEffect } from 'react';
import {
  Box,
  Autocomplete,
  TextField,
  Typography,
  Alert,
  Chip
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import PropTypes from 'prop-types';
import { getCustomers } from '../../services/customerService';
import { formatCurrency, formatPhone } from '../../utils/formatters';

/**
 * Customer Selection Component for Order Wizard
 * Step 1: Select customer for the order
 */
const CustomerSelect = ({ selectedCustomer, onCustomerSelect }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
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
      </Box>

      {/* Selected Customer Details */}
      {selectedCustomer && (
        <Box sx={{ mt: 3 }}>
          <Alert severity={creditStatus?.type || 'info'} icon={<WarningIcon />}>
            <Typography variant="subtitle2" gutterBottom>
              {selectedCustomer.name} ({selectedCustomer.customer_type})
            </Typography>
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
  onCustomerSelect: PropTypes.func.isRequired
};

export default CustomerSelect;
