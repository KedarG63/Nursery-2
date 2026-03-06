import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Pagination,
  Grid
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useDebounce } from 'use-debounce';
import { toast } from 'react-toastify';
import CustomersTable from '../../components/Customers/CustomersTable';
import CustomerForm from '../../components/Customers/CustomerForm';
import ConfirmDialog from '../../components/Common/ConfirmDialog';
import { getCustomers, deleteCustomer, createCustomer, updateCustomer } from '../../services/customerService';
import { canEdit } from '../../utils/roleCheck';

/**
 * Customers List Page
 * Issue #54: Customer list with search, filters, and credit status
 */
const CustomersList = () => {
  const { user } = useSelector((state) => state.auth);

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [customerType, setCustomerType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Customer form dialog
  const [formDialog, setFormDialog] = useState({
    open: false,
    customer: null,
    loading: false
  });

  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    customer: null,
    loading: false
  });

  /**
   * Fetch customers from API
   */
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        type: customerType || undefined
      };

      const response = await getCustomers(params);

      setCustomers(response.data || response.customers || []);
      setTotal(response.total || 0);
      setTotalPages(response.pages || 1);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error(error.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load customers on mount and when filters change
   */
  useEffect(() => {
    fetchCustomers();
  }, [debouncedSearch, customerType, page]);

  /**
   * Handle search input change
   */
  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  /**
   * Handle customer type filter change
   */
  const handleTypeChange = (e) => {
    setCustomerType(e.target.value);
    setPage(1); // Reset to first page on filter
  };

  /**
   * Handle page change
   */
  const handlePageChange = (event, value) => {
    setPage(value);
  };

  /**
   * Handle edit customer
   */
  const handleEdit = (customer) => {
    setFormDialog({
      open: true,
      customer,
      loading: false
    });
  };

  /**
   * Handle delete customer - show confirmation
   */
  const handleDeleteClick = (customer) => {
    setDeleteDialog({
      open: true,
      customer,
      loading: false
    });
  };

  /**
   * Confirm delete customer
   */
  const handleDeleteConfirm = async () => {
    try {
      setDeleteDialog((prev) => ({ ...prev, loading: true }));

      await deleteCustomer(deleteDialog.customer.id);

      toast.success('Customer deleted successfully');
      setDeleteDialog({ open: false, customer: null, loading: false });

      // Refresh list
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error(error.message || 'Failed to delete customer');
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Cancel delete
   */
  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, customer: null, loading: false });
  };

  /**
   * Handle add customer
   */
  const handleAddCustomer = () => {
    setFormDialog({
      open: true,
      customer: null,
      loading: false
    });
  };

  /**
   * Handle customer form submit
   */
  const handleFormSubmit = async (data) => {
    try {
      setFormDialog((prev) => ({ ...prev, loading: true }));

      if (formDialog.customer?.id) {
        // Update existing customer
        await updateCustomer(formDialog.customer.id, data);
        toast.success('Customer updated successfully');
      } else {
        // Create new customer
        await createCustomer(data);
        toast.success('Customer created successfully');
      }

      setFormDialog({ open: false, customer: null, loading: false });
      fetchCustomers(); // Refresh list
    } catch (error) {
      console.error('Error saving customer:', error);
      toast.error(error.errors?.[0]?.msg || error.error || error.message || 'Failed to save customer');
      setFormDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Handle customer form close
   */
  const handleFormClose = () => {
    setFormDialog({ open: false, customer: null, loading: false });
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <div>
          <Typography variant="h4" gutterBottom>
            Customers
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage customer information and credit limits
          </Typography>
        </div>

        {canEdit(user?.roles) && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddCustomer}
            sx={{ height: 'fit-content' }}
          >
            Add Customer
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <FormControl fullWidth>
            <InputLabel>Customer Type</InputLabel>
            <Select
              value={customerType}
              onChange={handleTypeChange}
              label="Customer Type"
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="Retail">Retail</MenuItem>
              <MenuItem value="Wholesale">Wholesale</MenuItem>
              <MenuItem value="Distributor">Distributor</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              {total} customer{total !== 1 ? 's' : ''} found
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Customers Table */}
      <CustomersTable
        customers={customers}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        loading={loading}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Customer Form Dialog */}
      <CustomerForm
        open={formDialog.open}
        customer={formDialog.customer}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        loading={formDialog.loading}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete Customer"
        message={`Are you sure you want to delete ${deleteDialog.customer?.name}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={deleteDialog.loading}
      />
    </Container>
  );
};

export default CustomersList;
