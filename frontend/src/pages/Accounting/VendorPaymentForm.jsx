import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Button, Autocomplete,
  Stack, Alert, Breadcrumbs, Link, CircularProgress, Divider,
} from '@mui/material';
import { AutoFixHigh as AutoIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import PaymentSourcePicker, {
  validatePaymentSource,
  paymentSourcePayload,
  emptyPaymentSource,
} from '../../components/Common/PaymentSourcePicker';
import BillAllocationTable, {
  autoAllocate, allocatedTotal, invalidAllocations, allocationPayload,
} from '../../components/Accounting/BillAllocationTable';
import {
  getPayableVendors, getOpenBills, createVendorPayment,
} from '../../services/vendorPaymentService';
import { formatCurrency } from '../../utils/formatters';

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer / NEFT / RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
];

/**
 * Pay Vendor — record ONE payment and adjust it against many bills.
 *
 * The amount is spread over the vendor's open bills oldest first as soon as
 * it is typed; the accountant can then tick, untick or change any line.
 * Whatever is not adjusted stays with the vendor as an advance, to be applied
 * to future bills from the payment's page.
 */
const VendorPaymentForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [vendors, setVendors] = useState([]);
  const [vendor, setVendor] = useState(null);
  const [bills, setBills] = useState([]);
  const [existingAdvance, setExistingAdvance] = useState(0);
  const [billsLoading, setBillsLoading] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState({ ...emptyPaymentSource, payment_source: 'bank' });
  const [allocations, setAllocations] = useState({});
  const [saving, setSaving] = useState(false);

  // Vendors, preselecting ?vendorId= when arriving from a vendor page.
  useEffect(() => {
    getPayableVendors()
      .then((r) => {
        const list = r.data || [];
        setVendors(list);
        const pre = searchParams.get('vendorId');
        if (pre) setVendor(list.find((v) => v.id === pre) || null);
      })
      .catch((e) => toast.error(e?.message || 'Failed to load vendors'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBills([]);
    setAllocations({});
    setExistingAdvance(0);
    if (!vendor) return;
    setBillsLoading(true);
    getOpenBills(vendor.id)
      .then((r) => {
        setBills(r.data?.bills || []);
        setExistingAdvance(Number(r.data?.advance || 0));
      })
      .catch((e) => toast.error(e?.message || 'Failed to load bills'))
      .finally(() => setBillsLoading(false));
  }, [vendor]);

  // Cash payments come from the cash drawer; everything else from a bank.
  useEffect(() => {
    setSource((s) => ({ ...s, payment_source: method === 'cash' ? 'cash' : 'bank' }));
  }, [method]);

  // The picker preselects the first bank and first cash account from two
  // separate async loads, each spreading the value it was first rendered with.
  // Merging keeps the second load from blanking the account the first set.
  const mergeSource = (next) => setSource((prev) => ({
    ...prev,
    ...next,
    bank_account_id: next.bank_account_id || prev.bank_account_id,
    cash_account_id: next.cash_account_id || prev.cash_account_id,
  }));

  const totalDue = useMemo(() => bills.reduce((s, b) => s + Number(b.balance), 0), [bills]);
  const paymentAmt = Number(amount) || 0;
  const allocated = allocatedTotal(allocations);
  const advance = Math.round((paymentAmt - allocated) * 100) / 100;
  const badRows = invalidAllocations(bills, allocations);

  const onAmountChange = (value) => {
    setAmount(value);
    setAllocations(autoAllocate(bills, Number(value) || 0));
  };

  const payFullOutstanding = () => onAmountChange(String(Math.round(totalDue * 100) / 100));

  const errors = [];
  if (!vendor) errors.push('Choose the vendor');
  if (!(paymentAmt > 0)) errors.push('Enter the amount paid');
  if (allocated > paymentAmt + 0.005) errors.push(`Adjusted ${formatCurrency(allocated)} is more than the payment`);
  if (badRows.length) errors.push(`${badRows.length} bill(s) adjusted for more than is due`);
  if (method !== 'cash' && !reference.trim()) errors.push('Enter the UTR / cheque / transaction number');
  const sourceError = validatePaymentSource(source);
  if (sourceError) errors.push(sourceError);

  const handleSave = async () => {
    if (errors.length) { toast.error(errors[0]); return; }
    setSaving(true);
    try {
      const res = await createVendorPayment({
        vendor_id: vendor.id,
        payment_date: paymentDate,
        amount: paymentAmt,
        payment_method: method,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null,
        ...paymentSourcePayload(source),
        allocations: allocationPayload(bills, allocations),
      });
      toast.success(`${res.data.payment_number} recorded`);
      navigate(`/accounting/vendor-payments/${res.data.id}`);
    } catch (e) {
      toast.error(e?.message || e?.errors?.[0] || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/accounting/vendor-payments" underline="hover" color="inherit">Vendor Payments</Link>
        <Typography color="text.primary">Pay Vendor</Typography>
      </Breadcrumbs>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Pay Vendor</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Record one payment and adjust it against as many of the vendor's bills as it covers.
      </Typography>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={vendors}
              value={vendor}
              onChange={(e, v) => { setVendor(v); setAmount(''); }}
              getOptionLabel={(v) => v.vendor_name || ''}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, v) => (
                <li {...props} key={v.id}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                    <span>{v.vendor_name}</span>
                    <Typography variant="body2" color={Number(v.outstanding) > 0 ? 'error.main' : 'text.secondary'}>
                      {Number(v.outstanding) > 0 ? `${formatCurrency(v.outstanding)} due` : 'Nothing due'}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Vendor" size="small" required />}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              label="Payment date" type="date" size="small" fullWidth required
              InputLabelProps={{ shrink: true }}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              label="Amount paid (₹)" type="number" size="small" fullWidth required
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
              helperText={vendor && totalDue > 0 ? (
                <Link component="button" type="button" onClick={payFullOutstanding}>
                  Pay full due {formatCurrency(totalDue)}
                </Link>
              ) : ' '}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField select label="Method" size="small" fullWidth value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              label={method === 'cheque' ? 'Cheque number' : 'UTR / Reference'}
              size="small" fullWidth required={method !== 'cash'}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Notes" size="small" fullWidth value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Grid>
          <Grid item xs={12} md={6}>
            <PaymentSourcePicker value={source} onChange={mergeSource} disabled={saving} />
          </Grid>
        </Grid>
      </Paper>

      {vendor && (
        <Paper sx={{ p: 2.5, mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>Adjust against bills</Typography>
              <Typography variant="body2" color="text.secondary">
                {bills.length} unpaid bill{bills.length !== 1 ? 's' : ''} · {formatCurrency(totalDue)} due
              </Typography>
            </Box>
            <Button
              size="small" variant="outlined" startIcon={<AutoIcon />}
              disabled={!(paymentAmt > 0) || bills.length === 0}
              onClick={() => setAllocations(autoAllocate(bills, paymentAmt))}
            >
              Auto-adjust oldest first
            </Button>
          </Stack>

          {existingAdvance > 0.005 && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              This vendor already has {formatCurrency(existingAdvance)} of earlier payments not yet adjusted
              against any bill. You can apply it from the Vendor Payments list instead of paying again.
            </Alert>
          )}

          {billsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={28} /></Box>
          ) : (
            <BillAllocationTable bills={bills} allocations={allocations} onChange={setAllocations} disabled={saving} />
          )}
        </Paper>
      )}

      <Paper sx={{ p: 2, position: 'sticky', bottom: 0, zIndex: 2, borderTop: 3, borderColor: 'primary.main' }} elevation={4}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem />}>
            <Box>
              <Typography variant="caption" color="text.secondary">Payment</Typography>
              <Typography variant="h6">{formatCurrency(paymentAmt)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Adjusted against bills</Typography>
              <Typography variant="h6" color={allocated > paymentAmt + 0.005 ? 'error.main' : 'success.main'}>
                {formatCurrency(allocated)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Kept as advance</Typography>
              <Typography variant="h6" color={advance < 0 ? 'error.main' : advance > 0 ? 'warning.main' : 'text.primary'}>
                {formatCurrency(Math.max(advance, 0))}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {errors.length > 0 && paymentAmt > 0 && (
              <Typography variant="body2" color="error.main">{errors[0]}</Typography>
            )}
            <Button onClick={() => navigate('/accounting/vendor-payments')} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving || errors.length > 0}>
              {saving ? 'Saving…' : 'Record Payment'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
};

export default VendorPaymentForm;
