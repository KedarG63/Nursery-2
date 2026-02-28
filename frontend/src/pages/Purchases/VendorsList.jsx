import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper,
  Typography,
  Pagination,
  Grid,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useDebounce } from 'use-debounce';
import vendorService from '../../services/vendorService';
import VendorForm from '../../components/Purchases/VendorForm';
import { canEdit } from '../../utils/roleCheck';

const VendorsList = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);

  const statuses = vendorService.getStatuses();

  useEffect(() => {
    fetchVendors();
  }, [debouncedSearch, statusFilter, page]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (statusFilter) {
        params.status = statusFilter;
      }

      const response = await vendorService.getAllVendors(params);
      setVendors(response.data || response.vendors || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleStatusChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleAddVendor = () => {
    setSelectedVendor(null);
    setVendorFormOpen(true);
  };

  const handleEditVendor = (vendor) => {
    setSelectedVendor(vendor);
    setVendorFormOpen(true);
  };

  const handleDeleteClick = (vendorId) => {
    setVendorToDelete(vendorId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await vendorService.deleteVendor(vendorToDelete);
      toast.success('Vendor deleted successfully');
      setDeleteDialogOpen(false);
      setVendorToDelete(null);
      fetchVendors();
    } catch (error) {
      console.error('Failed to delete vendor:', error);
      toast.error(error.response?.data?.message || 'Failed to delete vendor');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setVendorToDelete(null);
  };

  const handleVendorFormClose = () => {
    setVendorFormOpen(false);
    setSelectedVendor(null);
  };

  const handleVendorSaved = () => {
    fetchVendors();
    handleVendorFormClose();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5" component="h1">
            Vendors
          </Typography>
          {canEdit(userRole) && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddVendor}
            >
              Add Vendor
            </Button>
          )}
        </Box>

        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={handleStatusChange}
              >
                <MenuItem value="">All Statuses</MenuItem>
                {statuses.map((status) => (
                  <MenuItem key={status} value={status}>
                    {vendorService.getStatusDisplay(status)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Vendors Table */}
        {loading ? (
          <Typography>Loading...</Typography>
        ) : vendors.length === 0 ? (
          <Typography>No vendors found</Typography>
        ) : (
          <Box>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Code</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Contact</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Phone</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                    {canEdit(userRole) && (
                      <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '12px' }}>{vendor.vendor_code}</td>
                      <td style={{ padding: '12px' }}>{vendor.vendor_name}</td>
                      <td style={{ padding: '12px' }}>{vendor.contact_person || '-'}</td>
                      <td style={{ padding: '12px' }}>{vendor.phone || '-'}</td>
                      <td style={{ padding: '12px' }}>{vendor.email || '-'}</td>
                      <td style={{ padding: '12px' }}>
                        <Chip
                          label={vendorService.getStatusDisplay(vendor.status)}
                          color={vendorService.getStatusColor(vendor.status)}
                          size="small"
                        />
                      </td>
                      {canEdit(userRole) && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditVendor(vendor)}
                            color="primary"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteClick(vendor.id)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                />
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Vendor Form Dialog */}
      <VendorForm
        open={vendorFormOpen}
        onClose={handleVendorFormClose}
        onSuccess={handleVendorSaved}
        vendor={selectedVendor}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this vendor?
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorsList;
