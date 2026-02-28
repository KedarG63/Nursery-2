import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Grass as SeedsIcon,
  LocalFlorist as SaplingsIcon,
  Inventory as CombinedIcon,
  Warning as WarningIcon,
  QrCode as QrCodeIcon,
  ViewList as ViewListIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import inventoryService from '../../services/inventoryService';
import SeedInventory from '../../components/Inventory/SeedInventory';
import SaplingInventory from '../../components/Inventory/SaplingInventory';
import CombinedInventoryView from '../../components/Inventory/CombinedInventoryView';

const InventoryDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getInventoryStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch inventory stats:', error);
      toast.error('Failed to load inventory statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount || 0);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Inventory Management
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ViewListIcon />}
          onClick={() => navigate('/inventory/lots')}
          color="primary"
        >
          View All Lots & QR Codes
        </Button>
      </Box>

      {/* Summary Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {/* Seeds Summary */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SeedsIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Seeds Inventory</Typography>
                </Box>
                <Typography variant="h4" color="primary">
                  {formatNumber(stats.seeds?.totalSeedsRemaining)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Seeds Available
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    {stats.seeds?.totalPurchases} Purchases
                  </Typography>
                  <Typography variant="body2">
                    Investment: {formatCurrency(stats.seeds?.totalInvestment)}
                  </Typography>
                  {stats.seeds?.expiringSoonCount > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <WarningIcon color="warning" fontSize="small" sx={{ mr: 0.5 }} />
                      <Typography variant="body2" color="warning.main">
                        {stats.seeds?.expiringSoonCount} expiring soon
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Saplings Summary */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SaplingsIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="h6">Saplings Inventory</Typography>
                </Box>
                <Typography variant="h4" color="success.main">
                  {formatNumber(stats.saplings?.totalAvailable)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Saplings Available
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    {stats.saplings?.totalLots} Total Lots
                  </Typography>
                  <Typography variant="body2">
                    {stats.saplings?.readyAvailableCount} Ready for Sale
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatNumber(stats.saplings?.totalAllocated)} Allocated to Orders
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Combined Summary */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CombinedIcon color="info" sx={{ mr: 1 }} />
                  <Typography variant="h6">Total Stock</Typography>
                </Box>
                <Typography variant="h4" color="info.main">
                  {formatNumber(
                    (stats.seeds?.totalSeedsRemaining || 0) +
                    (stats.saplings?.totalAvailable || 0)
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Seeds + Ready Saplings
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    Products: {stats.overview?.totalProducts}
                  </Typography>
                  <Typography variant="body2">
                    SKUs: {stats.overview?.totalSkus}
                  </Typography>
                  {stats.overview?.lowStockSkus > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <WarningIcon color="error" fontSize="small" sx={{ mr: 0.5 }} />
                      <Typography variant="body2" color="error.main">
                        {stats.overview?.lowStockSkus} SKUs low stock
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab
            icon={<SeedsIcon />}
            iconPosition="start"
            label="Seeds"
          />
          <Tab
            icon={<SaplingsIcon />}
            iconPosition="start"
            label="Saplings"
          />
          <Tab
            icon={<CombinedIcon />}
            iconPosition="start"
            label="Combined View"
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box>
        {activeTab === 0 && <SeedInventory />}
        {activeTab === 1 && <SaplingInventory />}
        {activeTab === 2 && <CombinedInventoryView />}
      </Box>
    </Box>
  );
};

export default InventoryDashboard;
