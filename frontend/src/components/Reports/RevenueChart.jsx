/**
 * Revenue Chart Component
 * Area chart of collections over time. Data rows come from the sales report
 * as { period, revenue, orderCount, paymentCount } — `period` is the x key.
 */

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Paper, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import {
  LEAF, GRID_STROKE, TICK_STYLE, AXIS_LINE, TOOLTIP_STYLE, compactINR, fullINR,
} from '../../utils/chartTheme';

const RevenueChart = ({ data, groupBy = 'day' }) => {
  const formatXAxis = (dateStr) => {
    try {
      const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
      return groupBy === 'month' ? format(date, 'MMM yyyy') : format(date, 'dd MMM');
    } catch (error) {
      return dateStr;
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={700}>Revenue Trend</Typography>
      <Typography variant="body2" color="text.secondary" mb={1.5}>
        Payments collected per {groupBy}
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={LEAF} stopOpacity={0.25} />
              <stop offset="95%" stopColor={LEAF} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="period" tickFormatter={formatXAxis} tick={TICK_STYLE}
            axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={compactINR} tick={TICK_STYLE} axisLine={false} tickLine={false} width={70} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value) => [fullINR(value), 'Revenue']}
            labelFormatter={(label) => formatXAxis(label)}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={LEAF}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            name="Revenue"
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default RevenueChart;
