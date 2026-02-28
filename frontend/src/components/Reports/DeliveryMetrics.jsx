/**
 * Delivery Metrics Component
 * KPI cards showing delivery performance metrics
 */

import { Grid, Card, CardContent, Typography, Box, LinearProgress } from '@mui/material';
import {
  LocalShipping as DeliveryIcon,
  Schedule as TimeIcon,
  CheckCircle as SuccessIcon,
  Error as FailIcon,
} from '@mui/icons-material';

const DeliveryMetrics = ({ kpis }) => {
  const metrics = [
    {
      title: 'On-Time Delivery Rate',
      value: `${kpis?.on_time_rate || 0}%`,
      icon: <SuccessIcon />,
      color: '#4caf50',
      bgColor: '#e8f5e9',
      progress: kpis?.on_time_rate || 0,
    },
    {
      title: 'Avg Delivery Time',
      value: `${kpis?.avg_delivery_time_minutes || 0} min`,
      icon: <TimeIcon />,
      color: '#2196f3',
      bgColor: '#e3f2fd',
    },
    {
      title: 'Total Deliveries',
      value: kpis?.total_deliveries || 0,
      icon: <DeliveryIcon />,
      color: '#ff9800',
      bgColor: '#fff3e0',
    },
    {
      title: 'Failed Deliveries',
      value: kpis?.failed_deliveries || 0,
      icon: <FailIcon />,
      color: '#f44336',
      bgColor: '#ffebee',
    },
  ];

  return (
    <Grid container spacing={3}>
      {metrics.map((metric, index) => (
        <Grid item xs={12} sm={6} md={3} key={index}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: metric.bgColor,
                    color: metric.color,
                    mr: 2,
                  }}
                >
                  {metric.icon}
                </Box>
                <Typography variant="h5" component="div" color={metric.color}>
                  {metric.value}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {metric.title}
              </Typography>
              {metric.progress !== undefined && (
                <LinearProgress
                  variant="determinate"
                  value={metric.progress}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 3,
                    bgcolor: metric.bgColor,
                    '& .MuiLinearProgress-bar': {
                      bgcolor: metric.color,
                    },
                  }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default DeliveryMetrics;
