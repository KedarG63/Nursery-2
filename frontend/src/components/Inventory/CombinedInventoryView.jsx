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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import inventoryService from '../../services/inventoryService';
import productService from '../../services/productService';

const CombinedInventoryView = () => {
  const [combinedData, setCombinedData] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchCombinedInventory();
  }, [productFilter]);

  const fetchProducts = async () => {
    try {
      const response = await productService.getAllProducts({ limit: 1000 });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchCombinedInventory = async () => {
    setLoading(true);
    try {
      const filters = {};
      if (productFilter) filters.product_id = productFilter;

      const response = await inventoryService.getCombinedInventory(filters);
      setCombinedData(response.data || []);
    } catch (error) {
      console.error('Failed to fetch combined inventory:', error);
      toast.error('Failed to load combined inventory');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const calculateTotalStock = (item) => {
    const seeds = item.seeds?.totalRemaining || 0;
    const readySaplings = item.saplings?.ready?.totalAvailable || 0;
    return seeds + readySaplings;
  };

  const calculatePipelineStock = (item) => {
    let total = 0;
    if (item.saplings) {
      ['seed', 'germination', 'seedling', 'transplant'].forEach(stage => {
        if (item.saplings[stage]) {
          total += item.saplings[stage].totalAvailable || 0;
        }
      });
    }
    return total;
  };

  const getStockHealthColor = (seeds, ready) => {
    const total = seeds + ready;
    if (total > 1000) return 'success';
    if (total > 100) return 'warning';
    if (total > 0) return 'error';
    return 'default';
  };

  return (
    <Box>
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
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
        </Grid>
      </Paper>

      {/* Combined Inventory Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : combinedData.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No inventory data found
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product / SKU</TableCell>
                <TableCell align="right">Seeds Available</TableCell>
                <TableCell align="right">Ready Saplings</TableCell>
                <TableCell align="right">Total Stock</TableCell>
                <TableCell align="right">In Growth</TableCell>
                <TableCell>Pipeline</TableCell>
                <TableCell>Stock Health</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {combinedData.map((item, index) => {
                const seedsAvailable = item.seeds?.totalRemaining || 0;
                const readySaplings = item.saplings?.ready?.totalAvailable || 0;
                const totalStock = seedsAvailable + readySaplings;
                const inGrowth = calculatePipelineStock(item);
                const totalPipeline = seedsAvailable + inGrowth + readySaplings;

                return (
                  <TableRow key={index}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {item.productName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.skuCode || 'No SKU'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {formatNumber(seedsAvailable)}
                        </Typography>
                        {item.seeds?.expiringSoon && (
                          <Chip label="Expiring" color="error" size="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {formatNumber(readySaplings)}
                      </Typography>
                      {item.saplings?.ready && (
                        <Typography variant="caption" color="text.secondary">
                          {item.saplings.ready.lotCount} lots
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="h6" fontWeight="bold">
                        {formatNumber(totalStock)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="primary">
                        {formatNumber(inGrowth)}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        {item.saplings?.seedling && (
                          <Chip
                            label={`S:${item.saplings.seedling.lotCount}`}
                            size="small"
                            color="primary"
                          />
                        )}
                        {item.saplings?.transplant && (
                          <Chip
                            label={`T:${item.saplings.transplant.lotCount}`}
                            size="small"
                            color="secondary"
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%', minWidth: 120 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Pipeline
                          </Typography>
                          <Typography variant="caption" fontWeight="bold">
                            {formatNumber(totalPipeline)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={totalPipeline > 0 ? Math.min((readySaplings / totalPipeline) * 100, 100) : 0}
                          color={readySaplings > seedsAvailable ? 'success' : 'warning'}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Seeds: {((seedsAvailable / totalPipeline) * 100).toFixed(0)}%
                          </Typography>
                          <Typography variant="caption" color="success.main">
                            Ready: {((readySaplings / totalPipeline) * 100).toFixed(0)}%
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={totalStock > 100 ? 'Healthy' : totalStock > 0 ? 'Low' : 'Empty'}
                        color={getStockHealthColor(seedsAvailable, readySaplings)}
                        icon={totalStock > 100 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Box>
  );
};

export default CombinedInventoryView;
