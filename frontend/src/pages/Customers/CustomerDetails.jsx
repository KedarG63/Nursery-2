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
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import CustomerProfile from '../../components/Customers/CustomerProfile';
import OrderHistory from '../../components/Customers/OrderHistory';
import CustomerForm from '../../components/Customers/CustomerForm';
import { getCustomer, updateCustomer } from '../../services/customerService';
import { formatCurrency } from '../../utils/formatters';
import { canEdit } from '../../utils/roleCheck';

/**
 * Customer Details Page
 * Issue #56: Display customer profile with order history
 */
const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPages, setOrderPages] = useState(1);

  // Edit form dialog
  const [editDialog, setEditDialog] = useState({
    open: false,
    loading: false
  });

  /**
   * Fetch customer details
   */
  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const response = await getCustomer(id);
      // Backend returns { success, data: { customer, addresses, credit_transactions } }
      const rawData = response.data || response;
      const customerObj = rawData?.customer || rawData;
      setCustomer({ ...customerObj, addresses: rawData?.addresses || customerObj?.addresses || [] });
    } catch (error) {
      console.error('Error fetching customer:', error);
      toast.error('Failed to load customer details');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch customer orders (mock for now - will be implemented in Issue #58)
   */
  const fetchOrders = async (page = 1) => {
    try {
      setOrdersLoading(true);
      // TODO: Implement with real API in Issue #58
      // const response = await getOrders({ customer_id: id, page, limit: 10 });
      // For now, mock empty data
      setOrders([]);
      setOrderTotal(0);
      setOrderPages(1);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load order history');
    } finally {
      setOrdersLoading(false);
    }
  };

  /**
   * Load data on mount
   */
  useEffect(() => {
    if (id) {
      fetchCustomer();
      fetchOrders();
    }
  }, [id]);

  /**
   * Handle order page change
   */
  const handleOrderPageChange = (event, value) => {
    setOrderPage(value);
    fetchOrders(value);
  };

  /**
   * Handle edit customer
   */
  const handleEdit = () => {
    setEditDialog({
      open: true,
      loading: false
    });
  };

  /**
   * Handle edit form submit
   */
  const handleEditSubmit = async (data) => {
    try {
      setEditDialog((prev) => ({ ...prev, loading: true }));

      await updateCustomer(id, data);

      toast.success('Customer updated successfully');
      setEditDialog({ open: false, loading: false });

      // Refresh customer data
      fetchCustomer();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error(error.message || 'Failed to update customer');
      setEditDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Handle edit form close
   */
  const handleEditClose = () => {
    setEditDialog({ open: false, loading: false });
  };

  /**
   * Handle back to list
   */
  const handleBack = () => {
    navigate('/customers');
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!customer) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h6" color="error">
          Customer not found
        </Typography>
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Back to Customers
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component={RouterLink}
          to="/customers"
          underline="hover"
          color="inherit"
        >
          Customers
        </Link>
        <Typography color="text.primary">{customer.name}</Typography>
      </Breadcrumbs>

      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            variant="outlined"
          >
            Back
          </Button>
          <div>
            <Typography variant="h4">{customer.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Customer ID: {customer.id?.slice(0, 8)}...
            </Typography>
          </div>
        </Box>

        {canEdit(user?.roles) && (
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={handleEdit}
            sx={{ height: 'fit-content' }}
          >
            Edit Customer
          </Button>
        )}
      </Box>

      {/* Customer Profile */}
      <Box sx={{ mb: 3 }}>
        <CustomerProfile customer={customer} onEdit={canEdit(user?.role) ? handleEdit : null} />
      </Box>

      {/* Payment Summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Paid
              </Typography>
              <Typography variant="h5" color="success.main">
                {formatCurrency(customer.total_paid || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Outstanding
              </Typography>
              <Typography variant="h5" color="error.main">
                {formatCurrency(customer.outstanding || customer.credit_used || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Credit Available
              </Typography>
              <Typography variant="h5" color="primary.main">
                {formatCurrency(
                  (customer.credit_limit || 0) - (customer.credit_used || 0)
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Order History */}
      <OrderHistory
        orders={orders}
        total={orderTotal}
        page={orderPage}
        totalPages={orderPages}
        onPageChange={handleOrderPageChange}
        loading={ordersLoading}
      />

      {/* Edit Customer Form */}
      <CustomerForm
        open={editDialog.open}
        customer={customer}
        onClose={handleEditClose}
        onSubmit={handleEditSubmit}
        loading={editDialog.loading}
      />
    </Container>
  );
};

export default CustomerDetails;
