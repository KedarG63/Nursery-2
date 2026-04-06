import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Chip, IconButton, Tooltip, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Tabs, Tab, Pagination, CircularProgress, Alert,
} from '@mui/material';
import {
  RestoreFromTrash as RestoreIcon,
  DeleteForever as DeleteForeverIcon,
  DeleteSweep as TrashIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import trashService from '../../services/trashService';

// ── helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  lot: { label: 'Lot', color: 'primary' },
  order: { label: 'Order', color: 'success' },
  customer: { label: 'Customer', color: 'secondary' },
  purchase: { label: 'Purchase', color: 'warning' },
};

const TAB_TYPES = ['all', 'lots', 'orders', 'customers', 'purchases'];

const restoreServiceMap = {
  lot: (id) => trashService.restoreLot(id),
  order: (id) => trashService.restoreOrder(id),
  customer: (id) => trashService.restoreCustomer(id),
  purchase: (id) => trashService.restorePurchase(id),
};

// ── component ─────────────────────────────────────────────────────────────────

const TrashPage = () => {
  const { user } = useSelector((s) => s.auth);
  const isAdmin = user?.roles === 'Admin' || (Array.isArray(user?.roles) && user.roles.includes('Admin'));

  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Restore dialog
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Delete Forever dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const currentTypes = TAB_TYPES[tab] === 'all' ? 'lots,orders,customers,purchases' : TAB_TYPES[tab];

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trashService.listTrash({ types: currentTypes, page, limit: 20 });
      setItems(res.data || []);
      setTotalPages(res.pagination?.total_pages || 1);
    } catch {
      toast.error('Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [currentTypes, page]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  // ── restore ────────────────────────────────────────────────────────────────

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreServiceMap[restoreTarget.entity_type](restoreTarget.entity_id);
      toast.success(`${restoreTarget.entity_name} restored successfully`);
      setRestoreTarget(null);
      fetchTrash();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to restore');
    } finally {
      setRestoring(false);
    }
  };

  // ── permanent delete ───────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await trashService.permanentDelete(deleteTarget.entity_type, deleteTarget.entity_id);
      toast.success('Permanently deleted');
      setDeleteTarget(null);
      fetchTrash();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
        <TrashIcon color="error" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight="bold">Trash</Typography>
          <Typography variant="body2" color="text.secondary">
            Deleted items are kept for 30 days, then permanently removed.
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All" />
        <Tab label="Lots" />
        <Tab label="Orders" />
        <Tab label="Customers" />
        <Tab label="Purchases" />
      </Tabs>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Name / Number</strong></TableCell>
                <TableCell><strong>Deleted By</strong></TableCell>
                <TableCell><strong>Deleted On</strong></TableCell>
                <TableCell><strong>Expires</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <TrashIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography color="text.secondary">Trash is empty</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const typeInfo = TYPE_LABELS[item.entity_type] || { label: item.entity_type, color: 'default' };
                  const urgent = item.days_remaining <= 7;
                  return (
                    <TableRow key={`${item.entity_type}-${item.entity_id}`} hover>
                      <TableCell>
                        <Chip label={typeInfo.label} color={typeInfo.color} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {item.entity_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {item.deleted_by_name || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {dayjs(item.deleted_at).format('MMM D, YYYY')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            item.days_remaining === 0
                              ? 'Expires today'
                              : `${item.days_remaining}d left`
                          }
                          size="small"
                          color={urgent ? 'error' : 'default'}
                          variant={urgent ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Restore">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => setRestoreTarget(item)}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip title="Delete Forever">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(item)}
                              sx={{ ml: 0.5 }}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
          </Box>
        )}
      </Paper>

      {/* Restore Dialog */}
      <Dialog open={!!restoreTarget} onClose={() => !restoring && setRestoreTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Restore Item</DialogTitle>
        <DialogContent>
          <Typography>
            Restore <strong>{restoreTarget?.entity_name}</strong> back to its original place?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)} disabled={restoring}>Cancel</Button>
          <Button
            onClick={handleRestoreConfirm}
            variant="contained"
            color="success"
            disabled={restoring}
            startIcon={<RestoreIcon />}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Forever Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>Delete Forever</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This cannot be undone. All associated data will be permanently deleted.
          </Alert>
          <Typography>
            Permanently delete <strong>{deleteTarget?.entity_name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={<DeleteForeverIcon />}
          >
            {deleting ? 'Deleting…' : 'Delete Forever'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TrashPage;
