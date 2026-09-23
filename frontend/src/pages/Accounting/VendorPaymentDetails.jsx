import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Paper, Grid, Button, Chip, Stack, Breadcrumbs, Link,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip, CircularProgress, Alert, Divider,
} from '@mui/material';
import {
  LinkOff as UnlinkIcon, Block as VoidIcon, PlaylistAdd as ApplyIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import ConfirmDialog from '../../components/Common/ConfirmDialog';
import BillAllocationTable, {
  autoAllocate, allocatedTotal, invalidAllocations, allocationPayload,
} from '../../components/Accounting/BillAllocationTable';
import {
  getVendorPayment, getOpenBills, addAllocations, removeAllocation, voidVendorPayment,
} from '../../services/vendorPaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const METHOD_LABELS = { bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash' };

const Stat = ({ label, value, color }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h6" color={color}>{value}</Typography>
  </Box>
);

/**
 * One vendor payment voucher: where the money went, which bills it settled,
 * and what is still held as advance. The advance can be applied to bills that
 * arrived later; an allocation can be taken back into advance; the whole
 * payment can be voided.
 */
const VendorPaymentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [bills, setBills] = useState([]);
  const [allocations, setAllocations] = useState({});

  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [voidOpen, setVoidOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getVendorPayment(id);
      setVoucher(r.data);
    } catch (e) {
      toast.error(e?.message || 'Vendor payment not found');
      navigate('/accounting/vendor-payments');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const advance = Number(voucher?.advance_amount || 0);

  const openApply = async () => {
    try {
      const r = await getOpenBills(voucher.vendor_id);
      const list = r.data?.bills || [];
      setBills(list);
      setAllocations(autoAllocate(list, advance));
      setApplyOpen(true);
    } catch (e) {
      toast.error(e?.message || 'Failed to load bills');
    }
  };

  const applying = allocatedTotal(allocations);
  const applyErrors = [];
  if (!(applying > 0)) applyErrors.push('Adjust at least one bill');
  if (applying > advance + 0.005) applyErrors.push(`Only ${formatCurrency(advance)} is available`);
  if (invalidAllocations(bills, allocations).length) applyErrors.push('A bill is adjusted for more than is due');

  const handleApply = async () => {
    if (applyErrors.length) { toast.error(applyErrors[0]); return; }
    setBusy(true);
    try {
      const r = await addAllocations(id, allocationPayload(bills, allocations));
      setVoucher(r.data);
      setApplyOpen(false);
      toast.success('Advance applied');
    } catch (e) {
      toast.error(e?.message || 'Failed to apply advance');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    try {
      await removeAllocation(id, unlinkTarget.bill_type, unlinkTarget.id);
      toast.success(`${unlinkTarget.purchase_number} removed; amount back in advance`);
      setUnlinkTarget(null);
      await load();
    } catch (e) {
      toast.error(e?.message || 'Failed to remove');
    } finally {
      setBusy(false);
    }
  };

  const handleVoid = async () => {
    setBusy(true);
    try {
      const r = await voidVendorPayment(id);
      toast.success(r.message || 'Payment voided');
      navigate('/accounting/vendor-payments');
    } catch (e) {
      toast.error(e?.message || 'Failed to void');
      setBusy(false);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" minHeight={300} alignItems="center"><CircularProgress /></Box>;
  }
  if (!voucher) return null;

  const account = voucher.payment_source === 'bank'
    ? `Bank · ${voucher.bank_account_name || '—'}`
    : `Cash · ${voucher.cash_account_name || '—'}`;

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/accounting/vendor-payments" underline="hover" color="inherit">Vendor Payments</Link>
        <Typography color="text.primary">{voucher.payment_number}</Typography>
      </Breadcrumbs>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{voucher.payment_number}</Typography>
          <Typography variant="body1">
            Paid to{' '}
            <Link component={RouterLink} to={`/purchases/vendors/${voucher.vendor_id}`}>{voucher.vendor_name}</Link>
            {' '}on {formatDate(voucher.payment_date, 'DD MMM YYYY')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {advance > 0.005 && (
            <Button variant="contained" startIcon={<ApplyIcon />} onClick={openApply} disabled={busy || applyOpen}>
              Apply advance to bills
            </Button>
          )}
          <Button color="error" variant="outlined" startIcon={<VoidIcon />} onClick={() => setVoidOpen(true)} disabled={busy}>
            Void
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Stack direction="row" spacing={4} divider={<Divider orientation="vertical" flexItem />}>
              <Stat label="Amount paid" value={formatCurrency(voucher.amount)} />
              <Stat label="Adjusted against bills" value={formatCurrency(voucher.allocated_amount)} color="success.main" />
              <Stat label="Advance with vendor" value={formatCurrency(advance)} color={advance > 0.005 ? 'warning.main' : undefined} />
            </Stack>
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={0.5}>
              <Typography variant="body2"><strong>Paid from:</strong> {account}</Typography>
              <Typography variant="body2">
                <strong>Method:</strong> {METHOD_LABELS[voucher.payment_method] || voucher.payment_method}
                {voucher.reference_number ? ` · ${voucher.reference_number}` : ''}
              </Typography>
              {voucher.notes && <Typography variant="body2"><strong>Notes:</strong> {voucher.notes}</Typography>}
              <Typography variant="caption" color="text.secondary">
                Recorded by {voucher.created_by_name || '—'} · appears once in the {voucher.payment_source === 'bank' ? 'bank ledger' : 'cash book'}
              </Typography>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {applyOpen && (
        <Paper sx={{ p: 2.5, mb: 2, border: 2, borderColor: 'primary.main' }}>
          <Typography variant="subtitle1" fontWeight={600}>Apply advance</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {formatCurrency(advance)} available. No new entry is made in the books — the money already left
            when this payment was recorded.
          </Typography>
          <BillAllocationTable bills={bills} allocations={allocations} onChange={setAllocations} disabled={busy} />
          <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="body2" color={applyErrors.length ? 'error.main' : 'text.secondary'}>
              {applyErrors.length ? applyErrors[0] : `Applying ${formatCurrency(applying)} · ${formatCurrency(advance - applying)} stays as advance`}
            </Typography>
            <Button onClick={() => setApplyOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={handleApply} disabled={busy || applyErrors.length > 0}>Apply</Button>
          </Stack>
        </Paper>
      )}

      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Bills settled by this payment ({voucher.allocations.length})
      </Typography>
      {voucher.allocations.length === 0 ? (
        <Alert severity="info">
          Not adjusted against any bill yet — the full amount is an advance with the vendor.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50' } }}>
                <TableCell>Bill</TableCell>
                <TableCell>Invoice #</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Bill Total</TableCell>
                <TableCell align="right">Adjusted</TableCell>
                <TableCell>Bill Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {voucher.allocations.map((a) => (
                <TableRow key={`${a.bill_type}:${a.id}`} hover>
                  <TableCell>
                    {a.bill_type === 'seed' ? (
                      <Link component={RouterLink} to={`/billing/vendor-bills/${a.bill_id}`}>{a.purchase_number}</Link>
                    ) : a.purchase_number}
                    <Typography variant="caption" color="text.secondary" display="block">{a.description || ''}</Typography>
                  </TableCell>
                  <TableCell>{a.invoice_number || '—'}</TableCell>
                  <TableCell>{formatDate(a.bill_date, 'DD MMM YYYY')}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={a.bill_type === 'seed' ? 'Seeds' : 'Supplies'}
                      color={a.bill_type === 'seed' ? 'success' : 'info'} />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(a.grand_total)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(a.amount)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={a.payment_status}
                      color={a.payment_status === 'paid' ? 'success' : a.payment_status === 'partial' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Take back into advance">
                      <span>
                        <IconButton size="small" onClick={() => setUnlinkTarget(a)} disabled={busy}>
                          <UnlinkIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ConfirmDialog
        open={!!unlinkTarget}
        title="Take this bill off the payment?"
        message={unlinkTarget
          ? `${formatCurrency(unlinkTarget.amount)} stops counting against ${unlinkTarget.purchase_number} and goes back into this payment's advance. The bill becomes unpaid by that amount. The cash book / bank ledger is not affected.`
          : ''}
        confirmText="Take back"
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkTarget(null)}
        loading={busy}
      />
      <ConfirmDialog
        open={voidOpen}
        title={`Void ${voucher.payment_number}?`}
        message={`Every bill it settled goes back to unpaid by the adjusted amount, and the ${formatCurrency(voucher.amount)} entry is removed from the ${voucher.payment_source === 'bank' ? 'bank ledger' : 'cash book'}. Use this only if the payment was entered by mistake.`}
        confirmText="Void payment"
        confirmColor="error"
        onConfirm={handleVoid}
        onCancel={() => setVoidOpen(false)}
        loading={busy}
      />
    </Box>
  );
};

export default VendorPaymentDetails;
