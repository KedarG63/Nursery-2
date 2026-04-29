import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Alert,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Collapse,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import CustomerSelect from '../../components/Orders/CustomerSelect';
import OrderItems from '../../components/Orders/OrderItems';
import DeliveryDetails from '../../components/Orders/DeliveryDetails';
import PaymentMethod from '../../components/Orders/PaymentMethod';
import OrderReview from '../../components/Orders/OrderReview';
import { createOrder, checkAvailability } from '../../services/orderService';
import { formatDate } from '../../utils/formatters';

/**
 * Create Order Page with Multi-Step Wizard
 * Issue #57: Order creation wizard
 */
const CreateOrder = () => {
  const navigate = useNavigate();

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Order data state
  const [orderData, setOrderData] = useState({
    customer: null,
    items: [],
    deliveryAddress: null,
    orderDate: new Date().toISOString().split('T')[0],
    deliveryDate: null,
    deliverySlot: 'morning',
    paymentMethod: 'advance',
    notes: '',
    walkInName: '',
    walkInPhone: '',
  });

  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availabilityErrors, setAvailabilityErrors] = useState([]);
  const [availabilityDetails, setAvailabilityDetails] = useState([]);
  const [availabilityOverridden, setAvailabilityOverridden] = useState(false);

  const steps = [
    'Select Customer',
    'Add Items',
    'Delivery Details',
    'Payment Method',
    'Review & Submit'
  ];

  /**
   * Handle next step
   */
  const handleNext = () => {
    // Validate current step
    if (activeStep === 0 && !orderData.customer) {
      toast.error('Please select a customer');
      return;
    }

    if (activeStep === 1 && orderData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    const isWalkIn = orderData.customer?.name === 'Walk-in Customer';

    if (activeStep === 2 && !isWalkIn && !orderData.deliveryAddress) {
      toast.error('Please select a delivery address');
      return;
    }

    if (activeStep === 2 && !isWalkIn && !orderData.deliveryDate) {
      toast.error('Please select a delivery date');
      return;
    }


    setActiveStep((prev) => prev + 1);
  };

  /**
   * Handle back step
   */
  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  /**
   * Handle customer selection
   */
  const handleCustomerSelect = (customer) => {
    setOrderData((prev) => ({ ...prev, customer }));
  };

  /**
   * Handle walk-in customer name/phone — store separately and also in notes
   */
  const handleWalkInName = (name, phone) => {
    const label = [
      name ? `Walk-in: ${name}` : 'Walk-in',
      phone ? `Ph: +91${phone}` : '',
    ].filter(Boolean).join(' | ');
    setOrderData((prev) => ({
      ...prev,
      walkInName: name || '',
      walkInPhone: phone || '',
      notes: label,
    }));
  };

  /**
   * Handle items change
   */
  const handleItemsChange = (items) => {
    setOrderData((prev) => ({ ...prev, items }));
  };

  /**
   * Handle delivery change
   */
  const handleDeliveryChange = (field, value) => {
    setOrderData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Handle payment change
   */
  const handlePaymentChange = (field, value) => {
    setOrderData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Handle availability check (Phase 21)
   */
  const handleCheckAvailability = async () => {
    try {
      setLoading(true);
      setAvailabilityErrors([]);
      setAvailabilityDetails([]);
      setAvailabilityOverridden(false);

      const items = orderData.items.map((item) => ({
        sku_id: item.sku_id,
        quantity: item.quantity
      }));

      const response = await checkAvailability(items, orderData.deliveryDate);
      const { all_available, data } = response;

      // Store detailed information for all items (available and unavailable)
      setAvailabilityDetails(data.map(item => ({
        skuVariety: item.variety || item.sku_code,
        productName: item.product_name,
        requestedQty: item.requested_quantity,
        availableQty: item.available_quantity,
        nextAvailableDate: item.next_available_date,
        growthPeriodDays: item.growth_period_days,
        available: item.available,
        lots: item.lots || [],
        readyLotsCount: item.ready_lots_count || 0,
        pendingLotsCount: item.pending_lots_count || 0,
      })));

      if (!all_available) {
        const unavailableItems = data.filter(item => !item.available);
        setAvailabilityErrors(unavailableItems.map(item => ({
          skuVariety: item.variety || item.sku_code,
          productName: item.product_name,
          requestedQty: item.requested_quantity,
          availableQty: item.available_quantity,
          nextAvailableDate: item.next_available_date,
          growthPeriodDays: item.growth_period_days,
          shortfall: item.requested_quantity - item.available_quantity,
          message: `${item.product_name} (${item.variety || item.sku_code}): Only ${item.available_quantity} of ${item.requested_quantity} available by ${orderData.deliveryDate}. Shortfall: ${item.requested_quantity - item.available_quantity}. Next availability: ${item.next_available_date || 'Not available'}`
        })));
        toast.warning('Some items are not available by the requested delivery date');
        setAvailabilityChecked(false);
      } else {
        // Build success message with lot details
        const availableItemsInfo = data.map(item => {
          const readyCount = item.ready_lots_count || 0;
          const pendingCount = item.pending_lots_count || 0;
          return `${item.product_name}: ${readyCount} lots ready${pendingCount > 0 ? `, ${pendingCount} pending` : ''}`;
        }).join('\n');

        toast.success(`All items are available for the selected delivery date\n${availableItemsInfo}`, {
          autoClose: 5000
        });
        setAvailabilityChecked(true);
      }
    } catch (error) {
      console.error('Error checking availability:', error);
      toast.error(error.message || 'Failed to check availability');
      setAvailabilityChecked(false);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle order submission
   */
  const handleSubmit = async () => {
    const isWalkIn = orderData.customer?.name === 'Walk-in Customer';
    // Walk-in orders skip availability check (immediate counter sale)
    if (!isWalkIn && !availabilityChecked && !availabilityOverridden) {
      toast.error('Please check availability before submitting the order');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        customer_id: orderData.customer.id,
        delivery_address_id: orderData.deliveryAddress?.id || null,
        delivery_date: orderData.deliveryDate || null,
        delivery_slot: orderData.deliverySlot,
        payment_type: orderData.paymentMethod,
        items: orderData.items.map((item) => ({
          sku_id: item.sku_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        })),
        order_date: orderData.orderDate || new Date().toISOString().split('T')[0],
        notes: orderData.notes,
        skip_availability_check: availabilityOverridden || false,
      };

      console.log('Creating order with payload:', JSON.stringify(payload, null, 2));
      const response = await createOrder(payload);

      toast.success('Order created successfully');
      navigate(`/orders/${response.data?.id || response.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.errors?.join(', ') || error.response?.data?.message || error.message || 'Failed to create order';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Render step content
   */
  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <CustomerSelect
            selectedCustomer={orderData.customer}
            onCustomerSelect={handleCustomerSelect}
            onWalkInName={handleWalkInName}
          />
        );
      case 1:
        return (
          <OrderItems
            items={orderData.items}
            onItemsChange={handleItemsChange}
          />
        );
      case 2:
        return (
          <DeliveryDetails
            customer={orderData.customer}
            deliveryAddress={orderData.deliveryAddress}
            orderDate={orderData.orderDate}
            deliveryDate={orderData.deliveryDate}
            deliverySlot={orderData.deliverySlot}
            onDeliveryChange={handleDeliveryChange}
          />
        );
      case 3:
        return (
          <PaymentMethod
            paymentMethod={orderData.paymentMethod}
            notes={orderData.notes}
            onPaymentChange={handlePaymentChange}
          />
        );
      case 4:
        return (
          <Box>
            <OrderReview orderData={orderData} />

            {/* Availability Check Section */}
            <Box sx={{ mt: 3 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleCheckAvailability}
                disabled={loading || orderData.items.length === 0}
                fullWidth
              >
                {loading ? 'Checking...' : 'Check Availability'}
              </Button>

              {availabilityChecked && availabilityDetails.length > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <AlertTitle>All Items Available ✓</AlertTitle>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    All items are available for delivery on {orderData.deliveryDate}
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Product</TableCell>
                          <TableCell align="center">Requested</TableCell>
                          <TableCell align="center">Ready Lots</TableCell>
                          <TableCell align="center">Pending Lots</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {availabilityDetails.map((detail, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {detail.productName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {detail.skuVariety}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2">{detail.requestedQty}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={`${detail.readyLotsCount} lots`}
                                size="small"
                                color="success"
                              />
                            </TableCell>
                            <TableCell align="center">
                              {detail.pendingLotsCount > 0 ? (
                                <Chip
                                  label={`${detail.pendingLotsCount} lots`}
                                  size="small"
                                  color="warning"
                                />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  -
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Alert>
              )}

              {availabilityErrors.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <AlertTitle>Availability Issues</AlertTitle>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    The following items have insufficient inventory:
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Product</TableCell>
                          <TableCell align="center">Requested</TableCell>
                          <TableCell align="center">Available</TableCell>
                          <TableCell align="center">Shortfall</TableCell>
                          <TableCell>Next Available</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {availabilityErrors.map((error, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {error.productName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {error.skuVariety}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2">{error.requestedQty}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" color="warning.main">
                                {error.availableQty}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={error.shortfall}
                                size="small"
                                color="error"
                              />
                            </TableCell>
                            <TableCell>
                              {error.nextAvailableDate ? (
                                <Typography variant="body2" color="warning.main">
                                  {formatDate(error.nextAvailableDate)}
                                </Typography>
                              ) : (
                                <Box>
                                  <Typography variant="body2" color="error.main" fontWeight="medium">
                                    Insufficient inventory
                                  </Typography>
                                  {error.growthPeriodDays ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Create a new lot today — ready by{' '}
                                      {formatDate(new Date(Date.now() + error.growthPeriodDays * 86400000))}
                                    </Typography>
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">
                                      No lots in inventory
                                    </Typography>
                                  )}
                                </Box>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Typography variant="body2" sx={{ mt: 2 }}>
                    💡 Suggestion: Adjust delivery date or reduce quantities
                  </Typography>
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {!availabilityOverridden ? (
                      <Button
                        variant="outlined"
                        color="warning"
                        size="small"
                        onClick={() => {
                          setAvailabilityOverridden(true);
                          toast.warning('Proceeding with insufficient inventory. Lots must be allocated manually.');
                        }}
                      >
                        Proceed Anyway
                      </Button>
                    ) : (
                      <Chip
                        label="Override active — inventory shortfall acknowledged"
                        color="warning"
                        size="small"
                        onDelete={() => setAvailabilityOverridden(false)}
                      />
                    )}
                  </Box>
                </Alert>
              )}
            </Box>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Create New Order
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mt: 4, mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: 4, mb: 3 }}>
        {renderStepContent(activeStep)}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          disabled={activeStep === 0 || loading}
          onClick={handleBack}
        >
          Back
        </Button>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            onClick={() => navigate('/orders')}
            disabled={loading}
          >
            Cancel
          </Button>

          {activeStep === steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Create Order'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={loading}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default CreateOrder;
