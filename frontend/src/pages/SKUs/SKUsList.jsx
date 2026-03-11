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
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useDebounce } from 'use-debounce';
import SKUsTable from '../../components/SKUs/SKUsTable';
import SKUForm from '../../components/SKUs/SKUForm';
import skuService from '../../services/skuService';
import productService from '../../services/productService';
import { canEdit } from '../../utils/roleCheck';

const SKUsList = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles; // roles is an array

  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 500);
  const [productFilter, setProductFilter] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [skuToDelete, setSkuToDelete] = useState(null);
  const [skuFormOpen, setSkuFormOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Fetch products for filter dropdown
  useEffect(() => {
    fetchProducts();
  }, []);

  // Fetch SKUs
  useEffect(() => {
    fetchSKUs();
  }, [debouncedSearch, productFilter, lowStockFilter, page]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await productService.getAllProducts({ limit: 1000, is_active: true });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSKUs = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (productFilter) {
        params.product_id = productFilter;
      }

      if (lowStockFilter) {
        params.low_stock = true;
      }

      const response = await skuService.getAllSKUs(params);
      setSkus(response.data || response.skus || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch SKUs:', error);
      toast.error('Failed to load SKUs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleProductFilterChange = (event) => {
    setProductFilter(event.target.value);
    setPage(1);
  };

  const handleLowStockFilterChange = (event) => {
    setLowStockFilter(event.target.checked);
    setPage(1);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleAddSku = () => {
    setSelectedSku(null);
    setSkuFormOpen(true);
  };

  const handleEditSku = (sku) => {
    setSelectedSku(sku);
    setSkuFormOpen(true);
  };

  const handleDeleteClick = (skuId) => {
    setSkuToDelete(skuId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await skuService.deleteSKU(skuToDelete);
      toast.success('SKU deleted successfully');
      setDeleteDialogOpen(false);
      setSkuToDelete(null);
      fetchSKUs();
    } catch (error) {
      console.error('Failed to delete SKU:', error);
      toast.error(error.response?.data?.message || 'Failed to delete SKU');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSkuToDelete(null);
  };

  const handleSkuFormClose = () => {
    setSkuFormOpen(false);
    setSelectedSku(null);
  };

  const handleSkuSaved = () => {
    fetchSKUs();
    handleSkuFormClose();
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Product Varieties
        </Typography>
        {canEdit(userRole) && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddSku}
          >
            Add Product Variety
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search by SKU code..."
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
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select
                value={productFilter}
                onChange={handleProductFilterChange}
                label="Product"
                disabled={loadingProducts}
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
          <Grid item xs={12} sm={6} md={3}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={lowStockFilter}
                  onChange={handleLowStockFilterChange}
                />
              }
              label="Show Low Stock Only"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* SKUs Table */}
      <SKUsTable
        skus={skus}
        loading={loading}
        onEdit={handleEditSku}
        onDelete={handleDeleteClick}
      />

      {/* Pagination */}
      {!loading && skus.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this SKU? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* SKU Form Dialog */}
      <SKUForm
        open={skuFormOpen}
        onClose={handleSkuFormClose}
        sku={selectedSku}
        onSuccess={handleSkuSaved}
      />
    </Box>
  );
};

export default SKUsList;
