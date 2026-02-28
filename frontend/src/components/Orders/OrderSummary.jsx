import { useState } from 'react';
import {
  Card,
  CardContent,
  Grid,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
  Chip,
  Button,
  Menu,
  MenuItem
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import PropTypes from 'prop-types';
import { toast } from 'react-toastify';
import StatusBadge from '../Common/StatusBadge';
import { formatDate, formatCurrency, formatAddress, formatOrderNumber } from '../../utils/formatters';
import { updateOrderStatus } from '../../services/orderService';

/**
 * Order Summary Component
 * Displays complete order information
 */
const OrderSummary = ({ order, onStatusUpdate }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [updating, setUpdating] = useState(false);

  const statusTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready_for_delivery', 'cancelled'],
    ready_for_delivery: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  };

  const statusLabels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready_for_delivery: 'Ready for Delivery',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  };

  const handleStatusMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleStatusMenuClose = () => {
    setAnchorEl(null);
  };

  const handleStatusChange = async (newStatus) => {
    handleStatusMenuClose();

    try {
      setUpdating(true);
      await updateOrderStatus(order.id, { status: newStatus });
      toast.success(`Order status updated to ${statusLabels[newStatus]}`);

      if (onStatusUpdate) {
        onStatusUpdate();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.response?.data?.message || 'Failed to update order status');
    } finally {
      setUpdating(false);
    }
  };

  const allowedStatuses = statusTransitions[order.status] || [];

  return (
    <Grid container spacing={3}>
      {/* Order Header */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5">
                {formatOrderNumber(order.order_number || order.id)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <StatusBadge status={order.status} size="medium" />
                {allowedStatuses.length > 0 && (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      endIcon={<ExpandMoreIcon />}
                      onClick={handleStatusMenuOpen}
                      disabled={updating}
                    >
                      Update Status
                    </Button>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl)}
                      onClose={handleStatusMenuClose}
                    >
                      {allowedStatuses.map((status) => (
                        <MenuItem key={status} onClick={() => handleStatusChange(status)}>
                          {statusLabels[status]}
                        </MenuItem>
                      ))}
                    </Menu>
                  </>
                )}
              </Box>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  Customer
                </Typography>
                <Typography variant="body1" fontWeight={500}>
                  {order.customer_name || order.customer?.name || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  Order Date
                </Typography>
                <Typography variant="body1">
                  {formatDate(order.created_at || order.order_date)}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  Expected Delivery
                </Typography>
                <Typography variant="body1">
                  {formatDate(order.expected_delivery_date) || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  Total Amount
                </Typography>
                <Typography variant="h6" color="primary">
                  {formatCurrency(order.total_amount || order.amount || 0)}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Order Items */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Order Items
            </Typography>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product Name</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Lot #</TableCell>
                    <TableCell>Growth Stage</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {item.sku_code || item.sku?.code || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {item.sku_name || item.product_name || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(item.unit_price || item.price)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency((item.quantity || 0) * (item.unit_price || item.price || 0))}
                        </TableCell>
                        <TableCell>
                          {item.lot_number ? (
                            <Chip label={item.lot_number} size="small" />
                          ) : (
                            <Typography variant="body2" color="text.secondary">Not allocated</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.growth_stage ? (
                            <Chip label={item.growth_stage} size="small" color="primary" />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No items
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Lot Allocations */}
      {order.allocations && order.allocations.length > 0 && (
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Lot Allocations
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Lot Number</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Quantity Allocated</TableCell>
                      <TableCell>Growth Stage</TableCell>
                      <TableCell>Expected Ready Date</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {order.allocations.map((allocation, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Chip label={allocation.lot_number} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {allocation.sku_code}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {allocation.product_name}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium">
                            {allocation.quantity_allocated}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={allocation.growth_stage} size="small" color="primary" />
                        </TableCell>
                        <TableCell>
                          {formatDate(allocation.expected_ready_date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      )}

      {/* Payment & Delivery Info */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Payment Information
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Payment Type
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {order.payment_type || order.payment_method || '-'}
                </Typography>
              </Box>

              {order.payment_type === 'credit' && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Credit Terms
                  </Typography>
                  <Typography variant="body1">
                    {order.credit_days} days credit period
                  </Typography>
                </Box>
              )}

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Subtotal
                </Typography>
                <Typography variant="body1">
                  {formatCurrency(order.subtotal_amount || 0)}
                </Typography>
              </Box>

              {order.discount_amount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Discount
                  </Typography>
                  <Typography variant="body1" color="success.main">
                    -{formatCurrency(order.discount_amount)}
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Tax (GST)
                </Typography>
                <Typography variant="body1">
                  {formatCurrency(order.tax_amount || 0)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" fontWeight="medium">
                  Total Amount
                </Typography>
                <Typography variant="h6" color="primary" fontWeight={600}>
                  {formatCurrency(order.total_amount || 0)}
                </Typography>
              </Box>

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Paid Amount
                </Typography>
                <Typography variant="body1" color="success.main" fontWeight={500}>
                  {formatCurrency(order.paid_amount || 0)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Balance Due
                </Typography>
                <Typography variant="body1" color="error.main" fontWeight={500}>
                  {formatCurrency((order.total_amount || 0) - (order.paid_amount || 0))}
                </Typography>
              </Box>

              {order.payments && order.payments.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Payment History
                    </Typography>
                    {order.payments.map((payment, index) => (
                      <Box key={index} sx={{ mt: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">
                            {formatDate(payment.payment_date)}
                          </Typography>
                          <Typography variant="body2" fontWeight="medium">
                            {formatCurrency(payment.amount)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {payment.payment_method} {payment.reference_number && `- ${payment.reference_number}`}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Delivery Information
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Delivery Address
                </Typography>
                <Typography variant="body2">
                  {order.delivery_address ? formatAddress(order.delivery_address) : '-'}
                </Typography>
              </Box>

              {order.delivery_instructions && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Instructions
                  </Typography>
                  <Typography variant="body2">
                    {order.delivery_instructions}
                  </Typography>
                </Box>
              )}

              {order.driver_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Assigned Driver
                  </Typography>
                  <Typography variant="body2">
                    {order.driver_name}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Notes */}
      {order.notes && (
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Notes
              </Typography>
              <Typography variant="body2">{order.notes}</Typography>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  );
};

OrderSummary.propTypes = {
  order: PropTypes.object.isRequired,
  onStatusUpdate: PropTypes.func
};

export default OrderSummary;
