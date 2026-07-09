/**
 * Stock Levels Component
 * Table of current stock per variety. Data rows come from the inventory
 * report as { skuName, productName, currentStock, minLevel, isLowStock }.
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
  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No stock data available</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Variety</TableCell>
            <TableCell align="right">Current Stock</TableCell>
            <TableCell align="right">Min Level</TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((item) => (
            <TableRow
              key={item.skuId}
              hover
              sx={{ bgcolor: item.isLowStock ? '#fdecea' : 'inherit' }}
            >
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {item.isLowStock
                    ? <WarningIcon color="error" fontSize="small" />
                    : <CheckIcon color="success" fontSize="small" />}
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{item.productName}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.skuName}</Typography>
                  </Box>
                </Box>
              </TableCell>
              <TableCell align="right">
                <Typography
                  variant="body2"
                  fontWeight={item.isLowStock ? 700 : 400}
                  color={item.isLowStock ? 'error' : 'inherit'}
                >
                  {Number(item.currentStock).toLocaleString('en-IN')}
                </Typography>
              </TableCell>
              <TableCell align="right">{Number(item.minLevel).toLocaleString('en-IN')}</TableCell>
              <TableCell align="center">
                <Chip
                  label={item.isLowStock ? 'LOW' : 'OK'}
                  size="small"
                  color={item.isLowStock ? 'error' : 'success'}
                  variant={item.isLowStock ? 'filled' : 'outlined'}
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
