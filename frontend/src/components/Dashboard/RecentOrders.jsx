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
  Chip,
  Box,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

const getStatusColor = (status) => {
  const statusColors = {
    pending: 'warning',
    confirmed: 'info',
    processing: 'primary',
    ready: 'success',
    delivered: 'success',
    cancelled: 'error',
  };
  return statusColors[status?.toLowerCase()] || 'default';
};

const RecentOrders = ({ orders }) => {
  const navigate = useNavigate();

  const handleRowClick = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Recent Orders
        </Typography>
        {orders && orders.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Order ID</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
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
                    <TableCell>#{order.orderNumber || order.id.slice(0, 8)}</TableCell>
                    <TableCell>{order.customerName || 'N/A'}</TableCell>
                    <TableCell>
                      {new Date(order.orderDate || order.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                      }).format(order.totalAmount || 0)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={order.status}
                        color={getStatusColor(order.status)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">No recent orders</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentOrders;
