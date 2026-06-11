import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Breadcrumbs,
  Link,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  MoreVert as MoreVertIcon,
  Payment as PaymentIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import StatusBadge from '../../components/Common/StatusBadge';
import ConfirmDialog from '../../components/Common/ConfirmDialog';
import {
  getServiceOrder,
  updateServiceOrderStatus,
  recordServiceOrderPayment,
  deleteServiceOrder,
} from '../../services/serviceOrderService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { canEdit } from '../../utils/roleCheck';

// Allowed forward transitions per status
const NEXT_STATUSES = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const ServiceOrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const editable = canEdit(user?.roles);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMenuAnchor, setStatusMenuAnchor] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState(false);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await getServiceOrder(id);
      setOrder(response.data);
    } catch (error) {
      console.error('Error fetching service order:', error);
      toast.error('Failed to load service order');
      navigate('/service-orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (status) => {
    setStatusMenuAnchor(null);
    try {
      setActionLoading(true);
      await updateServiceOrderStatus(id, status);
      toast.success('Status updated');
      fetchOrder();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (amount > Number(order.balance_amount) + 0.001) {
      toast.error('Payment exceeds the outstanding balance');
      return;
    }
    try {
      setActionLoading(true);
      await recordServiceOrderPayment(id, { amount, payment_method: paymentMethod });
      toast.success('Payment recorded');
      setPaymentDialog(false);
      setPaymentAmount('');
      setPaymentMethod('cash');
      fetchOrder();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error(error.message || 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setActionLoading(true);
      await deleteServiceOrder(id);
      toast.success('Service order deleted');
      navigate('/service-orders');
    } catch (error) {
      console.error('Error deleting service order:', error);
      toast.error(error.message || 'Failed to delete service order');
      setActionLoading(false);
      setDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', minHeight: 400, alignItems: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!order) return null;

  const nextStatuses = NEXT_STATUSES[order.status] || [];
  const fullyPaid = Number(order.balance_amount) <= 0;

  const infoRows = [
    { label: 'Customer', value: order.customer_name },
    { label: 'Phone', value: order.customer_phone || '—' },
    { label: 'Quantity', value: order.quantity ?? '—' },
    { label: 'Order Date', value: formatDate(order.order_date) },
    { label: 'Start Date', value: order.start_date ? formatDate(order.start_date) : '—' },
    {
      label: 'Expected Ready',
      value: order.expected_ready_date ? formatDate(order.expected_ready_date) : '—',
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/service-orders" underline="hover" color="inherit">
          Service Orders
        </Link>
        <Typography color="text.primary">{order.service_order_number}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/service-orders')} variant="outlined">
            Back
          </Button>
          <div>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h4">{order.service_order_number}</Typography>
              <StatusBadge status={order.status} size="medium" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {order.customer_name}
            </Typography>
          </div>
        </Box>

        {editable && (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            {!fullyPaid && order.status !== 'cancelled' && (
              <Button
                variant="contained"
                startIcon={<PaymentIcon />}
                onClick={() => setPaymentDialog(true)}
              >
                Record Payment
              </Button>
            )}
            {nextStatuses.length > 0 && (
              <Button
                variant="outlined"
                endIcon={<MoreVertIcon />}
                onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                disabled={actionLoading}
              >
                Update Status
              </Button>
            )}
            <Menu
              anchorEl={statusMenuAnchor}
              open={Boolean(statusMenuAnchor)}
              onClose={() => setStatusMenuAnchor(null)}
            >
              {nextStatuses.map((status) => (
                <MenuItem
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  sx={{ textTransform: 'capitalize' }}
                >
                  Mark as {status.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Menu>
            {order.status !== 'completed' && (
              <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteDialog(true)}>
                Delete
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Details */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Details
              </Typography>
              <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                {order.description}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={1.5}>
                {infoRows.map((row) => (
                  <Grid item xs={6} key={row.label}>
                    <Typography variant="caption" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography variant="body2">{row.value}</Typography>
                  </Grid>
                ))}
              </Grid>
              {order.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary">
                    Notes
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {order.notes}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Payment summary */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payment Summary
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Service Fee
                </Typography>
                <Typography variant="body2">{formatCurrency(order.service_fee)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Paid
                </Typography>
                <Typography variant="body2" color="success.main">
                  {formatCurrency(order.paid_amount)}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">Balance</Typography>
                <Typography
                  variant="subtitle2"
                  color={Number(order.balance_amount) > 0 ? 'error.main' : 'success.main'}
                >
                  {formatCurrency(order.balance_amount)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Payment history */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payment History
              </Typography>
              {order.payments && order.payments.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Received By</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{formatDateTime(p.payment_date)}</TableCell>
                          <TableCell sx={{ textTransform: 'capitalize' }}>
                            {p.payment_method?.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell>{p.received_by_name || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No payments recorded yet.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Payment dialog */}
      <Dialog open={paymentDialog} onClose={() => setPaymentDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Outstanding balance: {formatCurrency(order.balance_amount)}
          </Typography>
          <TextField
            fullWidth
            type="number"
            label="Amount"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            inputProps={{ min: 0, step: '0.01' }}
            sx={{ mb: 2, mt: 1 }}
            autoFocus
          />
          <TextField
            select
            fullWidth
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRecordPayment} disabled={actionLoading}>
            Record
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialog}
        title="Delete Service Order"
        message={`Are you sure you want to delete ${order.service_order_number}? This cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog(false)}
      />
    </Container>
  );
};

export default ServiceOrderDetails;
