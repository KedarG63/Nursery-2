/**
 * Stock Levels Component
 * Table showing current stock levels with status indicators
 */

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography,
  Box,
} from '@mui/material';
import { Warning as WarningIcon, CheckCircle as CheckIcon } from '@mui/icons-material';

const StockLevels = ({ data }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'low':
        return 'error';
      case 'adequate':
        return 'success';
      case 'high':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (currentStock, minThreshold, maxThreshold) => {
    if (currentStock < minThreshold) {
      return <WarningIcon color="error" fontSize="small" />;
    } else if (currentStock >= minThreshold && currentStock <= maxThreshold) {
      return <CheckIcon color="success" fontSize="small" />;
    }
    return <CheckIcon color="info" fontSize="small" />;
  };

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No stock data available</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>SKU Name</TableCell>
            <TableCell align="right">Current Stock</TableCell>
            <TableCell align="right">Min Threshold</TableCell>
            <TableCell align="right">Max Threshold</TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={index}
              sx={{
                bgcolor: item.status === 'low' ? '#ffebee' : 'inherit',
              }}
            >
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getStatusIcon(item.current_stock, item.min_threshold, item.max_threshold)}
                  <Typography variant="body2">{item.sku_name}</Typography>
                </Box>
              </TableCell>
              <TableCell align="right">
                <Typography
                  variant="body2"
                  fontWeight={item.status === 'low' ? 'bold' : 'normal'}
                  color={item.status === 'low' ? 'error' : 'inherit'}
                >
                  {item.current_stock}
                </Typography>
              </TableCell>
              <TableCell align="right">{item.min_threshold}</TableCell>
              <TableCell align="right">{item.max_threshold}</TableCell>
              <TableCell align="center">
                <Chip
                  label={item.status?.toUpperCase()}
                  size="small"
                  color={getStatusColor(item.status)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default StockLevels;
