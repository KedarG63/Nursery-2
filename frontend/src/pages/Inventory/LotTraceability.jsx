import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  LocalShipping as VendorIcon,
  ShoppingCart as PurchaseIcon,
  LocalFlorist as LotIcon,
  ShoppingBag as OrderIcon,
  Person as CustomerIcon,
  Timeline as TimelineIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import lotService from '../../services/lotService';

const LotTraceability = () => {
  const { lotId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lineage, setLineage] = useState(null);

  useEffect(() => {
    if (lotId) {
      fetchLineage();
    }
  }, [lotId]);

  const fetchLineage = async () => {
    setLoading(true);
    try {
      const response = await lotService.getLotById(lotId);
      // For now, use basic lot data. Backend can be enhanced later with full lineage
      setLineage(response.data || response.lot);
    } catch (error) {
      console.error('Failed to fetch lot lineage:', error);
      toast.error('Failed to load lot traceability information');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!lineage) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Lot not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/inventory/lots')} sx={{ mr: 2 }}>
          Back to Lots
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <TimelineIcon sx={{ fontSize: 32, mr: 2, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4">Lot Traceability</Typography>
            <Typography variant="body2" color="text.secondary">
              Complete seed-to-plant journey for {lineage.lot_number}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Traceability Timeline */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stepper orientation="vertical" activeStep={-1}>
          {/* Step 1: Vendor & Seed Purchase */}
          <Step expanded>
            <StepLabel
              icon={<VendorIcon />}
              StepIconProps={{ sx: { fontSize: 32 } }}
            >
              <Typography variant="h6">Seed Purchase</Typography>
            </StepLabel>
            <StepContent>
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    {lineage.seed_vendor_name && (
                      <>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">
                            Vendor
                          </Typography>
                          <Typography variant="body1" fontWeight="bold">
                            {lineage.seed_vendor_name}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">
                            Seed Lot Number
                          </Typography>
                          <Typography variant="body1" fontWeight="bold">
                            {lineage.seed_lot_number}
                          </Typography>
                        </Grid>
                      </>
                    )}
                    {lineage.seed_expiry_date && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">
                          Seed Expiry Date
                        </Typography>
                        <Typography variant="body1">
                          {formatDate(lineage.seed_expiry_date)}
                        </Typography>
                      </Grid>
                    )}
                    {lineage.seed_cost_per_unit && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">
                          Cost per Seed
                        </Typography>
                        <Typography variant="body1">
                          {formatCurrency(lineage.seed_cost_per_unit)}
                        </Typography>
                      </Grid>
                    )}
                    {!lineage.seed_vendor_name && (
                      <Grid item xs={12}>
                        <Alert severity="info">
                          Seed purchase information not available for this lot
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            </StepContent>
          </Step>

          {/* Step 2: Lot Creation & Growth */}
          <Step expanded>
            <StepLabel
              icon={<LotIcon />}
              StepIconProps={{ sx: { fontSize: 32 } }}
            >
              <Typography variant="h6">Lot Creation & Growth</Typography>
            </StepLabel>
            <StepContent>
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Lot Number
                      </Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {lineage.lot_number}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Product
                      </Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {lineage.product?.name || '-'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Variety
                      </Typography>
                      <Typography variant="body1">
                        {lineage.sku?.variety || lineage.sku?.sku_code || '-'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Growth Stage
                      </Typography>
                      <Chip
                        label={
                          lineage.growth_stage
                            ? lineage.growth_stage.charAt(0).toUpperCase() +
                              lineage.growth_stage.slice(1)
                            : '-'
                        }
                        color={
                          lineage.growth_stage === 'ready'
                            ? 'success'
                            : lineage.growth_stage === 'sold'
                            ? 'default'
                            : 'primary'
                        }
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Planted Date
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(lineage.planted_date)}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Expected Ready Date
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(lineage.expected_ready_date)}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Quantity
                      </Typography>
                      <Typography variant="body1">
                        {lineage.quantity} plants
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Available
                      </Typography>
                      <Typography variant="body1" color="success.main" fontWeight="bold">
                        {lineage.available_quantity} plants
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary">
                        Location
                      </Typography>
                      <Typography variant="body1">
                        {lineage.current_location
                          ? lineage.current_location.charAt(0).toUpperCase() +
                            lineage.current_location.slice(1)
                          : '-'}
                      </Typography>
                    </Grid>
                    {lineage.notes && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          Notes
                        </Typography>
                        <Typography variant="body1">{lineage.notes}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            </StepContent>
          </Step>

          {/* Step 3: Orders (if allocated) */}
          {lineage.allocated_quantity > 0 && (
            <Step expanded>
              <StepLabel
                icon={<OrderIcon />}
                StepIconProps={{ sx: { fontSize: 32 } }}
              >
                <Typography variant="h6">Order Allocation</Typography>
              </StepLabel>
              <StepContent>
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          Allocated to Orders
                        </Typography>
                        <Typography variant="h4" color="primary.main">
                          {lineage.allocated_quantity} plants
                        </Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Alert severity="info">
                          This lot has plants allocated to customer orders. View order details in the
                          Orders section.
                        </Alert>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </StepContent>
            </Step>
          )}
        </Stepper>
      </Paper>

      {/* Movement History */}
      {lineage.movements && lineage.movements.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Movement History
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>User</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lineage.movements.map((movement, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatDate(movement.moved_at)}</TableCell>
                    <TableCell>
                      {movement.from_location
                        ? movement.from_location.charAt(0).toUpperCase() +
                          movement.from_location.slice(1)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {movement.to_location
                        ? movement.to_location.charAt(0).toUpperCase() +
                          movement.to_location.slice(1)
                        : '-'}
                    </TableCell>
                    <TableCell>{movement.reason || '-'}</TableCell>
                    <TableCell>{movement.user?.name || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default LotTraceability;
