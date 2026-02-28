import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent
} from '@mui/lab';
import { Typography, Paper, Box } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  LocalShipping as ShippingIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import PropTypes from 'prop-types';
import { formatDateTime } from '../../utils/formatters';

/**
 * Order Timeline Component
 * Displays order status history in timeline format
 */
const OrderTimeline = ({ timeline }) => {
  /**
   * Get icon for status
   */
  const getStatusIcon = (status) => {
    const statusLower = status?.toLowerCase() || '';

    if (statusLower === 'delivered') return <CheckCircleIcon />;
    if (statusLower === 'dispatched') return <ShippingIcon />;
    if (statusLower === 'cancelled') return <CancelIcon />;
    return <PendingIcon />;
  };

  /**
   * Get color for status
   */
  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';

    if (statusLower === 'delivered') return 'success';
    if (statusLower === 'dispatched') return 'secondary';
    if (statusLower === 'cancelled') return 'error';
    if (statusLower === 'ready') return 'primary';
    if (statusLower === 'confirmed') return 'info';
    return 'warning';
  };

  if (!timeline || timeline.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No status history available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Status Timeline
      </Typography>

      <Timeline position="alternate">
        {timeline.map((event, index) => {
          const isLast = index === timeline.length - 1;

          return (
            <TimelineItem key={event.id || index}>
              <TimelineOppositeContent color="text.secondary">
                <Typography variant="caption">
                  {formatDateTime(event.created_at || event.timestamp)}
                </Typography>
              </TimelineOppositeContent>

              <TimelineSeparator>
                <TimelineDot color={getStatusColor(event.status)}>
                  {getStatusIcon(event.status)}
                </TimelineDot>
                {!isLast && <TimelineConnector />}
              </TimelineSeparator>

              <TimelineContent>
                <Typography variant="h6" component="span">
                  {event.status}
                </Typography>
                {event.notes && (
                  <Typography variant="body2" color="text.secondary">
                    {event.notes}
                  </Typography>
                )}
                {event.user_name && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    by {event.user_name}
                  </Typography>
                )}
              </TimelineContent>
            </TimelineItem>
          );
        })}
      </Timeline>
    </Paper>
  );
};

OrderTimeline.propTypes = {
  timeline: PropTypes.array.isRequired
};

export default OrderTimeline;
