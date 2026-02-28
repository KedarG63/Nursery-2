import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import inventoryService from '../../services/inventoryService';
import productService from '../../services/productService';

const SeedInventory = () => {
  const navigate = useNavigate();
  const [seedData, setSeedData] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiringFilter, setExpiringFilter] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchSeedInventory();
  }, [productFilter, statusFilter, expiringFilter]);

  const fetchProducts = async () => {
    try {
      const response = await productService.getAllProducts({ limit: 1000 });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchSeedInventory = async () => {
    setLoading(true);
    try {
      const filters = {};
      if (productFilter) filters.product_id = productFilter;
      if (statusFilter) filters.inventory_status = statusFilter;
      if (expiringFilter) filters.expiring_days = parseInt(expiringFilter);

      const response = await inventoryService.getSeedInventory(filters);
      setSeedData(response.data || []);
    } catch (error) {
      console.error('Failed to fetch seed inventory:', error);
      toast.error('Failed to load seed inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleProductFilterChange = (event) => {
    setProductFilter(event.target.value);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
  };

  const handleExpiringFilterChange = (event) => {
    setExpiringFilter(event.target.value);
  };

  const handleViewDetails = (item) => {
    navigate(`/purchases?product_id=${item.productId}`);
  };

  const handleCreateLot = () => {
    // Navigate to lots page which will open the create dialog
    navigate('/inventory/lots?action=create');
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const getStatusColor = (count, type) => {
    if (type === 'expiring' && count > 0) return 'error';
    if (type === 'low_stock' && count > 0) return 'warning';
    if (type === 'available' && count > 0) return 'success';
    return 'default';
  };

  return (
    <Box>
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select
                value={productFilter}
                onChange={handleProductFilterChange}
                label="Product"
              >
                <MenuItem value="">All Products</MenuItem>
                {products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={handleStatusFilterChange}
                label="Status"
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="low_stock">Low Stock</MenuItem>
                <MenuItem value="exhausted">Exhausted</MenuItem>
                <MenuItem value="expired">Expired</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Expiring</InputLabel>
              <Select
                value={expiringFilter}
                onChange={handleExpiringFilterChange}
                label="Expiring"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="30">Within 30 days</MenuItem>
                <MenuItem value="60">Within 60 days</MenuItem>
                <MenuItem value="90">Within 90 days</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Seed Inventory Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : seedData.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No seed inventory found
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/purchases/new')}
              sx={{ mt: 2 }}
            >
              Add Purchase
            </Button>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell align="right">Available Seeds</TableCell>
                <TableCell align="right">Purchases</TableCell>
                <TableCell>Vendors</TableCell>
                <TableCell>Earliest Expiry</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {seedData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {item.productName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.productCategory}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {item.skuCode || <Typography variant="caption" color="text.secondary">N/A</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold">
                      {formatNumber(item.totalSeedsRemaining)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      of {formatNumber(item.totalSeedsPurchased)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box>
                      <Chip
                        label={item.availablePurchases}
                        color={getStatusColor(item.availablePurchases, 'available')}
                        size="small"
                        icon={<CheckCircleIcon />}
                      />
                      {item.lowStockPurchases > 0 && (
                        <Chip
                          label={item.lowStockPurchases}
                          color="warning"
                          size="small"
                          icon={<WarningIcon />}
                          sx={{ ml: 0.5 }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {item.vendors && item.vendors.length > 0 ? (
                      <Typography variant="body2">
                        {item.vendors.slice(0, 2).join(', ')}
                        {item.vendors.length > 2 && ` +${item.vendors.length - 2}`}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">
                        {formatDate(item.earliestExpiryDate)}
                      </Typography>
                      {item.expiringSoonCount > 0 && (
                        <Chip
                          label={`${item.expiringSoonCount} expiring`}
                          color="error"
                          size="small"
                          icon={<WarningIcon />}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {item.availablePurchases > 0 && (
                        <Chip
                          label="Available"
                          color="success"
                          size="small"
                        />
                      )}
                      {item.lowStockPurchases > 0 && (
                        <Chip
                          label="Low Stock"
                          color="warning"
                          size="small"
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(item)}
                        color="info"
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Create Lot">
                      <IconButton
                        size="small"
                        onClick={() => handleCreateLot(item)}
                        color="primary"
                        disabled={item.totalSeedsRemaining <= 0}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Box>
  );
};

export default SeedInventory;
