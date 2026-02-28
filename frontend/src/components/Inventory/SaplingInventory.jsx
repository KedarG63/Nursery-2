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
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import inventoryService from '../../services/inventoryService';
import productService from '../../services/productService';

const SaplingInventory = () => {
  const [saplingData, setSaplingData] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const growthStages = ['seed', 'germination', 'seedling', 'transplant', 'ready', 'sold'];
  const locations = ['greenhouse', 'field', 'warehouse', 'transit'];

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchSaplingInventory();
  }, [productFilter, stageFilter, locationFilter]);

  const fetchProducts = async () => {
    try {
      const response = await productService.getAllProducts({ limit: 1000 });
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchSaplingInventory = async () => {
    setLoading(true);
    try {
      const filters = {};
      if (productFilter) filters.product_id = productFilter;
      if (stageFilter) filters.growth_stage = stageFilter;
      if (locationFilter) filters.location = locationFilter;

      const response = await inventoryService.getSaplingInventory(filters);
      setSaplingData(response.data || []);
    } catch (error) {
      console.error('Failed to fetch sapling inventory:', error);
      toast.error('Failed to load sapling inventory');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const groupedData = saplingData.reduce((acc, item) => {
    const key = `${item.productId}_${item.skuId}`;
    if (!acc[key]) {
      acc[key] = {
        productId: item.productId,
        productName: item.productName,
        skuCode: item.skuCode,
        stages: {},
        totalLots: 0,
        totalAvailable: 0,
      };
    }
    acc[key].stages[item.growthStage] = item;
    acc[key].totalLots += item.lotCount;
    acc[key].totalAvailable += item.totalAvailable;
    return acc;
  }, {});

  return (
    <Box>
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
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
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Growth Stage</InputLabel>
              <Select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                label="Growth Stage"
              >
                <MenuItem value="">All Stages</MenuItem>
                {growthStages.map((stage) => (
                  <MenuItem key={stage} value={stage}>
                    {inventoryService.getGrowthStageDisplay(stage)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                label="Location"
              >
                <MenuItem value="">All Locations</MenuItem>
                {locations.map((location) => (
                  <MenuItem key={location} value={location}>
                    {location.charAt(0).toUpperCase() + location.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Sapling Inventory Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : Object.keys(groupedData).length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No sapling inventory found
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product / SKU</TableCell>
                <TableCell align="right">Total Lots</TableCell>
                <TableCell align="right">Total Available</TableCell>
                <TableCell>Growth Stage</TableCell>
                <TableCell align="right">Lots</TableCell>
                <TableCell align="right">Available Qty</TableCell>
                <TableCell align="right">Allocated</TableCell>
                <TableCell>Ready Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.values(groupedData).map((group, groupIndex) => {
                const stages = Object.entries(group.stages);
                return stages.map(([stage, data], stageIndex) => (
                  <TableRow key={`${groupIndex}-${stageIndex}`}>
                    {stageIndex === 0 && (
                      <>
                        <TableCell rowSpan={stages.length}>
                          <Typography variant="body2" fontWeight="medium">
                            {group.productName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {group.skuCode || 'No SKU'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" rowSpan={stages.length}>
                          <Typography variant="body2" fontWeight="bold">
                            {group.totalLots}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" rowSpan={stages.length}>
                          <Typography variant="body2" fontWeight="bold" color="success.main">
                            {formatNumber(group.totalAvailable)}
                          </Typography>
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Chip
                        label={inventoryService.getGrowthStageDisplay(stage)}
                        color={inventoryService.getGrowthStageColor(stage)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">{data.lotCount}</TableCell>
                    <TableCell align="right">{formatNumber(data.totalAvailable)}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {formatNumber(data.totalAllocated)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(data.earliestReadyDate)}
                        </Typography>
                        {data.latestReadyDate !== data.earliestReadyDate && (
                          <>
                            <br />
                            <Typography variant="caption" color="text.secondary">
                              to {formatDate(data.latestReadyDate)}
                            </Typography>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Box>
  );
};

export default SaplingInventory;
