import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Box,
  Typography,
  Button
} from '@mui/material';
import {
  Visibility as ViewIcon,
  LocalShipping as ShipIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import StatusBadge from '../Common/StatusBadge';
import { formatDate, formatCurrency, formatOrderNumber } from '../../utils/formatters';

/**
 * Orders Table Component
 */
const OrdersTable = ({ orders, loading }) => {
  const navigate = useNavigate();

  const handleRowClick = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Order #</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell colSpan={6}>
                  <Box sx={{ height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No orders found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Try adjusting your search or filters
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Order #</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => handleRowClick(order.id)}
            >
              <TableCell>
                <Typography variant="body2" fontWeight={500}>
                  {formatOrderNumber(order.order_number || order.id)}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {order.customer_name || order.customer?.name || '-'}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {formatDate(order.created_at || order.order_date)}
                </Typography>
              </TableCell>

              <TableCell>
                <StatusBadge status={order.status} />
              </TableCell>

              <TableCell align="right">
                <Typography variant="body2" fontWeight={500}>
                  {formatCurrency(order.total_amount || order.amount || 0)}
                </Typography>
              </TableCell>

              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="View Details">
                  <IconButton
                    size="small"
                    onClick={() => handleRowClick(order.id)}
                    color="primary"
                  >
                    <ViewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

OrdersTable.propTypes = {
  orders: PropTypes.array.isRequired,
  loading: PropTypes.bool
};

export default OrdersTable;
