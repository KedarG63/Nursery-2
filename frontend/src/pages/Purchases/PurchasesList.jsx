import React, { useState, useEffect, useMemo } from 'react';
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
  IconButton,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Visibility as ViewIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useDebounce } from 'use-debounce';
import { useNavigate } from 'react-router-dom';
import purchaseService from '../../services/purchaseService';
import PurchaseForm from '../../components/Purchases/PurchaseForm';
import PurchaseDetails from '../../components/Purchases/PurchaseDetails';
import { canEdit } from '../../utils/roleCheck';

// ── Group purchases that were created together ────────────────────────────────
// Grouping key: invoice_number+vendor_id if invoice exists, else vendor_id+purchase_date
const groupPurchases = (purchases) => {
  const groups = new Map();

  purchases.forEach((p) => {
    const dateStr = p.purchase_date ? String(p.purchase_date).split('T')[0] : '';
    const key = p.invoice_number
      ? `inv:${p.invoice_number}::${p.vendor_id}`
      : `date:${dateStr}::${p.vendor_id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        vendor_name: p.vendor_name || '—',
        purchase_date: dateStr,
        invoice_number: p.invoice_number || null,
        items: [],
        grandTotal: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(p);
    group.grandTotal += parseFloat(p.grand_total || 0);
  });

  // Sort groups: most recent first
  return Array.from(groups.values()).sort((a, b) =>
    new Date(b.purchase_date) - new Date(a.purchase_date)
  );
};

const PurchasesList = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;
  const navigate = useNavigate();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 500);
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [purchaseDetails, setPurchaseDetails] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const inventoryStatuses = purchaseService.getInventoryStatuses();
  const paymentStatuses = purchaseService.getPaymentStatuses();

  useEffect(() => {
    fetchPurchases();
  }, [debouncedSearch, inventoryStatusFilter, paymentStatusFilter, page]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 100 }; // fetch more so grouping works well
      if (debouncedSearch) params.search = debouncedSearch;
      if (inventoryStatusFilter) params.inventory_status = inventoryStatusFilter;
      if (paymentStatusFilter) params.payment_status = paymentStatusFilter;

      const response = await purchaseService.getAllPurchases(params);
      const data = response.data || response.purchases || [];
      setPurchases(data);
      setTotalPages(response.pagination?.totalPages || 1);

      // Auto-expand all groups on first load / after filter change
      const grouped = groupPurchases(data);
      setExpandedGroups(new Set(grouped.map((g) => g.key)));
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to load purchases';
      if (errorMsg.includes('does not exist') || errorMsg.includes('relation')) {
        toast.error('Database tables not found. Please run migrations: npm run migrate:up');
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => groupPurchases(purchases), [purchases]);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddPurchase = () => { setSelectedPurchase(null); setPurchaseFormOpen(true); };
  const handleEditPurchase = (purchase) => { setSelectedPurchase(purchase); setPurchaseFormOpen(true); };

  const handleViewPurchase = async (purchase) => {
    try {
      const details = await purchaseService.getPurchaseById(purchase.id);
      setPurchaseDetails(details.data || details);
      setDetailsDialogOpen(true);
    } catch {
      toast.error('Failed to load purchase details');
    }
  };

  const handleDeleteClick = (purchaseId) => { setPurchaseToDelete(purchaseId); setDeleteDialogOpen(true); };

  const handleDeleteConfirm = async () => {
    try {
      await purchaseService.deletePurchase(purchaseToDelete);
      toast.success('Purchase deleted successfully');
      setDeleteDialogOpen(false);
      setPurchaseToDelete(null);
      fetchPurchases();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete purchase');
    }
  };

  const handlePurchaseSaved = () => { fetchPurchases(); setPurchaseFormOpen(false); setSelectedPurchase(null); };
  const handleDetailsClose = () => { setDetailsDialogOpen(false); setPurchaseDetails(null); };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  // ── Cell styles ───────────────────────────────────────────────────────────
  const th = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#666',
    borderBottom: '2px solid #e0e0e0',
    whiteSpace: 'nowrap',
  };
  const td = { padding: '10px 12px', fontSize: '0.875rem', verticalAlign: 'middle' };
  const tdR = { ...td, textAlign: 'right' };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5" component="h1">Seed Purchases</Typography>
          {canEdit(userRole) && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddPurchase}>
              Add Purchase
            </Button>
          )}
        </Box>

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="Purchases" />
          <Tab label="Vendors" />
        </Tabs>

        {activeTab === 0 && (
          <>
            {/* Filters */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth placeholder="Search purchases..."
                  value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Inventory Status</InputLabel>
                  <Select value={inventoryStatusFilter} label="Inventory Status"
                    onChange={(e) => { setInventoryStatusFilter(e.target.value); setPage(1); }}>
                    <MenuItem value="">All Inventory Status</MenuItem>
                    {inventoryStatuses.map((s) => (
                      <MenuItem key={s} value={s}>{purchaseService.getInventoryStatusDisplay(s)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Payment Status</InputLabel>
                  <Select value={paymentStatusFilter} label="Payment Status"
                    onChange={(e) => { setPaymentStatusFilter(e.target.value); setPage(1); }}>
                    <MenuItem value="">All Payment Status</MenuItem>
                    {paymentStatuses.map((s) => (
                      <MenuItem key={s} value={s}>{purchaseService.getPaymentStatusDisplay(s)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Grouped Table */}
            {loading ? (
              <Typography>Loading...</Typography>
            ) : groups.length === 0 ? (
              <Typography>No purchases found</Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 32 }} />
                      <th style={th}>Product</th>
                      <th style={th}>Lot #</th>
                      <th style={{ ...th, textAlign: 'right' }}>Packets</th>
                      <th style={{ ...th, textAlign: 'right' }}>Seeds</th>
                      <th style={{ ...th, textAlign: 'right' }}>Remaining</th>
                      <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      <th style={th}>Inv. Status</th>
                      <th style={th}>Pay. Status</th>
                      {canEdit(userRole) && <th style={{ ...th, textAlign: 'center' }}>Actions</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {groups.map((group) => {
                      const isExpanded = expandedGroups.has(group.key);

                      return (
                        <React.Fragment key={group.key}>
                          {/* ── Group header row (same layout for 1 or many items) ── */}
                          <tr
                            onClick={() => toggleGroup(group.key)}
                            style={{
                              backgroundColor: '#f0f4ff',
                              cursor: 'pointer',
                              borderTop: '2px solid #c5cae9',
                              borderBottom: isExpanded ? 'none' : '2px solid #c5cae9',
                            }}
                          >
                            <td style={{ ...td, paddingLeft: 8 }}>
                              <IconButton size="small" tabIndex={-1}>
                                {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                            </td>

                            {/* Group info — always spans all data columns */}
                            <td colSpan={6} style={{ ...td, paddingLeft: 4 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                <ReceiptIcon fontSize="small" sx={{ color: '#3f51b5', flexShrink: 0 }} />
                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1a237e' }}>
                                  {group.vendor_name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {formatDate(group.purchase_date)}
                                </Typography>
                                {group.invoice_number ? (
                                  <Chip
                                    label={`Invoice: ${group.invoice_number}`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ borderColor: '#3f51b5', color: '#3f51b5', fontSize: '0.75rem' }}
                                  />
                                ) : (
                                  <Chip label="No Invoice" size="small" variant="outlined" sx={{ fontSize: '0.75rem', color: '#999' }} />
                                )}
                                <Chip
                                  label={`${group.items.length} product${group.items.length > 1 ? 's' : ''}`}
                                  size="small"
                                  sx={{ backgroundColor: '#e8eaf6', color: '#3f51b5', fontSize: '0.75rem' }}
                                />
                              </Box>
                            </td>

                            {/* Grand total */}
                            <td style={{ ...tdR, fontWeight: 700, color: '#1a237e' }}>
                              {formatCurrency(group.grandTotal)}
                            </td>

                            {/* Empty status + actions cells */}
                            <td style={td} />
                            <td style={td} />
                            {canEdit(userRole) && <td style={td} />}
                          </tr>

                          {/* ── Product sub-rows (same for 1 or many items) ── */}
                          {isExpanded && group.items.map((purchase, idx) => (
                            <tr
                              key={purchase.id}
                              style={{
                                backgroundColor: idx % 2 === 0 ? '#fafafa' : '#fff',
                                borderBottom: idx === group.items.length - 1 ? '2px solid #c5cae9' : '1px solid #eeeeee',
                              }}
                            >
                              <td style={{ ...td, paddingLeft: 8 }} />
                              <td style={{ ...td, paddingLeft: 32 }}>
                                <Typography variant="body2" fontWeight={500}>
                                  {purchase.product_name || '—'}
                                </Typography>
                                {purchase.sku_code && (
                                  <Typography variant="caption" color="text.secondary">
                                    {purchase.sku_code}
                                  </Typography>
                                )}
                              </td>
                              <td style={{ ...td, fontSize: '0.8rem', color: '#555' }}>
                                {purchase.seed_lot_number || '—'}
                              </td>
                              <td style={tdR}>{purchase.number_of_packets}</td>
                              <td style={tdR}>{purchase.total_seeds}</td>
                              <td style={tdR}>{purchase.seeds_remaining}</td>
                              <td style={tdR}>{formatCurrency(purchase.grand_total)}</td>
                              <td style={td}>
                                <Chip
                                  label={purchaseService.getInventoryStatusDisplay(purchase.inventory_status)}
                                  color={purchaseService.getInventoryStatusColor(purchase.inventory_status)}
                                  size="small"
                                />
                              </td>
                              <td style={td}>
                                <Chip
                                  label={purchaseService.getPaymentStatusDisplay(purchase.payment_status)}
                                  color={purchaseService.getPaymentStatusColor(purchase.payment_status)}
                                  size="small"
                                />
                              </td>
                              {canEdit(userRole) && (
                                <td style={{ ...td, textAlign: 'center' }}>
                                  <IconButton size="small" color="info" onClick={() => handleViewPurchase(purchase)}>
                                    <ViewIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton size="small" color="primary" onClick={() => handleEditPurchase(purchase)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton size="small" color="error" onClick={() => handleDeleteClick(purchase.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            )}

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
              </Box>
            )}
          </>
        )}

        {activeTab === 1 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" gutterBottom>Vendor Management</Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Click the button below to manage vendors
            </Typography>
            <Button variant="contained" color="primary" onClick={() => navigate('/purchases/vendors')}>
              Go to Vendors Page
            </Button>
          </Box>
        )}
      </Paper>

      <PurchaseForm
        open={purchaseFormOpen}
        onClose={() => { setPurchaseFormOpen(false); setSelectedPurchase(null); }}
        onSuccess={handlePurchaseSaved}
        purchase={selectedPurchase}
      />

      {purchaseDetails && (
        <PurchaseDetails
          open={detailsDialogOpen}
          onClose={handleDetailsClose}
          purchase={purchaseDetails}
          onRefresh={fetchPurchases}
        />
      )}

      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setPurchaseToDelete(null); }}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>Are you sure you want to delete this purchase?</DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setPurchaseToDelete(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PurchasesList;
