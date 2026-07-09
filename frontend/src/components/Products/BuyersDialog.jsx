import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Link, Chip,
  TableContainer,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { Link as RouterLink } from 'react-router-dom';
import productService from '../../services/productService';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * "Who buys this variety?" — customers ranked by spend, with a WhatsApp
 * shortcut so staff can notify buyers when a fresh lot is ready.
 */
const BuyersDialog = ({ open, product, onClose }) => {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !product?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await productService.getProductBuyers(product.id);
        if (!cancelled) setBuyers(res.data?.buyers || []);
      } catch (err) {
        console.error('Error loading buyers:', err);
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load buyers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, product?.id]);

  const waLink = (number) => `https://wa.me/${String(number).replace(/[^0-9]/g, '')}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleIcon color="primary" />
          <Box>
            <Typography variant="h6" component="span">Who Buys {product?.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Customers ranked by total spend — useful when a new lot is ready
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>}
        {!loading && error && (
          <Typography color="error" sx={{ p: 3 }}>{error}</Typography>
        )}
        {!loading && !error && buyers.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ py: 5 }}>
            No customer has ordered this variety yet
          </Typography>
        )}
        {!loading && !error && buyers.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Orders</TableCell>
                  <TableCell align="right">Total Spent</TableCell>
                  <TableCell align="right">Last Purchase</TableCell>
                  <TableCell align="center">Contact</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {buyers.map((b, i) => (
                  <TableRow key={b.customer_id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Link component={RouterLink} to={`/customers/${b.customer_id}`} underline="hover">
                          {b.customer_name}
                        </Link>
                        {i === 0 && <Chip label="Top" size="small" color="success" variant="outlined" />}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{b.total_quantity}</TableCell>
                    <TableCell align="right">{b.order_count}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(b.total_spent)}</TableCell>
                    <TableCell align="right">{formatDate(b.last_purchase_date)}</TableCell>
                    <TableCell align="center">
                      {(b.whatsapp_number || b.phone) && (
                        <Link href={waLink(b.whatsapp_number || b.phone)} target="_blank" rel="noopener noreferrer"
                          sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BuyersDialog;
