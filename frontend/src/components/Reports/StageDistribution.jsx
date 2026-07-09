/**
 * Stage Distribution Component
 * Donut of available plants per growth stage. Data rows come from the
 * inventory report as { stage, lotCount, totalQuantity, availableQuantity }.
 * Stages are an ordered lifecycle, so the colors run soil-brown → deep leaf.
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Paper, Typography } from '@mui/material';
import { TOOLTIP_STYLE } from '../../utils/chartTheme';

// Maturity progression: soil → sprout → sapling → bed → saleable → gone
const STAGE_COLORS = {
  seed: '#8d6e63',
  germination: '#9e9d24',
  seedling: '#689f38',
  transplant: '#43a047',
  ready: '#2e7d32',
  sold: '#1A3329',
};

const STAGE_ORDER = ['seed', 'germination', 'seedling', 'transplant', 'ready', 'sold'];

const StageDistribution = ({ data }) => {
  const chartData = [...(data || [])].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight={700}>Growth Stages</Typography>
      <Typography variant="body2" color="text.secondary" mb={1}>
        Available plants at each stage
      </Typography>
      {chartData.length === 0 ? (
        <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
          No lots recorded yet
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="availableQuantity"
              nameKey="stage"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] || '#90a4ae'} />
              ))}
            </Pie>
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name, item) => [
                `${Number(value).toLocaleString('en-IN')} plants · ${item.payload.lotCount} lot${item.payload.lotCount !== 1 ? 's' : ''}`,
                name,
              ]}
            />
            <Legend iconType="circle" iconSize={9} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
};

export default StageDistribution;
