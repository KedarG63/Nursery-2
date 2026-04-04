import {
  Box,
  Typography,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Chip,
} from '@mui/material';
import { formatCurrency } from '../../utils/formatters';

/**
 * Order Review Component
 * Review order before submission
 * Issue #57: Order creation wizard - Step 5
 */
const OrderReview = ({ orderData }) => {
  const { customer, items, deliveryAddress, deliveryDate, deliverySlot, paymentMethod, notes } = orderData;

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const calculateTax = () => {
    // 18% GST
    return calculateSubtotal() * 0.18;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Review & Submit Order
      </Typography>

      {/* Customer Info */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Customer Details
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Name:</Typography>
            <Typography variant="body1">{customer?.name}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Email:</Typography>
            <Typography variant="body1">{customer?.email}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Phone:</Typography>
            <Typography variant="body1">{customer?.phone}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Customer Type:</Typography>
            <Chip label={customer?.customer_type || 'N/A'} size="small" />
          </Grid>
        </Grid>
      </Paper>

      {/* Delivery Details */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Delivery Details
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">Address:</Typography>
            <Typography variant="body1">
              {deliveryAddress?.address_line1}
              {deliveryAddress?.address_line2 && `, ${deliveryAddress.address_line2}`}
              <br />
              {deliveryAddress?.city}, {deliveryAddress?.state} - {deliveryAddress?.pincode}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Delivery Date:</Typography>
            <Typography variant="body1">{deliveryDate || 'Not selected'}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Time Slot:</Typography>
            <Typography variant="body1">
              {deliverySlot === 'morning' && 'Morning (8 AM - 12 PM)'}
              {deliverySlot === 'afternoon' && 'Afternoon (12 PM - 5 PM)'}
              {deliverySlot === 'evening' && 'Evening (5 PM - 8 PM)'}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Order Items */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Order Items
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell align="center">Quantity</TableCell>
                <TableCell align="right">Subtotal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Typography variant="body2">{item.product_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.sku_variety || item.sku_name || ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell align="center">{item.quantity}</TableCell>
                  <TableCell align="right">{formatCurrency(item.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ my: 2 }} />

        {/* Totals */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ minWidth: 300 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body1">Subtotal:</Typography>
              <Typography variant="body1">{formatCurrency(calculateSubtotal())}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body1">Tax (18% GST):</Typography>
              <Typography variant="body1">{formatCurrency(calculateTax())}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="h6" fontWeight="bold">Total:</Typography>
              <Typography variant="h6" fontWeight="bold" color="primary">
                {formatCurrency(calculateTotal())}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Payment & Notes */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Payment & Notes
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">Payment Method:</Typography>
            <Chip
              label={
                paymentMethod === 'advance' ? 'Advance Payment' :
                paymentMethod === 'installment' ? 'Installment' :
                paymentMethod === 'credit' ? 'Credit' :
                'Cash on Delivery'
              }
              color="primary"
            />
          </Grid>
          {notes && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">Notes:</Typography>
              <Typography variant="body1">{notes}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>
    </Box>
  );
};

export default OrderReview;
