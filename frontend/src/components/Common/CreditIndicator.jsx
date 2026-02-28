import { Box, LinearProgress, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { formatCurrency } from '../../utils/formatters';

/**
 * Credit usage indicator with progress bar and color coding
 */
const CreditIndicator = ({ used, limit, showLabel = true }) => {
  const getCreditStatus = () => {
    if (limit === 0) {
      return { color: 'default', percentage: 0, variant: 'determinate' };
    }

    const percentage = Math.min((used / limit) * 100, 100);

    let color = 'success';
    if (percentage > 80) {
      color = 'error';
    } else if (percentage > 50) {
      color = 'warning';
    }

    return { color, percentage, variant: 'determinate' };
  };

  const status = getCreditStatus();

  return (
    <Box sx={{ width: '100%' }}>
      {showLabel && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 0.5
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Credit Used
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            {formatCurrency(used)} / {formatCurrency(limit)}
          </Typography>
        </Box>
      )}

      <LinearProgress
        variant={status.variant}
        value={status.percentage}
        color={status.color}
        sx={{
          height: 8,
          borderRadius: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.08)'
        }}
      />

      {showLabel && (
        <Typography
          variant="caption"
          color={
            status.color === 'error'
              ? 'error.main'
              : status.color === 'warning'
              ? 'warning.main'
              : 'text.secondary'
          }
          sx={{ mt: 0.5, display: 'block' }}
        >
          {status.percentage.toFixed(0)}% utilized
          {status.percentage > 80 && ' - High credit usage!'}
        </Typography>
      )}
    </Box>
  );
};

CreditIndicator.propTypes = {
  used: PropTypes.number.isRequired,
  limit: PropTypes.number.isRequired,
  showLabel: PropTypes.bool
};

export default CreditIndicator;
