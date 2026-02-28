/**
 * Customer Payments Page
 * Display customer-specific payment history and outstanding orders
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
import { FileDownload as DownloadIcon, Payment as PaymentIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import PaymentSummary from '../../components/Payments/PaymentSummary';
import {
  getCustomerPayments,
  getCustomerOutstanding,
  generateStatement,
  initiatePayment,
} from '../../services/paymentService';

const CustomerPayments = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [outstandingOrders, setOutstandingOrders] = useState([]);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsRes, outstandingRes] = await Promise.all([
        getCustomerPayments(id),
        getCustomerOutstanding(id),
      ]);

      setPayments(paymentsRes.data || paymentsRes.payments || []);
      setOutstandingOrders(outstandingRes.data || outstandingRes.orders || []);

      // Calculate summary
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const pending = outstandingOrders.reduce((sum, o) => sum + (o.balance_amount || 0), 0);
      const overdue = outstandingOrders
        .filter((o) => new Date(o.due_date) < new Date())
        .reduce((sum, o) => sum + (o.balance_amount || 0), 0);

      setSummary({ total_paid: totalPaid, pending, overdue, credit_used: 0 });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadStatement = async () => {
    try {
      const blob = await generateStatement(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payment-statement-${id}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      link.click();
      toast.success('Statement downloaded successfully');
    } catch (error) {
      console.error('Error downloading statement:', error);
      toast.error('Failed to download statement');
    }
  };

  const handleInitiatePayment = async (orderId, amount) => {
    try {
      const response = await initiatePayment({ order_id: orderId, amount });
      // Open Razorpay or payment gateway
      toast.info('Payment gateway integration pending');
    } catch (error) {
      console.error('Error initiating payment:', error);
      toast.error('Failed to initiate payment');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const isOverdue = (dueDate) => {
    return dueDate && new Date(dueDate) < new Date();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Payment History</Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadStatement}
        >
          Download Statement
        </Button>
      </Box>

      <PaymentSummary summary={summary} />

      {outstandingOrders.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Outstanding Orders
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Order Number</TableCell>
                  <TableCell align="right">Total Amount</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell>Due Date</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outstandingOrders.map((order) => (
                  <TableRow key={order.id} sx={{ bgcolor: isOverdue(order.due_date) ? '#ffebee' : 'inherit' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {order.order_number}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(order.total_amount)}</TableCell>
                    <TableCell align="right">
                      <Typography color={isOverdue(order.due_date) ? 'error' : 'inherit'}>
                        {formatCurrency(order.balance_amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {order.due_date ? (
                        <>
                          {format(new Date(order.due_date), 'dd MMM yyyy')}
                          {isOverdue(order.due_date) && (
                            <Chip label="OVERDUE" size="small" color="error" sx={{ ml: 1 }} />
                          )}
                        </>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PaymentIcon />}
                        onClick={() => handleInitiatePayment(order.id, order.balance_amount)}
                      >
                        Pay Now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          All Payments
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order Number</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="text.secondary">No payments found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.order_number || 'N/A'}</TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>
                      <Chip label={payment.payment_method?.toUpperCase()} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {payment.payment_date ? format(new Date(payment.payment_date), 'dd MMM yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={payment.status?.toUpperCase()}
                        size="small"
                        color={payment.status === 'success' ? 'success' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default CustomerPayments;
