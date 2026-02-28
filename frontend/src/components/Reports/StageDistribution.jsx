/**
 * Stage Distribution Component
 * Donut chart showing growth stage distribution
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Paper, Typography } from '@mui/material';

const STAGE_COLORS = {
  seedling: '#8BC34A',
  vegetative: '#4CAF50',
  flowering: '#FF9800',
  ready: '#2196F3',
};

const StageDistribution = ({ data }) => {
  const chartData = data || [];

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Growth Stage Distribution
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="count"
            nameKey="stage"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            label={(entry) => `${entry.stage}: ${entry.count}`}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] || '#999'} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default StageDistribution;
