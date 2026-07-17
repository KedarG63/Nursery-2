/**
 * MaterialPurchaseDetails — view a Supplies purchase, its payment tranches,
 * and record new payments. Each payment posts a debit to the chosen
 * cash/bank ledger (handled server-side); removing one reverses that debit.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, Typography,
  Box, Chip, Divider, Table, TableHead, TableRow, TableCell, TableBody, IconButton,
  TextField, MenuItem, InputAdornment, CircularProgress, Paper, Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { toast } from 'react-toastify';
import materialPurchaseService from '../../services/materialPurchaseService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

const statusColor = (s) => ({ pending: 'warning', partial: 'info', paid: 'success' }[s] || 'default');

const MaterialPurchaseDetails = ({ open, purchaseId, onClose, onChanged, canWrite = true }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [saving, setSaving] = useState(false);

  const [pay, setPay] = useState({
    payment_date: todayStr(), amount: '', payment_source: 'cash',
    cash_account_id: '', bank_account_id: '', reference_number: '', notes: '',
  });

  const load = useCallback(async () => {
    if (!purchaseId) return;
    setLoading(true);
    try {
      const res = await materialPurchaseService.getById(purchaseId);
      setData(res.data);
      const balance = Number(res.data.grand_total) - Number(res.data.amount_paid);
      setPay((p) => ({ ...p, amount: balance > 0 ? String(balance.toFixed(2)) : '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load purchase');
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  const loadAccounts = useCallback(async () => {
    try {
      const [cash, bank] = await Promise.all([getCashAccounts(), getBankAccounts()]);
      const cashList = cash.data || [];
      const bankList = bank.data || [];
      setCashAccounts(cashList);
      setBankAccounts(bankList);
      setPay((p) => ({
        ...p,
        cash_account_id: p.cash_account_id || cashList[0]?.id || '',
        bank_account_id: p.bank_account_id || bankList[0]?.id || '',
      }));
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (open) { load(); loadAccounts(); }
  }, [open, load, loadAccounts]);

  const setP = (k) => (e) => setPay((p) => ({ ...p, [k]: e.target.value }));

  const balanceDue = data ? Number(data.grand_total) - Number(data.amount_paid) : 0;

  const handleAddPayment = async () => {
    if (!pay.amount || Number(pay.amount) <= 0) return toast.error('Enter a valid payment amount');
    if (pay.payment_source === 'cash' && !pay.cash_account_id) return toast.error('Select a cash account');
    if (pay.payment_source === 'bank' && !pay.bank_account_id) return toast.error('Select a bank account');

    const payload = {
      payment_date: pay.payment_date,
      amount: Number(pay.amount),
      payment_source: pay.payment_source,
      bank_account_id: pay.payment_source === 'bank' ? pay.bank_account_id : null,
      cash_account_id: pay.payment_source === 'cash' ? pay.cash_account_id : null,
      reference_number: pay.reference_number || null,
      notes: pay.notes || null,
    };

    setSaving(true);
    try {
      await materialPurchaseService.addPayment(purchaseId, payload);
      toast.success('Payment recorded');
      setPay((p) => ({ ...p, reference_number: '', notes: '' }));
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Remove this payment? Its cash/bank ledger debit will be reversed.')) return;
    try {
      await materialPurchaseService.deletePayment(purchaseId, paymentId);
      toast.success('Payment removed');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove payment');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Supplies Purchase {data?.purchase_number ? `— ${data.purchase_number}` : ''}
      </DialogTitle>
      <DialogContent dividers>
        {loading || !data ? (
          <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
        ) : (
          <>
            {/* Header */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Vendor</Typography>
                <Typography variant="body1" fontWeight={600}>{data.vendor_name}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Material</Typography>
                <Typography variant="body2">{data.category_name || '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Purchase Date</Typography>
                <Typography variant="body2">{fmtDate(data.purchase_date)}</Typography>
              </Grid>
              {data.item_description && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Item</Typography>
                  <Typography variant="body2">
                    {data.item_description}
                    {data.quantity ? ` — ${data.quantity}${data.unit ? ` ${data.unit}` : ''}${data.rate ? ` @ ${fmtINR(data.rate)}` : ''}` : ''}
                  </Typography>
                </Grid>
              )}
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Invoice</Typography>
                <Typography variant="body2">{data.invoice_number || '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Due Date</Typography>
                <Typography variant="body2">{fmtDate(data.due_date)}</Typography>
              </Grid>
            </Grid>

            {/* Totals */}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Grand Total</Typography>
                  <Typography variant="h6" fontWeight={700}>{fmtINR(data.grand_total)}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Paid</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">{fmtINR(data.amount_paid)}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                  <Typography variant="h6" fontWeight={700} color={balanceDue > 0 ? 'error.main' : 'text.primary'}>
                    {fmtINR(balanceDue)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Box sx={{ mt: 1 }}>
              <Chip size="small" label={data.payment_status} color={statusColor(data.payment_status)} sx={{ textTransform: 'capitalize' }} />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Payment history */}
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Payments</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Paid From</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  {canWrite && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.payments.length === 0 && (
                  <TableRow><TableCell colSpan={canWrite ? 5 : 4} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                    No payments yet
                  </TableCell></TableRow>
                )}
                {data.payments.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>{fmtDate(p.payment_date)}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined"
                        color={p.payment_source === 'cash' ? 'warning' : 'info'}
                        label={p.payment_source === 'cash' ? (p.cash_account_name || 'Cash') : (p.bank_account_name || 'Bank')} />
                    </TableCell>
                    <TableCell>{p.reference_number || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtINR(p.amount)}</TableCell>
                    {canWrite && (
                      <TableCell align="right">
                        <Tooltip title="Remove payment (reverses ledger debit)">
                          <IconButton size="small" color="error" onClick={() => handleDeletePayment(p.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Record a payment */}
            {canWrite && balanceDue > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>Record a Payment</Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={6} sm={3}>
                    <TextField label="Date" type="date" fullWidth size="small"
                      InputLabelProps={{ shrink: true }} value={pay.payment_date} onChange={setP('payment_date')} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField label="Amount" type="number" fullWidth size="small"
                      value={pay.amount} onChange={setP('amount')}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField select label="Paid From" fullWidth size="small"
                      value={pay.payment_source} onChange={setP('payment_source')}>
                      <MenuItem value="cash">Cash in Hand</MenuItem>
                      <MenuItem value="bank">Bank</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    {pay.payment_source === 'cash' ? (
                      <TextField select label="Cash Account" fullWidth size="small"
                        value={pay.cash_account_id} onChange={setP('cash_account_id')}>
                        {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                      </TextField>
                    ) : (
                      <TextField select label="Bank Account" fullWidth size="small"
                        value={pay.bank_account_id} onChange={setP('bank_account_id')}>
                        {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                      </TextField>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <TextField label="Reference No. (UTR/cheque)" fullWidth size="small"
                      value={pay.reference_number} onChange={setP('reference_number')} />
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <TextField label="Notes" fullWidth size="small"
                      value={pay.notes} onChange={setP('notes')} />
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Button fullWidth variant="contained" startIcon={<AddIcon />} disabled={saving} onClick={handleAddPayment}>
                      {saving ? <CircularProgress size={20} /> : 'Add'}
                    </Button>
                  </Grid>
                </Grid>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MaterialPurchaseDetails;
