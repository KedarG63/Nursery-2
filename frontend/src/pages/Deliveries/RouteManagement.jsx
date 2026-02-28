import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import RouteIcon from '@mui/icons-material/Route';

import deliveryService from '../../services/deliveryService';
import userService from '../../services/userService';
import vehicleService from '../../services/vehicleService';

const ROUTE_STATUSES = ['planned', 'assigned', 'in_progress', 'completed', 'cancelled'];

const RouteManagement = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRoutes, setTotalRoutes] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
  const [openAssignDialog, setOpenAssignDialog] = useState(false);
  const [assignData, setAssignData] = useState({
    driverId: '',
    vehicleId: ''
  });
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    fetchRoutes();
    fetchDriversAndVehicles();
  }, [page, rowsPerPage]);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const response = await deliveryService.getRoutes({
        page: page + 1,
        limit: rowsPerPage
      });

      if (response.success) {
        setRoutes(response.routes);
        setTotalRoutes(response.pagination.total);
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
      setError('Failed to load routes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDriversAndVehicles = async () => {
    try {
      // Fetch drivers with Delivery role
      const driversResponse = await userService.getUsersByRole('Delivery');
      if (driversResponse.success) {
        setDrivers(driversResponse.users);
      }

      // Fetch available vehicles
      const vehiclesResponse = await vehicleService.getVehicles({ status: 'available' });
      if (vehiclesResponse.success) {
        setVehicles(vehiclesResponse.vehicles);
      }
    } catch (err) {
      console.error('Error fetching drivers and vehicles:', err);
    }
  };

  const handleViewRoute = async (routeId) => {
    try {
      const response = await deliveryService.getRouteById(routeId);
      if (response.success) {
        setSelectedRoute(response.route);
        setOpenDetailsDialog(true);
      }
    } catch (err) {
      console.error('Error fetching route details:', err);
      setError('Failed to load route details.');
    }
  };

  const handleOpenAssignDialog = (route) => {
    setSelectedRoute(route);
    setAssignData({
      driverId: route.driver_id || '',
      vehicleId: route.vehicle_id || ''
    });
    setOpenAssignDialog(true);
  };

  const handleAssignRoute = async () => {
    try {
      await deliveryService.assignRoute(selectedRoute.id, assignData);
      setSuccess('Route assigned successfully');
      setOpenAssignDialog(false);
      fetchRoutes();
    } catch (err) {
      console.error('Error assigning route:', err);
      setError(err.response?.data?.message || 'Failed to assign route.');
    }
  };

  const handleStartRoute = async (routeId) => {
    if (!window.confirm('Are you sure you want to start this route?')) {
      return;
    }

    try {
      await deliveryService.startRoute(routeId);
      setSuccess('Route started successfully');
      fetchRoutes();
    } catch (err) {
      console.error('Error starting route:', err);
      setError('Failed to start route.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planned':
        return 'default';
      case 'assigned':
        return 'info';
      case 'in_progress':
        return 'warning';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          {t('routes.title', 'Route Management')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/deliveries/routes/create')}
        >
          {t('routes.createRoute', 'Create Route')}
        </Button>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Routes Table */}
      <Paper>
        {loading ? (
          <Box display="flex" justifyContent="center" p={5}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('routes.routeNumber', 'Route #')}</TableCell>
                    <TableCell>{t('routes.date', 'Date')}</TableCell>
                    <TableCell>{t('routes.driver', 'Driver')}</TableCell>
                    <TableCell>{t('routes.vehicle', 'Vehicle')}</TableCell>
                    <TableCell>{t('routes.stops', 'Stops')}</TableCell>
                    <TableCell>{t('routes.distance', 'Distance')}</TableCell>
                    <TableCell>{t('routes.status', 'Status')}</TableCell>
                    <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {routes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Box py={3}>
                          <RouteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                          <Typography color="text.secondary">
                            {t('routes.noRoutes', 'No routes found. Create your first route!')}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    routes.map((route) => (
                      <TableRow key={route.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {route.route_number || route.id.substring(0, 8)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {new Date(route.route_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{route.driver_name || '-'}</TableCell>
                        <TableCell>{route.vehicle_number || '-'}</TableCell>
                        <TableCell>
                          {route.completed_stops || 0} / {route.total_stops || 0}
                        </TableCell>
                        <TableCell>
                          {route.total_distance_km ? `${parseFloat(route.total_distance_km).toFixed(1)} km` : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={route.status}
                            size="small"
                            color={getStatusColor(route.status)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleViewRoute(route.id)}
                            color="primary"
                          >
                            <VisibilityIcon />
                          </IconButton>
                          {route.status === 'planned' && (
                            <IconButton
                              size="small"
                              onClick={() => handleOpenAssignDialog(route)}
                              color="info"
                            >
                              <AssignmentIndIcon />
                            </IconButton>
                          )}
                          {route.status === 'assigned' && (
                            <IconButton
                              size="small"
                              onClick={() => handleStartRoute(route.id)}
                              color="success"
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={totalRoutes}
              page={page}
              onPageChange={(e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
            />
          </>
        )}
      </Paper>

      {/* Route Details Dialog */}
      <Dialog
        open={openDetailsDialog}
        onClose={() => setOpenDetailsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('routes.routeDetails', 'Route Details')}</DialogTitle>
        <DialogContent>
          {selectedRoute && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.routeNumber', 'Route #')}
                  </Typography>
                  <Typography variant="body1">
                    {selectedRoute.route_number || selectedRoute.id?.substring(0, 8)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.status', 'Status')}
                  </Typography>
                  <Chip
                    label={selectedRoute.status}
                    size="small"
                    color={getStatusColor(selectedRoute.status)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.driver', 'Driver')}
                  </Typography>
                  <Typography variant="body1">
                    {selectedRoute.driver_name || 'Not assigned'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('routes.vehicle', 'Vehicle')}
                  </Typography>
                  <Typography variant="body1">
                    {selectedRoute.vehicle_number || 'Not assigned'}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>
                {t('routes.stops', 'Stops')} ({selectedRoute.stops?.length || 0})
              </Typography>
              <List>
                {selectedRoute.stops?.map((stop, index) => (
                  <ListItem key={stop.id}>
                    <ListItemText
                      primary={`${index + 1}. ${stop.delivery_address}`}
                      secondary={`Order: ${stop.order_number} | Status: ${stop.status}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetailsDialog(false)}>
            {t('common.close', 'Close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Route Dialog */}
      <Dialog
        open={openAssignDialog}
        onClose={() => setOpenAssignDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('routes.assignRoute', 'Assign Route')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label={t('routes.selectDriver', 'Select Driver')}
                value={assignData.driverId}
                onChange={(e) => setAssignData({ ...assignData, driverId: e.target.value })}
              >
                <MenuItem value="">
                  <em>{t('common.none', 'None')}</em>
                </MenuItem>
                {drivers.map((driver) => (
                  <MenuItem key={driver.id} value={driver.id}>
                    {driver.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label={t('routes.selectVehicle', 'Select Vehicle')}
                value={assignData.vehicleId}
                onChange={(e) => setAssignData({ ...assignData, vehicleId: e.target.value })}
              >
                <MenuItem value="">
                  <em>{t('common.none', 'None')}</em>
                </MenuItem>
                {vehicles.map((vehicle) => (
                  <MenuItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number} ({vehicle.vehicle_type})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssignDialog(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleAssignRoute}
            variant="contained"
            disabled={!assignData.driverId || !assignData.vehicleId}
          >
            {t('routes.assign', 'Assign')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RouteManagement;
