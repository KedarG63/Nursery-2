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
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useDebounce } from 'use-debounce';
import { useNavigate } from 'react-router-dom';
import purchaseService from '../../services/purchaseService';
import PurchaseForm from '../../components/Purchases/PurchaseForm';
import PurchaseDetails from '../../components/Purchases/PurchaseDetails';
import { canEdit } from '../../utils/roleCheck';

const PurchasesList = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;
  const navigate = useNavigate();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 500);
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [purchaseDetails, setPurchaseDetails] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  const inventoryStatuses = purchaseService.getInventoryStatuses();
  const paymentStatuses = purchaseService.getPaymentStatuses();

  useEffect(() => {
    fetchPurchases();
  }, [debouncedSearch, inventoryStatusFilter, paymentStatusFilter, page]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (inventoryStatusFilter) {
        params.inventory_status = inventoryStatusFilter;
      }

      if (paymentStatusFilter) {
        params.payment_status = paymentStatusFilter;
      }

      const response = await purchaseService.getAllPurchases(params);
      setPurchases(response.data || response.purchases || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to load purchases';
      if (errorMsg.includes('does not exist') || errorMsg.includes('relation')) {
        toast.error('Database tables not found. Please run migrations: npm run migrate:up');
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleInventoryStatusChange = (event) => {
    setInventoryStatusFilter(event.target.value);
    setPage(1);
  };

  const handlePaymentStatusChange = (event) => {
    setPaymentStatusFilter(event.target.value);
    setPage(1);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleAddPurchase = () => {
    setSelectedPurchase(null);
    setPurchaseFormOpen(true);
  };

  const handleEditPurchase = (purchase) => {
    setSelectedPurchase(purchase);
    setPurchaseFormOpen(true);
  };

  const handleViewPurchase = async (purchase) => {
    try {
      const details = await purchaseService.getPurchaseById(purchase.id);
      setPurchaseDetails(details.data || details);
      setDetailsDialogOpen(true);
    } catch (error) {
      console.error('Failed to fetch purchase details:', error);
      toast.error('Failed to load purchase details');
    }
  };

  const handleDeleteClick = (purchaseId) => {
    setPurchaseToDelete(purchaseId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await purchaseService.deletePurchase(purchaseToDelete);
      toast.success('Purchase deleted successfully');
      setDeleteDialogOpen(false);
      setPurchaseToDelete(null);
      fetchPurchases();
    } catch (error) {
      console.error('Failed to delete purchase:', error);
      toast.error(error.response?.data?.message || 'Failed to delete purchase');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setPurchaseToDelete(null);
  };

  const handlePurchaseFormClose = () => {
    setPurchaseFormOpen(false);
    setSelectedPurchase(null);
  };

  const handlePurchaseSaved = () => {
    fetchPurchases();
    handlePurchaseFormClose();
  };

  const handleDetailsClose = () => {
    setDetailsDialogOpen(false);
    setPurchaseDetails(null);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5" component="h1">
            Seed Purchases
          </Typography>
          {canEdit(userRole) && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddPurchase}
            >
              Add Purchase
            </Button>
          )}
        </Box>

        {/* Tabs for Purchases and Vendors */}
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 3 }}>
          <Tab label="Purchases" />
          <Tab label="Vendors" />
        </Tabs>

        {activeTab === 0 && (
          <>
            {/* Filters */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  placeholder="Search purchases..."
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
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Inventory Status</InputLabel>
                  <Select
                    value={inventoryStatusFilter}
                    label="Inventory Status"
                    onChange={handleInventoryStatusChange}
                  >
                    <MenuItem value="">All Inventory Status</MenuItem>
                    {inventoryStatuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {purchaseService.getInventoryStatusDisplay(status)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Payment Status</InputLabel>
                  <Select
                    value={paymentStatusFilter}
                    label="Payment Status"
                    onChange={handlePaymentStatusChange}
                  >
                    <MenuItem value="">All Payment Status</MenuItem>
                    {paymentStatuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {purchaseService.getPaymentStatusDisplay(status)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Purchases Table */}
            {loading ? (
              <Typography>Loading...</Typography>
            ) : purchases.length === 0 ? (
              <Typography>No purchases found</Typography>
            ) : (
              <Box>
                <Box sx={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Purchase #</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Vendor</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Product</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Packets</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Seeds</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Remaining</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Inv. Status</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Pay. Status</th>
                        {canEdit(userRole) && (
                          <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((purchase) => (
                        <tr key={purchase.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                          <td style={{ padding: '12px' }}>{purchase.purchase_number}</td>
                          <td style={{ padding: '12px' }}>{formatDate(purchase.purchase_date)}</td>
                          <td style={{ padding: '12px' }}>{purchase.vendor_name || '-'}</td>
                          <td style={{ padding: '12px' }}>{purchase.product_name || '-'}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{purchase.number_of_packets}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{purchase.total_seeds}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{purchase.seeds_remaining}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(purchase.grand_total)}</td>
                          <td style={{ padding: '12px' }}>
                            <Chip
                              label={purchaseService.getInventoryStatusDisplay(purchase.inventory_status)}
                              color={purchaseService.getInventoryStatusColor(purchase.inventory_status)}
                              size="small"
                            />
                          </td>
                          <td style={{ padding: '12px' }}>
                            <Chip
                              label={purchaseService.getPaymentStatusDisplay(purchase.payment_status)}
                              color={purchaseService.getPaymentStatusColor(purchase.payment_status)}
                              size="small"
                            />
                          </td>
                          {canEdit(userRole) && (
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <IconButton
                                size="small"
                                onClick={() => handleViewPurchase(purchase)}
                                color="info"
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleEditPurchase(purchase)}
                                color="primary"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteClick(purchase.id)}
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
          </>
        )}

        {activeTab === 1 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" gutterBottom>
              Vendor Management
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Click the button below to manage vendors
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/purchases/vendors')}
            >
              Go to Vendors Page
            </Button>
          </Box>
        )}
      </Paper>

      {/* Purchase Form Dialog */}
      <PurchaseForm
        open={purchaseFormOpen}
        onClose={handlePurchaseFormClose}
        onSuccess={handlePurchaseSaved}
        purchase={selectedPurchase}
      />

      {/* Purchase Details Dialog */}
      {purchaseDetails && (
        <PurchaseDetails
          open={detailsDialogOpen}
          onClose={handleDetailsClose}
          purchase={purchaseDetails}
          onRefresh={fetchPurchases}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this purchase?
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

export default PurchasesList;
