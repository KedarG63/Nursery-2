/**
 * Payments Table Component
 * Displays payments list with sorting and actions
 */

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Box,
  Typography,
} from '@mui/material';
import {
  Receipt as ReceiptIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

const PaymentsTable = ({ payments, totalCount, page, limit, onPageChange, onViewReceipt }) => {
  const [rowsPerPage, setRowsPerPage] = useState(limit || 20);

  const handleChangePage = (event, newPage) => {
    onPageChange(newPage + 1, rowsPerPage);
  };

  const handleChangeRowsPerPage = (event) => {
    const newLimit = parseInt(event.target.value, 10);
    setRowsPerPage(newLimit);
    onPageChange(1, newLimit);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'refunded':
        return 'default';
      default:
        return 'default';
    }
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      cash: 'Cash',
      upi: 'UPI',
      card: 'Card',
      bank_transfer: 'Bank Transfer',
      credit: 'Credit',
      razorpay: 'Razorpay',
    };
    return labels[method] || method;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!payments || payments.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No payments found
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Payment ID</TableCell>
              <TableCell>Order Number</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Payment Method</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {payment.id?.substring(0, 8)}...
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {payment.order_number || 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {payment.customer_name || 'Unknown'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight="medium">
                    {formatCurrency(payment.amount)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={getPaymentMethodLabel(payment.payment_method)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={payment.status?.toUpperCase()}
                    size="small"
                    color={getStatusColor(payment.status)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {payment.payment_date
                      ? format(new Date(payment.payment_date), 'dd MMM yyyy')
                      : 'N/A'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {payment.payment_date
                      ? format(new Date(payment.payment_date), 'hh:mm a')
                      : ''}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Tooltip title="View Receipt">
                      <IconButton
                        size="small"
                        onClick={() => onViewReceipt(payment.id)}
                        color="primary"
                      >
                        <ReceiptIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={totalCount || payments.length}
        page={(page || 1) - 1}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
    </Paper>
  );
};

export default PaymentsTable;
