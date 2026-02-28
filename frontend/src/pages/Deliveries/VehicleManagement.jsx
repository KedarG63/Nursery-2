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
  Alert
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

import vehicleService from '../../services/vehicleService';

const VEHICLE_TYPES = ['truck', 'tempo', 'van', 'pickup', 'two_wheeler'];
const VEHICLE_STATUSES = ['available', 'in_use', 'maintenance', 'inactive'];

const VehicleManagement = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    registrationNumber: '',
    vehicleType: 'truck',
    makeModel: '',
    year: new Date().getFullYear(),
    capacityUnits: 0,
    capacityWeightKg: 0,
    status: 'available',
    color: '',
    fuelType: 'diesel'
  });

  useEffect(() => {
    fetchVehicles();
  }, [page, rowsPerPage]);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await vehicleService.getVehicles({
        page: page + 1,
        limit: rowsPerPage
      });

      if (response.success) {
        setVehicles(response.vehicles);
        setTotalVehicles(response.pagination.total);
      }
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      setError('Failed to load vehicles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (vehicle = null) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setFormData({
        registrationNumber: vehicle.registration_number || '',
        vehicleType: vehicle.vehicle_type || 'truck',
        makeModel: vehicle.make_model || '',
        year: vehicle.year || new Date().getFullYear(),
        capacityUnits: vehicle.capacity_units || 0,
        capacityWeightKg: vehicle.capacity_weight_kg || 0,
        status: vehicle.status || 'available',
        color: vehicle.color || '',
        fuelType: vehicle.fuel_type || 'diesel'
      });
    } else {
      setEditingVehicle(null);
      setFormData({
        registrationNumber: '',
        vehicleType: 'truck',
        makeModel: '',
        year: new Date().getFullYear(),
        capacityUnits: 0,
        capacityWeightKg: 0,
        status: 'available',
        color: '',
        fuelType: 'diesel'
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingVehicle(null);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async () => {
    try {
      setError(null);

      const payload = {
        registrationNumber: formData.registrationNumber,
        vehicleType: formData.vehicleType,
        makeModel: formData.makeModel,
        year: parseInt(formData.year),
        capacityUnits: parseInt(formData.capacityUnits),
        capacityWeightKg: parseFloat(formData.capacityWeightKg),
        status: formData.status,
        color: formData.color,
        fuelType: formData.fuelType
      };

      if (editingVehicle) {
        await vehicleService.updateVehicle(editingVehicle.id, payload);
        setSuccess('Vehicle updated successfully');
      } else {
        await vehicleService.createVehicle(payload);
        setSuccess('Vehicle created successfully');
      }

      handleCloseDialog();
      fetchVehicles();
    } catch (err) {
      console.error('Error saving vehicle:', err);
      setError(err.response?.data?.message || 'Failed to save vehicle. Please try again.');
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) {
      return;
    }

    try {
      await vehicleService.deleteVehicle(vehicleId);
      setSuccess('Vehicle deleted successfully');
      fetchVehicles();
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      setError('Failed to delete vehicle. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'success';
      case 'in_use':
        return 'warning';
      case 'maintenance':
        return 'error';
      case 'inactive':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          {t('vehicles.title', 'Vehicle Management')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          {t('vehicles.addVehicle', 'Add Vehicle')}
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

      {/* Vehicles Table */}
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
                    <TableCell>{t('vehicles.registrationNumber', 'Registration No.')}</TableCell>
                    <TableCell>{t('vehicles.type', 'Type')}</TableCell>
                    <TableCell>{t('vehicles.makeModel', 'Make/Model')}</TableCell>
                    <TableCell>{t('vehicles.capacity', 'Capacity')}</TableCell>
                    <TableCell>{t('vehicles.status', 'Status')}</TableCell>
                    <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vehicles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Box py={3}>
                          <LocalShippingIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                          <Typography color="text.secondary">
                            {t('vehicles.noVehicles', 'No vehicles found. Add your first vehicle!')}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vehicles.map((vehicle) => (
                      <TableRow key={vehicle.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {vehicle.registration_number}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={vehicle.vehicle_type} size="small" />
                        </TableCell>
                        <TableCell>{vehicle.make_model}</TableCell>
                        <TableCell>
                          {vehicle.capacity_units} units / {vehicle.capacity_weight_kg} kg
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={vehicle.status}
                            size="small"
                            color={getStatusColor(vehicle.status)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(vehicle)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(vehicle.id)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={totalVehicles}
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

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingVehicle ? t('vehicles.editVehicle', 'Edit Vehicle') : t('vehicles.addVehicle', 'Add Vehicle')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('vehicles.registrationNumber', 'Registration Number')}
                name="registrationNumber"
                value={formData.registrationNumber}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label={t('vehicles.type', 'Vehicle Type')}
                name="vehicleType"
                value={formData.vehicleType}
                onChange={handleInputChange}
              >
                {VEHICLE_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('vehicles.makeModel', 'Make/Model')}
                name="makeModel"
                value={formData.makeModel}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('vehicles.year', 'Year')}
                name="year"
                value={formData.year}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('vehicles.capacityUnits', 'Capacity (Units)')}
                name="capacityUnits"
                value={formData.capacityUnits}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('vehicles.capacityWeight', 'Capacity (Kg)')}
                name="capacityWeightKg"
                value={formData.capacityWeightKg}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label={t('vehicles.status', 'Status')}
                name="status"
                value={formData.status}
                onChange={handleInputChange}
              >
                {VEHICLE_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('vehicles.color', 'Color')}
                name="color"
                value={formData.color}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('vehicles.fuelType', 'Fuel Type')}
                name="fuelType"
                value={formData.fuelType}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingVehicle ? t('common.update', 'Update') : t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VehicleManagement;
