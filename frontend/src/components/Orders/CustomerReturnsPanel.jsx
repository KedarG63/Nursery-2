import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  AssignmentReturn as ReturnIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import customerReturnService from '../../services/customerReturnService';
import CustomerReturnForm from './CustomerReturnForm';
import ReturnSettlementDialog from './ReturnSettlementDialog';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

/**
 * CustomerReturnsPanel
 *
 * Returns recorded against one order, and the actions that move them along:
 *   draft    → Accept (restocks, values the return, offsets the unpaid balance)
 *            → Cancel (nothing has moved yet, so this is safe)
 *   accepted → Settle the owed-back remainder, if any
 *
 * Props:
 *   order      – the order row (needs id, order_number)
 *   onChanged  – () => void  called after anything that alters the order's money
 */
const CustomerReturnsPanel = ({ order, onChanged }) => {
  const { user } = useSelector((state) => state.auth);
  const canWrite = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [settling, setSettling] = useState(null); // note row or null

  const fetchReturns = useCallback(async () => {
    if (!order?.id) return;
    try {
      const res = await customerReturnService.listReturns({ order_id: order.id, limit: 50 });
      setReturns(res.data || []);
    } catch (err) {
      console.error('Failed to load returns:', err);
    } finally {
      setLoading(false);
    }
  }, [order?.id]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const handleAccept = async (note) => {
    setActionId(note.id);
    try {
      const result = await customerReturnService.acceptReturn(note.id);
      // The server's message spells out the split, which is the part staff
      // need to read — it says what was offset and what is owed back.
      toast.success(result.message || 'Return accepted');
      await fetchReturns();
      onChanged?.();

      // If anything is owed back, go straight to the decision rather than
      // leaving it to be noticed later.
      if (parseFloat(result.data?.owed_back || 0) > 0) {
        const fresh = await customerReturnService.getReturn(note.id);
        setSettling(fresh.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept the return');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (note) => {
    setActionId(note.id);
    try {
      await customerReturnService.cancelReturn(note.id);
      toast.info('Return cancelled');
      fetchReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel the return');
    } finally {
      setActionId(null);
    }
  };

  const isCancelled = order?.status === 'cancelled';

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReturnIcon color="action" />
          <Typography variant="h6">Returns</Typography>
        </Box>
        {canWrite && (
          <Tooltip title={isCancelled ? 'A cancelled order cannot have a return' : ''}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                disabled={isCancelled}
                onClick={() => setShowForm(true)}
              >
                Record Return
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : returns.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No plants have been returned on this order.
        </Typography>
      ) : (
        returns.map((note, index) => {
          const owed = parseFloat(note.open_balance || 0);
          const offset = parseFloat(note.offset_total || 0);
          const refunded = parseFloat(note.refund_total || 0);
          const credited = parseFloat(note.store_credit_total || 0);
          const busy = actionId === note.id;

          return (
            <Card
              key={note.id}
              variant="outlined"
              sx={{ mb: index < returns.length - 1 ? 1.5 : 0 }}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary">Return #</Typography>
                    <Typography variant="body2" fontWeight="bold">{note.return_number}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Date</Typography>
                    <Typography variant="body2">{formatDate(note.return_date)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">
                      {note.status === 'accepted' ? 'Return Value' : 'Not yet valued'}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {note.status === 'accepted' ? formatCurrency(note.return_amount) : '—'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Chip
                      size="small"
                      label={customerReturnService.getStatusLabel(note.status)}
                      color={customerReturnService.getStatusColor(note.status)}
                    />
                  </Grid>

                  {note.reason && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Reason: {note.reason}
                      </Typography>
                    </Grid>
                  )}
                </Grid>

                {/* Where every rupee of the return value went. */}
                {note.status === 'accepted' && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {offset > 0 && (
                        <Typography variant="caption" color="success.main">
                          {formatCurrency(offset)} cancelled the unpaid balance
                        </Typography>
                      )}
                      {refunded > 0 && (
                        <Typography variant="caption" color="success.main">
                          {formatCurrency(refunded)} refunded
                        </Typography>
                      )}
                      {credited > 0 && (
                        <Typography variant="caption" color="info.main">
                          {formatCurrency(credited)} kept as store credit
                        </Typography>
                      )}
                      {owed > 0.005 && (
                        <Typography variant="caption" color="warning.main" fontWeight={600}>
                          {formatCurrency(owed)} still owed back to the customer
                        </Typography>
                      )}
                    </Box>
                  </>
                )}

                {canWrite && (
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {note.status === 'draft' && (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={busy}
                          onClick={() => handleAccept(note)}
                          startIcon={busy ? <CircularProgress size={14} /> : null}
                        >
                          Accept &amp; Restock
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={busy}
                          onClick={() => handleCancel(note)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {note.status === 'accepted' && owed > 0.005 && (
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        onClick={() => setSettling(note)}
                      >
                        Settle {formatCurrency(owed)}
                      </Button>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {returns.some((n) => n.status === 'accepted' && parseFloat(n.open_balance || 0) > 0.005) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Some money is still owed back to the customer. Until it is settled as a
          refund or store credit, it will keep showing here.
        </Alert>
      )}

      <CustomerReturnForm
        open={showForm}
        orderId={order?.id}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          toast.success('Return recorded as a draft — accept it to restock and settle');
          fetchReturns();
        }}
      />

      <ReturnSettlementDialog
        open={Boolean(settling)}
        returnNote={settling}
        onClose={() => setSettling(null)}
        onSettled={(result) => {
          toast.success(result?.message || 'Return settled');
          fetchReturns();
          onChanged?.();
        }}
      />
    </Paper>
  );
};

export default CustomerReturnsPanel;
