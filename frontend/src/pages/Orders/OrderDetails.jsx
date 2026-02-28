import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Breadcrumbs,
  Link,
  CircularProgress,
  Grid
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import OrderSummary from '../../components/Orders/OrderSummary';
import OrderTimeline from '../../components/Orders/OrderTimeline';
import { getOrder, getOrderTimeline } from '../../services/orderService';

/**
 * Order Details Page
 * Issue #59: Display order details with timeline
 */
const OrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch order details and timeline
   */
  const fetchOrderData = async () => {
    try {
      setLoading(true);

      // Skip fetching if this is the create new order page
      if (id === 'new') {
        navigate('/orders/create');
        return;
      }

      // Fetch order details and timeline in parallel
      const [orderResponse, timelineResponse] = await Promise.all([
        getOrder(id),
        getOrderTimeline(id)
      ]);

      setOrder(orderResponse.data || orderResponse.order || orderResponse);
      setTimeline(timelineResponse.data || timelineResponse.timeline || []);
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrderData();
    }
  }, [id, navigate]);

  /**
   * Handle back to list
   */
  const handleBack = () => {
    navigate('/orders');
  };

  /**
   * Handle print order
   */
  const handlePrint = () => {
    window.print();
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

  if (!order) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h6" color="error">
          Order not found
        </Typography>
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Back to Orders
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
          to="/orders"
          underline="hover"
          color="inherit"
        >
          Orders
        </Link>
        <Typography color="text.primary">
          Order #{order.order_number || order.id}
        </Typography>
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
            <Typography variant="h4">
              Order #{order.order_number || order.id}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Order ID: {order.id?.slice(0, 8)}...
            </Typography>
          </div>
        </Box>

        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          sx={{ height: 'fit-content' }}
        >
          Print
        </Button>
      </Box>

      {/* Order Summary */}
      <Box sx={{ mb: 3 }}>
        <OrderSummary order={order} onStatusUpdate={fetchOrderData} />
      </Box>

      {/* Order Timeline */}
      <OrderTimeline timeline={timeline} />
    </Container>
  );
};

export default OrderDetails;
