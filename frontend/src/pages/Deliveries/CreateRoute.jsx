import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  TextField,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardActions,
  Checkbox,
  FormControlLabel,
  Stepper,
  Step,
  StepLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import RouteIcon from '@mui/icons-material/Route';

import deliveryService from '../../services/deliveryService';

const steps = ['Select Orders', 'Review Route', 'Confirm'];

const CreateRoute = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [routeData, setRouteData] = useState({
    routeDate: new Date().toISOString().split('T')[0],
    plannedStartTime: '09:00',
    notes: ''
  });
  const [optimizedRoute, setOptimizedRoute] = useState(null);

  useEffect(() => {
    fetchAvailableOrders();
  }, [routeData.routeDate]);

  const fetchAvailableOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await deliveryService.getAvailableOrders(routeData.routeDate);

      if (response.success) {
        setAvailableOrders(response.data || []);
      }
    } catch (err) {
      console.error('Error fetching available orders:', err);
      setError('Failed to load available orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderSelection = (orderId) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === availableOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(availableOrders.map(order => order.orderId));
    }
  };

  const handleNext = async () => {
    if (activeStep === 0) {
      // Step 1: Validate order selection
      if (selectedOrders.length === 0) {
        setError('Please select at least one order to create a route.');
        return;
      }
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Step 2: Preview optimized route
      try {
        setLoading(true);
        setError(null);

        const response = await deliveryService.createRoute({
          orderIds: selectedOrders,
          routeDate: routeData.routeDate,
          plannedStartTime: `${routeData.routeDate}T${routeData.plannedStartTime}:00`,
          notes: routeData.notes
        });

        if (response.success) {
          setOptimizedRoute(response.route);
          setActiveStep(2);
        }
      } catch (err) {
        console.error('Error creating route:', err);
        setError(err.response?.data?.message || 'Failed to create route. Please try again.');
      } finally {
        setLoading(false);
      }
    } else if (activeStep === 2) {
      // Step 3: Confirm and navigate
      setSuccess('Route created successfully!');
      setTimeout(() => {
        navigate('/deliveries/routes');
      }, 1500);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setRouteData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box display="flex" alignItems="center">
          <IconButton onClick={() => navigate('/deliveries/routes')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">
            {t('routes.createRoute', 'Create Delivery Route')}
          </Typography>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {/* Stepper */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stepper activeStep={activeStep}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Step Content */}
      <Paper sx={{ p: 3 }}>
        {/* Step 1: Select Orders */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              {t('routes.selectOrders', 'Select Orders for Delivery')}
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="date"
                  label={t('routes.routeDate', 'Route Date')}
                  name="routeDate"
                  value={routeData.routeDate}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="time"
                  label={t('routes.plannedStartTime', 'Planned Start Time')}
                  name="plannedStartTime"
                  value={routeData.plannedStartTime}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedOrders.length === availableOrders.length && availableOrders.length > 0}
                      onChange={handleSelectAll}
                      indeterminate={selectedOrders.length > 0 && selectedOrders.length < availableOrders.length}
                    />
                  }
                  label={t('routes.selectAll', 'Select All')}
                />
              </Grid>
            </Grid>

            {loading ? (
              <Box display="flex" justifyContent="center" py={5}>
                <CircularProgress />
              </Box>
            ) : availableOrders.length === 0 ? (
              <Box textAlign="center" py={5}>
                <RouteIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography color="text.secondary">
                  {t('routes.noAvailableOrders', 'No orders available for delivery on this date.')}
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {availableOrders.map((order) => (
                  <Grid item xs={12} md={6} lg={4} key={order.orderId}>
                    <Card
                      sx={{
                        border: selectedOrders.includes(order.orderId) ? 2 : 1,
                        borderColor: selectedOrders.includes(order.orderId) ? 'primary.main' : 'divider',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleOrderSelection(order.orderId)}
                    >
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                          <Typography variant="h6" component="div">
                            {order.orderNumber}
                          </Typography>
                          <Checkbox
                            checked={selectedOrders.includes(order.orderId)}
                            onChange={() => handleOrderSelection(order.orderId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          {order.customerName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {order.address.line1}, {order.address.city}
                        </Typography>
                        <Box mt={2} display="flex" justifyContent="space-between">
                          <Chip label={`${order.itemCount} items`} size="small" />
                          <Typography variant="body2" fontWeight="bold">
                            ₹{order.totalAmount.toFixed(2)}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {selectedOrders.length} {t('routes.ordersSelected', 'order(s) selected')}
            </Typography>
          </Box>
        )}

        {/* Step 2: Review Route */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              {t('routes.reviewRoute', 'Review Route Details')}
            </Typography>
            <Divider sx={{ my: 2 }} />

            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('routes.notes', 'Notes (Optional)')}
              name="notes"
              value={routeData.notes}
              onChange={handleInputChange}
              sx={{ mb: 3 }}
            />

            <Typography variant="body1" gutterBottom>
              <strong>{t('routes.selectedOrders', 'Selected Orders')}:</strong> {selectedOrders.length}
            </Typography>
            <Typography variant="body1" gutterBottom>
              <strong>{t('routes.routeDate', 'Route Date')}:</strong> {new Date(routeData.routeDate).toLocaleDateString()}
            </Typography>
            <Typography variant="body1" gutterBottom>
              <strong>{t('routes.plannedStartTime', 'Planned Start Time')}:</strong> {routeData.plannedStartTime}
            </Typography>
          </Box>
        )}

        {/* Step 3: Confirmation */}
        {activeStep === 2 && optimizedRoute && (
          <Box>
            <Alert severity="success" sx={{ mb: 3 }}>
              {t('routes.routeCreated', 'Route created successfully!')}
            </Alert>

            <Typography variant="h6" gutterBottom>
              {t('routes.routeSummary', 'Route Summary')}
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.routeNumber', 'Route #')}
                  </Typography>
                  <Typography variant="h6">
                    {optimizedRoute.routeNumber || optimizedRoute.id?.substring(0, 8)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.totalStops', 'Total Stops')}
                  </Typography>
                  <Typography variant="h6">
                    {optimizedRoute.totalStops}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.totalDistance', 'Total Distance')}
                  </Typography>
                  <Typography variant="h6">
                    {optimizedRoute.totalDistance.toFixed(1)} km
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.estimatedDuration', 'Estimated Duration')}
                  </Typography>
                  <Typography variant="h6">
                    {optimizedRoute.estimatedDuration} min
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
              {t('routes.stopSequence', 'Stop Sequence')}
            </Typography>
            <List>
              {optimizedRoute.stops?.map((stop, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={`${index + 1}. ${stop.deliveryAddress}`}
                    secondary={`ETA: ${new Date(stop.estimatedArrivalTime).toLocaleTimeString()}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            onClick={handleBack}
            disabled={activeStep === 0 || loading}
          >
            {t('common.back', 'Back')}
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={loading || (activeStep === 0 && selectedOrders.length === 0)}
            startIcon={activeStep === 2 ? <SaveIcon /> : null}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : activeStep === 2 ? (
              t('routes.finish', 'Finish')
            ) : (
              t('common.next', 'Next')
            )}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default CreateRoute;
