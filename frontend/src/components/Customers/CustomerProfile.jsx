import {
  Card,
  CardContent,
  Grid,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Divider
} from '@mui/material';
import {
  Edit as EditIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  LocationOn as LocationIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import PropTypes from 'prop-types';
import CreditIndicator from '../Common/CreditIndicator';
import { formatPhone, formatCurrency } from '../../utils/formatters';

/**
 * Customer Profile Component
 * Displays customer information, credit status, and addresses
 */
const CustomerProfile = ({ customer, onEdit }) => {
  const getCustomerTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'wholesale':
        return 'primary';
      case 'retail':
        return 'success';
      case 'distributor':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Grid container spacing={3}>
      {/* Customer Info Card */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Customer Information
              </Typography>
              {onEdit && (
                <IconButton size="small" onClick={onEdit} color="primary">
                  <EditIcon />
                </IconButton>
              )}
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                {customer.name}
              </Typography>
              <Chip
                label={customer.customer_type}
                color={getCustomerTypeColor(customer.customer_type)}
                size="small"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2">
                  {formatPhone(customer.phone)}
                </Typography>
              </Box>

              {customer.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon fontSize="small" color="action" />
                  <Typography variant="body2">{customer.email}</Typography>
                </Box>
              )}

              {customer.whatsapp_number && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WhatsAppIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    {formatPhone(customer.whatsapp_number)}
                    {customer.whatsapp_opt_in && (
                      <Chip
                        label="Notifications ON"
                        size="small"
                        color="success"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Credit Info Card */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Credit Information
            </Typography>

            <Box sx={{ mt: 3 }}>
              <CreditIndicator
                used={customer.credit_used || 0}
                limit={customer.credit_limit || 0}
                showLabel={true}
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Credit Available
                </Typography>
                <Typography variant="h6" color="success.main">
                  {formatCurrency(
                    (customer.credit_limit || 0) - (customer.credit_used || 0)
                  )}
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Credit Days
                </Typography>
                <Typography variant="h6">
                  {customer.credit_days || 0} days
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Addresses */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Delivery Addresses
            </Typography>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              {customer.addresses && customer.addresses.length > 0 ? (
                customer.addresses.map((address, index) => (
                  <Grid item xs={12} md={6} key={address.id || index}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        position: 'relative',
                        bgcolor: address.is_default ? 'action.hover' : 'background.paper'
                      }}
                    >
                      {address.is_default && (
                        <Chip
                          label="Default"
                          size="small"
                          color="primary"
                          icon={<CheckCircleIcon />}
                          sx={{ position: 'absolute', top: 8, right: 8 }}
                        />
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <LocationIcon fontSize="small" color="action" sx={{ mt: 0.5 }} />
                        <Box>
                          <Typography variant="body2">
                            {address.address_line1}
                          </Typography>
                          {address.address_line2 && (
                            <Typography variant="body2">
                              {address.address_line2}
                            </Typography>
                          )}
                          <Typography variant="body2">
                            {address.city}, {address.state} - {address.pincode}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                ))
              ) : (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    No addresses added
                  </Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

CustomerProfile.propTypes = {
  customer: PropTypes.object.isRequired,
  onEdit: PropTypes.func
};

export default CustomerProfile;
