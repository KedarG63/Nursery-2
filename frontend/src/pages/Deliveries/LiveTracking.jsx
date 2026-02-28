import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  LinearProgress
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PlaceIcon from '@mui/icons-material/Place';

import deliveryService from '../../services/deliveryService';

const LiveTracking = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [trackingData, setTrackingData] = useState(null);

  useEffect(() => {
    fetchActiveRoutes();
    const interval = setInterval(fetchActiveRoutes, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedRoute) {
      fetchRouteProgress(selectedRoute.id);
      const interval = setInterval(() => fetchRouteProgress(selectedRoute.id), 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [selectedRoute]);

  const fetchActiveRoutes = async () => {
    try {
      setLoading(true);
      const response = await deliveryService.getRoutes({
        status: 'in_progress',
        routeDate: new Date().toISOString().split('T')[0]
      });

      if (response.success) {
        setActiveRoutes(response.routes);
        // Auto-select first route if none selected
        if (!selectedRoute && response.routes.length > 0) {
          setSelectedRoute(response.routes[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching active routes:', err);
      setError('Failed to load active routes.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRouteProgress = async (routeId) => {
    try {
      const response = await deliveryService.getRouteProgress(routeId);
      if (response.success) {
        setTrackingData(response.progress);
      }
    } catch (err) {
      console.error('Error fetching route progress:', err);
      // Don't show error for progress updates to avoid UI clutter
    }
  };

  const getStopStatusColor = (status) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'success';
      case 'in_transit':
      case 'arrived':
      case 'delivering':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const calculateProgress = (route) => {
    if (!route.total_stops || route.total_stops === 0) return 0;
    return Math.round((route.completed_stops / route.total_stops) * 100);
  };

  if (loading && activeRoutes.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">
          {t('tracking.title', 'Live GPS Tracking')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('tracking.subtitle', 'Real-time tracking of active delivery routes')}
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {activeRoutes.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <LocalShippingIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {t('tracking.noActiveRoutes', 'No active routes at the moment')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('tracking.noActiveRoutesDesc', 'Routes will appear here when they are in progress')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Active Routes List */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                {t('tracking.activeRoutes', 'Active Routes')} ({activeRoutes.length})
              </Typography>
              <List>
                {activeRoutes.map((route) => (
                  <Box key={route.id}>
                    <ListItem
                      button
                      selected={selectedRoute?.id === route.id}
                      onClick={() => setSelectedRoute(route)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1" fontWeight="bold">
                              {route.route_number || route.id.substring(0, 8)}
                            </Typography>
                            <Chip
                              label={route.status}
                              size="small"
                              color="warning"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {route.driver_name || 'No driver assigned'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {route.vehicle_number || 'No vehicle assigned'}
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={calculateProgress(route)}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {route.completed_stops || 0} / {route.total_stops || 0} stops completed
                              </Typography>
                            </Box>
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider />
                  </Box>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* Route Details and Tracking */}
          <Grid item xs={12} md={8}>
            {selectedRoute ? (
              <Box>
                {/* Route Info Card */}
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Route: {selectedRoute.route_number || selectedRoute.id.substring(0, 8)}
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">
                          {t('tracking.driver', 'Driver')}
                        </Typography>
                        <Typography variant="body1">
                          {selectedRoute.driver_name || '-'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">
                          {t('tracking.vehicle', 'Vehicle')}
                        </Typography>
                        <Typography variant="body1">
                          {selectedRoute.vehicle_number || '-'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">
                          {t('tracking.distance', 'Distance')}
                        </Typography>
                        <Typography variant="body1">
                          {selectedRoute.total_distance_km
                            ? `${parseFloat(selectedRoute.total_distance_km).toFixed(1)} km`
                            : '-'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">
                          {t('tracking.progress', 'Progress')}
                        </Typography>
                        <Typography variant="body1">
                          {calculateProgress(selectedRoute)}%
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {/* GPS Tracking Map Placeholder */}
                <Paper sx={{ p: 3, mb: 3, minHeight: 300, bgcolor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box textAlign="center">
                    <GpsFixedIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                      {t('tracking.mapPlaceholder', 'GPS Map View')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('tracking.mapComingSoon', 'Map integration coming soon')}
                    </Typography>
                    {trackingData?.currentLocation && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2">
                          Last Location: {trackingData.currentLocation.latitude?.toFixed(6)},{' '}
                          {trackingData.currentLocation.longitude?.toFixed(6)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Updated: {new Date(trackingData.currentLocation.timestamp).toLocaleTimeString()}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Paper>

                {/* Stops List */}
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    {t('tracking.stops', 'Delivery Stops')}
                  </Typography>
                  <List>
                    {trackingData?.stops?.map((stop, index) => (
                      <Box key={stop.id}>
                        <ListItem>
                          <Box sx={{ mr: 2, minWidth: 40 }}>
                            <Chip
                              label={index + 1}
                              size="small"
                              color={getStopStatusColor(stop.status)}
                            />
                          </Box>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <PlaceIcon fontSize="small" color="action" />
                                <Typography variant="body1">
                                  {stop.deliveryAddress}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="body2" color="text.secondary">
                                  Order: {stop.orderNumber} | {stop.customerContact}
                                </Typography>
                                <Box display="flex" gap={1} mt={0.5}>
                                  <Chip
                                    label={stop.status}
                                    size="small"
                                    color={getStopStatusColor(stop.status)}
                                  />
                                  {stop.estimatedArrivalTime && (
                                    <Typography variant="caption" color="text.secondary">
                                      ETA: {new Date(stop.estimatedArrivalTime).toLocaleTimeString()}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            }
                          />
                        </ListItem>
                        {index < (trackingData?.stops?.length || 0) - 1 && <Divider />}
                      </Box>
                    ))}
                  </List>
                </Paper>
              </Box>
            ) : (
              <Paper sx={{ p: 5, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {t('tracking.selectRoute', 'Select a route to view tracking details')}
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default LiveTracking;
