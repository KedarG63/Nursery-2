import { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Box, CircularProgress, Chip, TableContainer,
} from '@mui/material';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import { getCustomerProductSummary } from '../../services/customerService';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * "What does this customer buy?" — varieties ranked by spend, with quantity,
 * order count and last purchase date. Read-only; renders nothing on error.
 */
const ProductBreakdown = ({ customerId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await getCustomerProductSummary(customerId);
        if (!cancelled) setRows(res.data || []);
      } catch (err) {
        console.error('Error loading product breakdown:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  if (error) return null;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalFloristIcon color="primary" fontSize="small" />
          <Typography variant="h6">Plants This Customer Buys</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Varieties ranked by total spend — see what they buy and when they last bought it
        </Typography>
      </CardContent>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" variant="body2">No product orders yet</Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Variety</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Orders</TableCell>
                <TableCell align="right">Total Spent</TableCell>
                <TableCell align="right">Last Purchase</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.product_id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={500}>{r.product_name}</Typography>
                      {i === 0 && <Chip label="Top" size="small" color="success" variant="outlined" />}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{r.total_quantity}</TableCell>
                  <TableCell align="right">{r.order_count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.total_spent)}</TableCell>
                  <TableCell align="right">{formatDate(r.last_purchase_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
};

export default ProductBreakdown;
