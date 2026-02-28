/**
 * Driver Performance Component
 * Bar chart comparing driver performance metrics
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography } from '@mui/material';

const DriverPerformance = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No driver performance data available</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Driver Performance Comparison
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="driver_name" />
          <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
          <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
          <Tooltip />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="deliveries"
            fill="#8884d8"
            name="Total Deliveries"
          />
          <Bar
            yAxisId="right"
            dataKey="on_time_rate"
            fill="#82ca9d"
            name="On-Time Rate (%)"
          />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default DriverPerformance;
