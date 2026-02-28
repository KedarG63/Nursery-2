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
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';

import userService from '../../services/userService';

const DriversManagement = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    licenseNumber: '',
    licenseExpiry: ''
  });

  useEffect(() => {
    fetchDrivers();
  }, [page, rowsPerPage]);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const response = await userService.getUsersByRole('Delivery');

      if (response.success) {
        setDrivers(response.users || []);
      }
    } catch (err) {
      console.error('Error fetching drivers:', err);
      setError('Failed to load drivers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (driver = null) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        fullName: driver.fullName || '',
        email: driver.email || '',
        phone: driver.phone || '',
        password: '',
        licenseNumber: driver.licenseNumber || '',
        licenseExpiry: driver.licenseExpiry || ''
      });
    } else {
      setEditingDriver(null);
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        password: '',
        licenseNumber: '',
        licenseExpiry: ''
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingDriver(null);
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

      if (editingDriver) {
        await userService.updateDriver(editingDriver.id, formData);
        setSuccess('Driver updated successfully');
      } else {
        await userService.createDriver(formData);
        setSuccess('Driver created successfully');
      }

      handleCloseDialog();
      fetchDrivers();
    } catch (err) {
      console.error('Error saving driver:', err);
      setError(err.response?.data?.message || 'Failed to save driver. Please try again.');
    }
  };

  const handleDelete = async (driverId) => {
    if (!window.confirm('Are you sure you want to delete this driver?')) {
      return;
    }

    try {
      await userService.deleteUser(driverId);
      setSuccess('Driver deleted successfully');
      fetchDrivers();
    } catch (err) {
      console.error('Error deleting driver:', err);
      setError('Failed to delete driver. Please try again.');
    }
  };

  const paginatedDrivers = drivers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          {t('drivers.title', 'Drivers Management')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          {t('drivers.addDriver', 'Add Driver')}
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

      {/* Drivers Table */}
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
                    <TableCell>{t('drivers.name', 'Name')}</TableCell>
                    <TableCell>{t('drivers.email', 'Email')}</TableCell>
                    <TableCell>{t('drivers.phone', 'Phone')}</TableCell>
                    <TableCell>{t('drivers.licenseNumber', 'License Number')}</TableCell>
                    <TableCell>{t('drivers.status', 'Status')}</TableCell>
                    <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedDrivers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Box py={3}>
                          <PersonIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                          <Typography color="text.secondary">
                            {t('drivers.noDrivers', 'No drivers found. Add your first driver!')}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedDrivers.map((driver) => (
                      <TableRow key={driver.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {driver.fullName}
                          </Typography>
                        </TableCell>
                        <TableCell>{driver.email}</TableCell>
                        <TableCell>{driver.phone}</TableCell>
                        <TableCell>{driver.licenseNumber || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={driver.status || 'active'}
                            size="small"
                            color={driver.status === 'active' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(driver)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(driver.id)}
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
              count={drivers.length}
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
          {editingDriver ? t('drivers.editDriver', 'Edit Driver') : t('drivers.addDriver', 'Add Driver')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('drivers.fullName', 'Full Name')}
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('drivers.email', 'Email')}
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={!!editingDriver}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('drivers.phone', 'Phone')}
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                required
              />
            </Grid>
            {!editingDriver && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('drivers.password', 'Password')}
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('drivers.licenseNumber', 'License Number')}
                name="licenseNumber"
                value={formData.licenseNumber}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label={t('drivers.licenseExpiry', 'License Expiry')}
                name="licenseExpiry"
                value={formData.licenseExpiry}
                onChange={handleInputChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingDriver ? t('common.update', 'Update') : t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DriversManagement;
