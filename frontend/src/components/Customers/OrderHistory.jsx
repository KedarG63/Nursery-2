import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Box,
  Pagination
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import StatusBadge from '../Common/StatusBadge';
import { formatDate, formatCurrency, formatOrderNumber } from '../../utils/formatters';

/**
 * Order History Component
 * Displays customer's order history
 */
const OrderHistory = ({ orders, total, page, totalPages, onPageChange, loading }) => {
  const navigate = useNavigate();

  const handleOrderClick = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Order History
          </Typography>
          <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Loading orders...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Order History</Typography>
          <Typography variant="body2" color="text.secondary">
            {total} order{total !== 1 ? 's' : ''} total
          </Typography>
        </Box>

        {orders && orders.length > 0 ? (
          <>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Order #</TableCell>
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
                      onClick={() => handleOrderClick(order.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {formatOrderNumber(order.order_number || order.id)}
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
                          {formatCurrency(order.total_amount || order.amount)}
                        </Typography>
                      </TableCell>

                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="small"
                          onClick={() => handleOrderClick(order.id)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={onPageChange}
                  size="small"
                />
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No orders found for this customer
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

OrderHistory.propTypes = {
  orders: PropTypes.array.isRequired,
  total: PropTypes.number,
  page: PropTypes.number,
  totalPages: PropTypes.number,
  onPageChange: PropTypes.func,
  loading: PropTypes.bool
};

OrderHistory.defaultProps = {
  total: 0,
  page: 1,
  totalPages: 1,
  onPageChange: () => {},
  loading: false
};

export default OrderHistory;
