/**
 * Inventory Reports Page
 * Stock levels, growth-stage distribution, location breakdown and
 * lots becoming ready — from GET /api/reports/inventory.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
} from '@mui/material';
import { FileDownload as ExportIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import StockLevels from '../../components/Reports/StockLevels';
import StageDistribution from '../../components/Reports/StageDistribution';
import { getInventoryReport, exportInventoryReport } from '../../services/reportService';
import { formatDate } from '../../utils/formatters';

const InventoryReports = () => {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [stockFilter, setStockFilter] = useState('all');

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await getInventoryReport();
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
      const blob = await exportInventoryReport();
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

  const stockLevels = reportData?.stockLevels || [];
  const stageDistribution = reportData?.lotsByStage || [];
  const lowStockItems = reportData?.lowStockAlerts || [];
  const upcomingReady = reportData?.upcomingReady || [];
  const locationBreakdown = reportData?.locationBreakdown || [];

  const visibleStock = stockFilter === 'low'
    ? stockLevels.filter((s) => s.isLowStock)
    : stockLevels;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Inventory Reports</Typography>
        <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExport}>
          Export Report
        </Button>
      </Box>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">
            {lowStockItems.length} variet{lowStockItems.length === 1 ? 'y is' : 'ies are'} below minimum stock
          </Typography>
          <Typography variant="caption">
            {lowStockItems.slice(0, 3).map((item) => `${item.productName} (${item.skuName})`).join(', ')}
            {lowStockItems.length > 3 && ` and ${lowStockItems.length - 3} more…`}
          </Typography>
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>Stock Levels</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={stockFilter}
              onChange={(e, v) => v && setStockFilter(v)}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="low">Low stock only</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <StockLevels data={visibleStock} />
        </Grid>

        <Grid item xs={12} md={4}>
          <StageDistribution data={stageDistribution} />
        </Grid>

        {/* Ready in the next 30 days */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700}>Ready in the Next 30 Days</Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              Lots reaching saleable stage — plan orders and customer notifications
            </Typography>
            {upcomingReady.length === 0 ? (
              <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
                No lots expected ready in the next 30 days
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Lot</TableCell>
                      <TableCell>Variety</TableCell>
                      <TableCell align="right">Available Qty</TableCell>
                      <TableCell align="right">Expected Ready</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {upcomingReady.map((lot) => (
                      <TableRow key={lot.lotId} hover>
                        <TableCell>{lot.lotNumber}</TableCell>
                        <TableCell>{lot.productName} · {lot.skuName}</TableCell>
                        <TableCell align="right">{Number(lot.availableQuantity).toLocaleString('en-IN')}</TableCell>
                        <TableCell align="right">{formatDate(lot.expectedReadyDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Stock by location */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight={700}>Stock by Location</Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              Where the plants are right now
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Location</TableCell>
                    <TableCell align="right">Lots</TableCell>
                    <TableCell align="right">Plants</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {locationBreakdown.map((loc) => (
                    <TableRow key={loc.location} hover>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{loc.location}</TableCell>
                      <TableCell align="right">{loc.lotCount}</TableCell>
                      <TableCell align="right">{Number(loc.quantity).toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default InventoryReports;
