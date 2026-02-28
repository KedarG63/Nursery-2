import { Chip } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * Status badge component with color coding
 * Used for displaying order/payment/delivery statuses
 */
const StatusBadge = ({ status, variant = 'filled', size = 'small' }) => {
  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';

    // Order statuses
    if (statusLower === 'pending') return 'warning';
    if (statusLower === 'confirmed') return 'info';
    if (statusLower === 'ready') return 'primary';
    if (statusLower === 'dispatched') return 'secondary';
    if (statusLower === 'delivered') return 'success';
    if (statusLower === 'cancelled') return 'error';

    // Payment statuses
    if (statusLower === 'paid') return 'success';
    if (statusLower === 'partial') return 'warning';
    if (statusLower === 'unpaid') return 'error';
    if (statusLower === 'refunded') return 'default';

    // Delivery statuses
    if (statusLower === 'in_transit') return 'secondary';
    if (statusLower === 'failed') return 'error';

    // Default
    return 'default';
  };

  if (!status) return null;

  return (
    <Chip
      label={status}
      color={getStatusColor(status)}
      variant={variant}
      size={size}
      sx={{
        textTransform: 'capitalize',
        fontWeight: 500
      }}
    />
  );
};

StatusBadge.propTypes = {
  status: PropTypes.string,
  variant: PropTypes.oneOf(['filled', 'outlined']),
  size: PropTypes.oneOf(['small', 'medium'])
};

export default StatusBadge;
