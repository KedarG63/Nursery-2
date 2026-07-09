/**
 * Top Products Component
 * Horizontal bars of top sellers. Data rows come from the sales report as
 * { productName, skuCode, quantity, revenue } — `productName` is the y key.
 * One measure → one hue (revenue is money in, so leaf green).
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Paper, Typography } from '@mui/material';
import {
  LEAF, GRID_STROKE, TICK_STYLE, TOOLTIP_STYLE, compactINR, fullINR,
} from '../../utils/chartTheme';

const TopProducts = ({ data }) => {
  const rows = (data || []).map((d) => ({
    ...d,
    label: d.skuCode ? `${d.productName} · ${d.skuCode}` : d.productName,
  }));

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={700}>Top Products by Revenue</Typography>
      <Typography variant="body2" color="text.secondary" mb={1.5}>
        Best-selling varieties in the selected period
      </Typography>
      <ResponsiveContainer width="100%" height={Math.max(rows.length * 40 + 40, 160)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" tickFormatter={compactINR} tick={TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis dataKey="label" type="category" width={170}
            tick={{ ...TICK_STYLE, fill: '#3d453c' }} axisLine={false} tickLine={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value, name) => (name === 'Revenue' ? [fullINR(value), name] : [value, name])}
          />
          <Bar dataKey="revenue" name="Revenue" fill={LEAF} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default TopProducts;
