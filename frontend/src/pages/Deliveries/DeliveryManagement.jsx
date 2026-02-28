import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RouteIcon from '@mui/icons-material/Route';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import PersonIcon from '@mui/icons-material/Person';

import deliveryService from '../../services/deliveryService';

const DeliveryManagement = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [summary, setSummary] = useState({
    activeRoutesToday: 0,
    routesByStatus: [],
    deliveriesToday: { total: 0, completed: 0, inProgress: 0 },
    upcomingDeliveries: [],
    driverPerformance: []
  });

  useEffect(() => {
    fetchDeliverySummary();
  }, []);

  const fetchDeliverySummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await deliveryService.getDeliverySummary();
      if (response.success) {
        setSummary(response.data);
      }
    } catch (err) {
      console.error('Error fetching delivery summary:', err);
      setError('Failed to load delivery data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          {t('deliveries.title', 'Delivery Management')}
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/deliveries/routes/create')}
            sx={{ mr: 2 }}
          >
            {t('deliveries.createRoute', 'Create Route')}
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('deliveries.activeRoutes', 'Active Routes Today')}
            </Typography>
            <Typography variant="h3" color="primary">
              {summary.activeRoutesToday}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('deliveries.totalDeliveries', 'Total Deliveries Today')}
            </Typography>
            <Typography variant="h3" color="primary">
              {summary.deliveriesToday.total}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('deliveries.completed', 'Completed')}
            </Typography>
            <Typography variant="h3" color="success.main">
              {summary.deliveriesToday.completed}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('deliveries.inProgress', 'In Progress')}
            </Typography>
            <Typography variant="h3" color="warning.main">
              {summary.deliveriesToday.inProgress}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Navigation Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab
            icon={<RouteIcon />}
            label={t('deliveries.routes', 'Routes')}
            iconPosition="start"
          />
          <Tab
            icon={<PersonIcon />}
            label={t('deliveries.drivers', 'Drivers')}
            iconPosition="start"
          />
          <Tab
            icon={<LocalShippingIcon />}
            label={t('deliveries.vehicles', 'Vehicles')}
            iconPosition="start"
          />
          <Tab
            icon={<GpsFixedIcon />}
            label={t('deliveries.tracking', 'Live Tracking')}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box>
        {activeTab === 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('deliveries.routesOverview', 'Routes Overview')}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/deliveries/routes')}
              >
                {t('deliveries.viewAllRoutes', 'View All Routes')}
              </Button>
            </Box>
          </Paper>
        )}

        {activeTab === 1 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('deliveries.driversManagement', 'Drivers Management')}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/deliveries/drivers')}
              >
                {t('deliveries.manageDrivers', 'Manage Drivers')}
              </Button>
            </Box>
          </Paper>
        )}

        {activeTab === 2 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('deliveries.vehicleFleet', 'Vehicle Fleet')}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/deliveries/vehicles')}
              >
                {t('deliveries.manageVehicles', 'Manage Vehicles')}
              </Button>
            </Box>
          </Paper>
        )}

        {activeTab === 3 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('deliveries.liveTracking', 'Live GPS Tracking')}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/deliveries/tracking')}
              >
                {t('deliveries.viewTracking', 'View Live Tracking')}
              </Button>
            </Box>
          </Paper>
        )}
      </Box>

      {/* Driver Performance Section */}
      {summary.driverPerformance.length > 0 && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('deliveries.driverPerformance', 'Driver Performance Today')}
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {summary.driverPerformance.map((driver) => (
              <Grid item xs={12} sm={6} md={4} key={driver.driverId}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {driver.driverName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Routes: {driver.routesAssigned} | Stops: {driver.stopsCompleted}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default DeliveryManagement;
