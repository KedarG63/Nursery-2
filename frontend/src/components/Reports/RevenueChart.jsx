/**
 * Revenue Chart Component
 * Line/Area chart showing revenue trends
 */

import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';

const RevenueChart = ({ data, groupBy = 'day' }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatXAxis = (dateStr) => {
    try {
      const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
      if (groupBy === 'day') {
        return format(date, 'dd MMM');
      } else if (groupBy === 'week') {
        return format(date, 'dd MMM');
      } else {
        return format(date, 'MMM yyyy');
      }
    } catch (error) {
      return dateStr;
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Revenue Trend
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatXAxis} />
          <YAxis tickFormatter={formatCurrency} />
          <Tooltip
            formatter={(value) => formatCurrency(value)}
            labelFormatter={(label) => formatXAxis(label)}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#8884d8"
            fillOpacity={1}
            fill="url(#colorRevenue)"
            name="Revenue"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default RevenueChart;
