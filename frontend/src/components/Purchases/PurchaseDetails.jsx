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
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import purchaseService from '../../services/purchaseService';
import lotService from '../../services/lotService';
import vendorReturnService from '../../services/vendorReturnService';
import vendorBillService from '../../services/vendorBillService';
import VendorReturnForm from './VendorReturnForm';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const PurchaseDetails = ({ open, onClose, purchase }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrManager = user?.roles?.some(r => ['Admin', 'Manager'].includes(r));

  const [usageHistory, setUsageHistory] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [returnNotes, setReturnNotes] = useState([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // vrnId being actioned

  // Apply Credit dialog state
  const [creditDialog, setCreditDialog] = useState(null); // vrn row or null
  const [vendorPurchases, setVendorPurchases] = useState([]);
  const [targetPurchaseId, setTargetPurchaseId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState(false);
  const [creditSearch, setCreditSearch] = useState('');

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

  const handleSubmit = async (vrn) => {
    setActionLoading(vrn.id);
    try {
      await vendorReturnService.submitReturn(vrn.id);
      toast.success('Return note submitted to vendor');
      fetchReturnNotes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit return note');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (vrn) => {
    setActionLoading(vrn.id);
    try {
      await vendorReturnService.acceptReturn(vrn.id);
      toast.success('Return accepted — seed inventory updated');
      fetchReturnNotes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept return');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (vrn) => {
    setActionLoading(vrn.id);
    try {
      await vendorReturnService.rejectReturn(vrn.id, '');
      toast.info('Return note rejected');
      fetchReturnNotes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject return');
    } finally {
      setActionLoading(null);
    }
  };

  const openCreditDialog = async (vrn) => {
    if (!vrn.vendor_id) {
      toast.error('Return note has no vendor linked — cannot load bills');
      return;
    }
    setCreditDialog(vrn);
    const available = parseFloat(vrn.return_amount) - parseFloat(vrn.credited_amount || 0);
    setCreditAmount(available.toFixed(2));
    setTargetPurchaseId('');
    setCreditSearch('');
    setLoadingPurchases(true);
    try {
      // Use vendor-bills endpoint (same as Vendor Bills page) — fetch all with high limit
      const response = await vendorBillService.getVendorBills({
        vendor_id: vrn.vendor_id,
        page: 1,
        limit: 500,
      });
      const bills = response.data || [];
      // Only show bills with an outstanding balance (pending or partial payment)
      const outstanding = bills.filter(
        b => b.payment_status !== 'paid' && parseFloat(b.balance_due) > 0
      );
      setVendorPurchases(outstanding);
    } catch (err) {
      toast.error('Failed to load vendor bills');
      setVendorPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  };

  const handleApplyCredit = async () => {
    if (!targetPurchaseId || !creditAmount) return;
    setApplyingCredit(true);
    try {
      await vendorReturnService.applyCredit(creditDialog.id, targetPurchaseId, parseFloat(creditAmount));
      toast.success(`Credit of ₹${creditAmount} applied`);
      setCreditDialog(null);
      fetchReturnNotes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply credit');
    } finally {
      setApplyingCredit(false);
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
              Variety
            </Typography>
            <Typography variant="body1">{purchase.variety || '-'}</Typography>
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
                {returnNotes.map((vrn, index) => {
                  const availableCredit = parseFloat(vrn.return_amount) - parseFloat(vrn.credited_amount || 0);
                  const isActioning = actionLoading === vrn.id;
                  return (
                    <Card
                      key={vrn.id}
                      variant="outlined"
                      sx={{ mb: index < returnNotes.length - 1 ? 1.5 : 0 }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        {/* Info row */}
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
                          {vrn.status === 'credited' && vrn.credited_amount && (
                            <Grid item xs={12}>
                              <Typography variant="caption" color="success.main">
                                ₹{parseFloat(vrn.credited_amount).toFixed(2)} credited to a future purchase
                              </Typography>
                            </Grid>
                          )}
                          {vrn.status === 'accepted' && availableCredit > 0 && (
                            <Grid item xs={12}>
                              <Typography variant="caption" color="warning.main">
                                ₹{availableCredit.toFixed(2)} credit pending — not yet applied to any bill
                              </Typography>
                            </Grid>
                          )}
                        </Grid>

                        {/* Action buttons */}
                        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {vrn.status === 'draft' && (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isActioning}
                              onClick={() => handleSubmit(vrn)}
                              startIcon={isActioning ? <CircularProgress size={14} /> : null}
                            >
                              Submit to Vendor
                            </Button>
                          )}
                          {vrn.status === 'submitted' && isAdminOrManager && (
                            <>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                disabled={isActioning}
                                onClick={() => handleAccept(vrn)}
                                startIcon={isActioning ? <CircularProgress size={14} /> : null}
                              >
                                Accept Return
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={isActioning}
                                onClick={() => handleReject(vrn)}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {vrn.status === 'accepted' && availableCredit > 0 && isAdminOrManager && (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => openCreditDialog(vrn)}
                            >
                              Apply Credit to a Bill — ₹{availableCredit.toFixed(2)}
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
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

      {/* Apply Credit Dialog */}
      {creditDialog && (
        <Dialog open onClose={() => setCreditDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Apply Credit to a Future Bill</DialogTitle>
          <DialogContent dividers>
            <Alert severity="info" sx={{ mb: 2 }}>
              Return <strong>{creditDialog.return_number}</strong> — credit available:{' '}
              <strong>{formatCurrency(parseFloat(creditDialog.return_amount) - parseFloat(creditDialog.credited_amount || 0))}</strong>
            </Alert>

            {loadingPurchases ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : vendorPurchases.length === 0 ? (
              <Alert severity="warning">
                No unpaid bills found for this vendor. Credit can only be applied to bills with an outstanding balance.
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search bills (purchase #, invoice #, product)"
                  placeholder="Type to filter..."
                  value={creditSearch}
                  onChange={(e) => {
                    setCreditSearch(e.target.value);
                    // Clear selection if it's no longer in filtered list
                    if (targetPurchaseId) {
                      const term = e.target.value.toLowerCase();
                      const still = vendorPurchases.find(b => b.id === targetPurchaseId && (
                        (b.purchase_number || '').toLowerCase().includes(term) ||
                        (b.invoice_number || '').toLowerCase().includes(term) ||
                        (b.product_name || '').toLowerCase().includes(term)
                      ));
                      if (!still) setTargetPurchaseId('');
                    }
                  }}
                />
                {(() => {
                  const term = creditSearch.toLowerCase();
                  const filtered = vendorPurchases.filter(b =>
                    !term ||
                    (b.purchase_number || '').toLowerCase().includes(term) ||
                    (b.invoice_number || '').toLowerCase().includes(term) ||
                    (b.product_name || '').toLowerCase().includes(term)
                  );
                  return (
                    <TextField
                      select
                      fullWidth
                      label={`Select bill to apply credit to${filtered.length < vendorPurchases.length ? ` (${filtered.length} of ${vendorPurchases.length} shown)` : ''}`}
                      value={targetPurchaseId}
                      onChange={(e) => {
                        setTargetPurchaseId(e.target.value);
                        const bill = vendorPurchases.find(b => b.id === e.target.value);
                        if (bill) {
                          const maxCredit = parseFloat(creditDialog.return_amount) - parseFloat(creditDialog.credited_amount || 0);
                          const outstanding = parseFloat(bill.balance_due);
                          setCreditAmount(Math.min(maxCredit, outstanding).toFixed(2));
                        }
                      }}
                      SelectProps={{ MenuProps: { PaperProps: { style: { maxHeight: 320 } } } }}
                    >
                      {filtered.length === 0 ? (
                        <MenuItem disabled value="">No bills match your search</MenuItem>
                      ) : filtered.map((b) => {
                        const isOriginatingBill = b.id === creditDialog?.seed_purchase_id;
                        return (
                          <MenuItem key={b.id} value={b.id}>
                            <Box sx={{ width: '100%' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {b.purchase_number}
                                  {b.invoice_number ? ` · Inv ${b.invoice_number}` : ''}
                                  {isOriginatingBill ? ' ★' : ''}
                                </Typography>
                                <Chip
                                  label={`₹${parseFloat(b.balance_due).toLocaleString('en-IN', { maximumFractionDigits: 2 })} due`}
                                  size="small"
                                  color={b.payment_status === 'partial' ? 'warning' : 'error'}
                                  sx={{ ml: 1 }}
                                />
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {b.product_name} · Bill: {formatCurrency(b.grand_total)}
                                {b.due_date ? ` · Due: ${formatDate(b.due_date)}` : ''}
                              </Typography>
                            </Box>
                          </MenuItem>
                        );
                      })}
                    </TextField>
                  );
                })()}

                <TextField
                  fullWidth
                  label="Amount to apply (₹)"
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  inputProps={{ min: 0.01, step: 0.01 }}
                  helperText={
                    targetPurchaseId
                      ? `Max: ₹${Math.min(
                          parseFloat(creditDialog?.return_amount) - parseFloat(creditDialog?.credited_amount || 0),
                          parseFloat(vendorPurchases.find(b => b.id === targetPurchaseId)?.balance_due || 0)
                        ).toFixed(2)} (lesser of available credit or outstanding balance)`
                      : 'Select a bill first'
                  }
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreditDialog(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="success"
              disabled={!targetPurchaseId || !creditAmount || applyingCredit}
              onClick={handleApplyCredit}
              startIcon={applyingCredit ? <CircularProgress size={16} /> : null}
            >
              Apply Credit
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Dialog>
  );
};

export default PurchaseDetails;
