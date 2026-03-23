import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Chip,
  Divider,
  IconButton,
  Card,
  CardContent,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import purchaseService from '../../services/purchaseService';
import lotService from '../../services/lotService';
import vendorReturnService from '../../services/vendorReturnService';
import VendorReturnForm from './VendorReturnForm';
import { useNavigate } from 'react-router-dom';

const PurchaseDetails = ({ open, onClose, purchase }) => {
  const navigate = useNavigate();
  const [usageHistory, setUsageHistory] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [returnNotes, setReturnNotes] = useState([]);
  const [showReturnForm, setShowReturnForm] = useState(false);

  useEffect(() => {
    if (open && purchase) {
      fetchUsageHistory();
      fetchReturnNotes();
    }
  }, [open, purchase]);

  const fetchUsageHistory = async () => {
    if (!purchase?.id) return;

    setLoadingUsage(true);
    try {
      const response = await lotService.getLotsByPurchase(purchase.id);
      setUsageHistory(response.data || response.lots || []);
    } catch (error) {
      console.error('Failed to fetch usage history:', error);
      setUsageHistory([]);
    } finally {
      setLoadingUsage(false);
    }
  };

  const fetchReturnNotes = async () => {
    if (!purchase?.id) return;
    try {
      const response = await vendorReturnService.listReturns({ seed_purchase_id: purchase.id, limit: 50 });
      setReturnNotes(response.data || []);
    } catch (error) {
      console.error('Failed to fetch return notes:', error);
    }
  };

  if (!purchase) return null;

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

  const getDaysUntilExpiry = () => {
    if (!purchase.expiry_date) return null;
    const today = new Date();
    const expiryDate = new Date(purchase.expiry_date);
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUtilizationPercentage = () => {
    if (!purchase.total_seeds || purchase.total_seeds === 0) return 0;
    return ((purchase.seeds_used || 0) / purchase.total_seeds) * 100;
  };

  const daysUntilExpiry = getDaysUntilExpiry();
  const utilizationPercentage = getUtilizationPercentage();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Purchase Details
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Header Info */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{purchase.purchase_number}</Typography>
              <Box>
                <Chip
                  label={purchaseService.getInventoryStatusDisplay(purchase.inventory_status)}
                  color={purchaseService.getInventoryStatusColor(purchase.inventory_status)}
                  sx={{ mr: 1 }}
                />
                <Chip
                  label={purchaseService.getPaymentStatusDisplay(purchase.payment_status)}
                  color={purchaseService.getPaymentStatusColor(purchase.payment_status)}
                />
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Seed Availability Card */}
          <Grid item xs={12}>
            <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <InventoryIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Seed Availability</Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Available for Lot Creation
                    </Typography>
                    <Typography variant="h4" color="primary.main" gutterBottom>
                      {purchase.seeds_remaining || 0}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(utilizationPercentage, 100)}
                      sx={{ height: 8, borderRadius: 1, mb: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {purchase.seeds_used || 0} used of {purchase.total_seeds} total seeds (
                      {utilizationPercentage.toFixed(1)}% utilized)
                    </Typography>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    {daysUntilExpiry !== null && (
                      <Alert
                        severity={
                          daysUntilExpiry < 0
                            ? 'error'
                            : daysUntilExpiry < 30
                            ? 'warning'
                            : 'success'
                        }
                        icon={
                          daysUntilExpiry < 30 ? <WarningIcon /> : <CheckCircleIcon />
                        }
                      >
                        <Typography variant="body2">
                          {daysUntilExpiry < 0 ? (
                            <strong>Expired {Math.abs(daysUntilExpiry)} days ago</strong>
                          ) : daysUntilExpiry === 0 ? (
                            <strong>Expires today</strong>
                          ) : (
                            <>
                              Expires in <strong>{daysUntilExpiry} days</strong> (
                              {formatDate(purchase.expiry_date)})
                            </>
                          )}
                        </Typography>
                      </Alert>
                    )}

                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Button
                        variant="outlined"
                        fullWidth
                        onClick={() => {
                          onClose();
                          navigate('/inventory/lots');
                        }}
                        disabled={!purchase.seeds_remaining || purchase.seeds_remaining === 0}
                      >
                        Create Lot from These Seeds
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        fullWidth
                        onClick={() => setShowReturnForm(true)}
                        disabled={
                          (parseInt(purchase.number_of_packets) - parseInt(purchase.packets_returned || 0)) <= 0
                        }
                      >
                        Return Packets to Vendor
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Basic Information */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Basic Information
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Vendor
            </Typography>
            <Typography variant="body1">{purchase.vendor_name || '-'}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Product
            </Typography>
            <Typography variant="body1">{purchase.product_name || '-'}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              SKU
            </Typography>
            <Typography variant="body1">{purchase.sku_code || '-'}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Seed Lot Number
            </Typography>
            <Typography variant="body1">{purchase.seed_lot_number}</Typography>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Quantity Details */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Quantity Details
            </Typography>
          </Grid>

          <Grid item xs={4}>
            <Typography variant="body2" color="text.secondary">
              Number of Packets
            </Typography>
            <Typography variant="body1">{purchase.number_of_packets}</Typography>
          </Grid>

          <Grid item xs={4}>
            <Typography variant="body2" color="text.secondary">
              Seeds per Packet
            </Typography>
            <Typography variant="body1">{purchase.seeds_per_packet}</Typography>
          </Grid>

          <Grid item xs={4}>
            <Typography variant="body2" color="text.secondary">
              Total Seeds
            </Typography>
            <Typography variant="body1">{purchase.total_seeds}</Typography>
          </Grid>

          <Grid item xs={4}>
            <Typography variant="body2" color="text.secondary">
              Seeds Used
            </Typography>
            <Typography variant="body1">{purchase.seeds_used || 0}</Typography>
          </Grid>

          <Grid item xs={4}>
            <Typography variant="body2" color="text.secondary">
              Seeds Remaining
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              {purchase.seeds_remaining}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Pricing */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Pricing
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Cost per Packet
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.cost_per_packet)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Cost per Seed
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.cost_per_seed)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Total Cost
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.total_cost)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Shipping Cost
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.shipping_cost || 0)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Tax Amount
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.tax_amount || 0)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Other Charges
            </Typography>
            <Typography variant="body1">{formatCurrency(purchase.other_charges || 0)}</Typography>
          </Grid>

          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">
              Grand Total
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              {formatCurrency(purchase.grand_total)}
            </Typography>
          </Grid>

          {parseFloat(purchase.vendor_credit_applied) > 0 && (
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Vendor Credit Applied
              </Typography>
              <Typography variant="body1" color="success.main" fontWeight="bold">
                - {formatCurrency(purchase.vendor_credit_applied)}
              </Typography>
            </Grid>
          )}

          {parseFloat(purchase.vendor_credit_applied) > 0 && (
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Net Payable
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {formatCurrency(
                  parseFloat(purchase.grand_total) - parseFloat(purchase.vendor_credit_applied)
                )}
              </Typography>
            </Grid>
          )}

          {parseInt(purchase.packets_returned) > 0 && (
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Packets Returned
              </Typography>
              <Typography variant="body1">
                {purchase.packets_returned} of {purchase.number_of_packets} packets
              </Typography>
            </Grid>
          )}

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Quality & Dates */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Quality & Dates
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Germination Rate
            </Typography>
            <Typography variant="body1">
              {purchase.germination_rate ? `${purchase.germination_rate}%` : '-'}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Purity Percentage
            </Typography>
            <Typography variant="body1">
              {purchase.purity_percentage ? `${purchase.purity_percentage}%` : '-'}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Purchase Date
            </Typography>
            <Typography variant="body1">{formatDate(purchase.purchase_date)}</Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Expiry Date
            </Typography>
            <Typography variant="body1">{formatDate(purchase.expiry_date)}</Typography>
          </Grid>

          {/* Invoice Details */}
          {(purchase.invoice_number || purchase.invoice_date) && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Invoice Details
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Invoice Number
                </Typography>
                <Typography variant="body1">{purchase.invoice_number || '-'}</Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Invoice Date
                </Typography>
                <Typography variant="body1">{formatDate(purchase.invoice_date)}</Typography>
              </Grid>
            </>
          )}

          {/* Storage */}
          {(purchase.storage_location || purchase.storage_conditions) && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Storage Information
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Storage Location
                </Typography>
                <Typography variant="body1">{purchase.storage_location || '-'}</Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Storage Conditions
                </Typography>
                <Typography variant="body1">{purchase.storage_conditions || '-'}</Typography>
              </Grid>
            </>
          )}

          {/* Notes */}
          {(purchase.notes || purchase.quality_notes) && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Notes
                </Typography>
              </Grid>

              {purchase.notes && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    General Notes
                  </Typography>
                  <Typography variant="body1">{purchase.notes}</Typography>
                </Grid>
              )}

              {purchase.quality_notes && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Quality Notes
                  </Typography>
                  <Typography variant="body1">{purchase.quality_notes}</Typography>
                </Grid>
              )}
            </>
          )}

          {/* Vendor Return Notes */}
          {returnNotes.length > 0 && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Return Notes
                </Typography>
              </Grid>

              <Grid item xs={12}>
                {returnNotes.map((vrn, index) => (
                  <Card
                    key={vrn.id}
                    variant="outlined"
                    sx={{ mb: index < returnNotes.length - 1 ? 1 : 0 }}
                  >
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Grid container spacing={1} alignItems="center">
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" color="text.secondary">Return #</Typography>
                          <Typography variant="body2" fontWeight="bold">{vrn.return_number}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={2}>
                          <Typography variant="caption" color="text.secondary">Packets</Typography>
                          <Typography variant="body2">{vrn.packets_returned}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={2}>
                          <Typography variant="caption" color="text.secondary">Amount</Typography>
                          <Typography variant="body2">{formatCurrency(vrn.return_amount)}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={2}>
                          <Typography variant="caption" color="text.secondary">Date</Typography>
                          <Typography variant="body2">{formatDate(vrn.return_date)}</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Chip
                            label={vendorReturnService.getStatusLabel(vrn.status)}
                            color={vendorReturnService.getStatusColor(vrn.status)}
                            size="small"
                          />
                        </Grid>
                        {vrn.reason && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Reason: {vrn.reason}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </CardContent>
                  </Card>
                ))}
              </Grid>
            </>
          )}

          {/* Seed Usage History */}
          {usageHistory.length > 0 && (
            <>
              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Lots Created from This Purchase
                </Typography>
              </Grid>

              <Grid item xs={12}>
                {loadingUsage ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading usage history...
                  </Typography>
                ) : (
                  <Box>
                    {usageHistory.map((lot, index) => (
                      <Card
                        key={lot.id}
                        variant="outlined"
                        sx={{ mb: index < usageHistory.length - 1 ? 1 : 0 }}
                      >
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={3}>
                              <Typography variant="body2" color="text.secondary">
                                Lot Number
                              </Typography>
                              <Typography
                                variant="body2"
                                fontWeight="bold"
                                sx={{
                                  cursor: 'pointer',
                                  color: 'primary.main',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                                onClick={() => {
                                  onClose();
                                  navigate('/inventory/lots');
                                }}
                              >
                                {lot.lot_number}
                              </Typography>
                            </Grid>

                            <Grid item xs={12} sm={2}>
                              <Typography variant="body2" color="text.secondary">
                                Seeds Used
                              </Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {lot.seeds_used_count || lot.quantity || 0}
                              </Typography>
                            </Grid>

                            <Grid item xs={12} sm={2}>
                              <Typography variant="body2" color="text.secondary">
                                Growth Stage
                              </Typography>
                              <Chip
                                label={
                                  lot.growth_stage
                                    ? lot.growth_stage.charAt(0).toUpperCase() +
                                      lot.growth_stage.slice(1)
                                    : '-'
                                }
                                size="small"
                                color={
                                  lot.growth_stage === 'ready'
                                    ? 'success'
                                    : lot.growth_stage === 'sold'
                                    ? 'default'
                                    : 'primary'
                                }
                              />
                            </Grid>

                            <Grid item xs={12} sm={2}>
                              <Typography variant="body2" color="text.secondary">
                                Planted Date
                              </Typography>
                              <Typography variant="body2">
                                {formatDate(lot.planted_date)}
                              </Typography>
                            </Grid>

                            <Grid item xs={12} sm={3}>
                              <Typography variant="body2" color="text.secondary">
                                Expected Ready
                              </Typography>
                              <Typography variant="body2">
                                {formatDate(lot.expected_ready_date)}
                              </Typography>
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                )}
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Vendor Return Form (nested dialog) */}
      <VendorReturnForm
        open={showReturnForm}
        purchase={purchase}
        onClose={() => setShowReturnForm(false)}
        onCreated={() => {
          fetchReturnNotes();
          setShowReturnForm(false);
        }}
      />
    </Dialog>
  );
};

export default PurchaseDetails;
