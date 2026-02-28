/**
 * Inventory Reports Page
 * Comprehensive inventory analytics and stock monitoring
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
import { FileDownload as ExportIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import StockLevels from '../../components/Reports/StockLevels';
import StageDistribution from '../../components/Reports/StageDistribution';
import { getInventoryReport, exportInventoryReport } from '../../services/reportService';

const InventoryReports = () => {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [filters, setFilters] = useState({
    product: '',
    location: '',
    status: '',
  });

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await getInventoryReport(filters);
      setReportData(response.data || response);
    } catch (error) {
      console.error('Error fetching inventory report:', error);
      toast.error('Failed to load inventory report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportInventoryReport(filters);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const stockLevels = reportData?.stock_levels || [];
  const stageDistribution = reportData?.stage_distribution || [];
  const lowStockItems = reportData?.low_stock_items || [];

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Inventory Reports</Typography>
        <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExport}>
          Export Report
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Product Category</InputLabel>
              <Select
                value={filters.product}
                label="Product Category"
                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="roses">Roses</MenuItem>
                <MenuItem value="orchids">Orchids</MenuItem>
                <MenuItem value="succulents">Succulents</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={filters.location}
                label="Location"
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="greenhouse1">Greenhouse 1</MenuItem>
                <MenuItem value="greenhouse2">Greenhouse 2</MenuItem>
                <MenuItem value="outdoor">Outdoor Area</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Stock Status</InputLabel>
              <Select
                value={filters.status}
                label="Stock Status"
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="low">Low Stock</MenuItem>
                <MenuItem value="adequate">Adequate</MenuItem>
                <MenuItem value="high">High Stock</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <Button variant="contained" fullWidth onClick={fetchReport}>
              Apply Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">
            {lowStockItems.length} items are running low on stock!
          </Typography>
          <Typography variant="caption">
            {lowStockItems.slice(0, 3).map((item) => item.sku_name).join(', ')}
            {lowStockItems.length > 3 && ` and ${lowStockItems.length - 3} more...`}
          </Typography>
        </Alert>
      )}

      {/* Charts and Tables */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Stock Levels
          </Typography>
          <StockLevels data={stockLevels} />
        </Grid>

        <Grid item xs={12} md={4}>
          <StageDistribution data={stageDistribution} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default InventoryReports;
