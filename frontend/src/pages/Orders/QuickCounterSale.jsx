import { useState, useEffect, useMemo } from 'react';
import {
  Box, Container, Typography, Paper, Grid, TextField, MenuItem, Button,
  InputAdornment, Divider, Stack, Alert, CircularProgress, Chip,
} from '@mui/material';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import OrderItems from '../../components/Orders/OrderItems';
import { createOrder } from '../../services/orderService';
import { getCustomers, createCustomer } from '../../services/customerService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';
import { formatCurrency } from '../../utils/formatters';

const WALK_IN_NAME = 'Walk-in Customer';
const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Quick Counter Sale — one screen for a walk-in cash-and-carry sale.
 * Pick items → enter cash received → Complete Sale. It creates the order,
 * records the payment, and posts it to the Cash Book in a single step.
 * The full order wizard is unchanged and still available for scheduled orders.
 */
const QuickCounterSale = () => {
  const navigate = useNavigate();

  const [walkIn, setWalkIn] = useState(null);
  const [resolving, setResolving] = useState(true);
  const [resolveError, setResolveError] = useState('');
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [items, setItems] = useState([]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [payVia, setPayVia] = useState('cash');
  const [cashAccountId, setCashAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resolve (or create) the shared Walk-in Customer, and load money accounts.
  useEffect(() => {
    (async () => {
      try {
        setResolving(true);
        const res = await getCustomers({ search: WALK_IN_NAME, limit: 5 });
        const list = res.data || res.customers || [];
        let wi = list.find((c) => c.name?.toLowerCase() === WALK_IN_NAME.toLowerCase());
        if (!wi) {
          const created = await createCustomer({
            name: WALK_IN_NAME,
            customer_type: 'retailer',
            phone: '+919999999999',
            credit_limit: 0,
            credit_days: 1,
            notes: 'Auto-created for one-time / cash walk-in sales',
          });
          wi = created.data || created.customer || created;
        }
        setWalkIn(wi);
      } catch (err) {
        console.error('Failed to resolve walk-in customer:', err);
        setResolveError('Could not set up the walk-in customer. Please try again.');
      } finally {
        setResolving(false);
      }
    })();

    getCashAccounts()
      .then((r) => {
        const list = r.data || r.accounts || [];
        setCashAccounts(list);
        setCashAccountId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => {});
    getBankAccounts()
      .then((r) => setBankAccounts(r.data || r.accounts || []))
      .catch(() => {});
  }, []);

  const orderTotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [items]
  );

  const change = Math.max(0, (parseFloat(amountReceived) || 0) - orderTotal);

  const handleComplete = async () => {
    if (!walkIn) return toast.error('Walk-in customer not ready yet');
    if (items.length === 0) return toast.error('Add at least one item');
    const paid = parseFloat(amountReceived) || 0;
    if (paid <= 0) return toast.error('Enter the amount received');
    if (payVia === 'cash' && !cashAccountId) return toast.error('Select a cash drawer');

    const noteParts = [];
    if (buyerName) noteParts.push(`Walk-in: ${buyerName}`);
    if (buyerPhone) noteParts.push(`Ph: ${buyerPhone}`);

    const payload = {
      customer_id: walkIn.id,
      delivery_address_id: null,
      delivery_date: todayStr(), // immediate pickup
      delivery_slot: 'morning',
      payment_type: 'advance',
      items: items.map((it) => ({ sku_id: it.sku_id, quantity: it.quantity, unit_price: it.unit_price })),
      order_date: todayStr(),
      notes: noteParts.join(' | ') || 'Counter sale',
      skip_availability_check: true,
      auto_allocate: true,
      // Payment is capped at the true order total server-side.
      amount_paid_now: paid,
      payment_method: payVia,
      ...(payVia === 'cash' ? { cash_account_id: cashAccountId } : { bank_account_id: bankAccountId || null }),
    };

    setSubmitting(true);
    try {
      const res = await createOrder(payload);
      toast.success('Counter sale completed');
      navigate(`/orders/${res.data?.id || res.id}`);
    } catch (err) {
      console.error('Counter sale failed:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  if (resolving) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
        <PointOfSaleIcon sx={{ fontSize: 30, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Quick Counter Sale</Typography>
          <Typography variant="body2" color="text.secondary">
            Walk-in cash-and-carry — pick items, take payment, done. Posts to sales and the Cash Book instantly.
          </Typography>
        </Box>
      </Stack>

      {resolveError && <Alert severity="error" sx={{ mb: 2 }}>{resolveError}</Alert>}

      <Grid container spacing={3}>
        {/* Items */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <OrderItems items={items} onItemsChange={setItems} />
          </Paper>
        </Grid>

        {/* Payment panel */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, position: { md: 'sticky' }, top: 16 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Payment</Typography>

            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography color="text.secondary">Items total (approx.)</Typography>
              <Typography fontWeight={700}>{formatCurrency(orderTotal)}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Final total (incl. any tax) is calculated on the order.
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth size="small" label="Amount received" type="number"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  inputProps={{ min: 0, step: 0.01 }}
                />
                {orderTotal > 0 && (
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => setAmountReceived(String(orderTotal))}>
                    Exact ({formatCurrency(orderTotal)})
                  </Button>
                )}
                {change > 0 && (
                  <Chip size="small" color="info" sx={{ mt: 0.5, ml: 1 }} label={`Change to return: ${formatCurrency(change)}`} />
                )}
              </Grid>

              <Grid item xs={6}>
                <TextField
                  fullWidth select size="small" label="Paid via"
                  value={payVia} onChange={(e) => setPayVia(e.target.value)}
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={6}>
                {payVia === 'cash' ? (
                  <TextField
                    fullWidth select size="small" label="Cash Drawer"
                    value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}
                  >
                    {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                  </TextField>
                ) : (
                  <TextField
                    fullWidth select size="small" label="Bank (optional)"
                    value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                  >
                    <MenuItem value=""><em>— Not specified —</em></MenuItem>
                    {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                  </TextField>
                )}
              </Grid>

              <Grid item xs={12}><Divider /></Grid>

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Buyer (optional — for your records)</Typography>
              </Grid>
              <Grid item xs={7}>
                <TextField fullWidth size="small" label="Name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </Grid>
              <Grid item xs={5}>
                <TextField fullWidth size="small" label="Phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
              </Grid>

              <Grid item xs={12}>
                <Button
                  fullWidth variant="contained" size="large" color="success"
                  disabled={submitting || items.length === 0 || !(parseFloat(amountReceived) > 0)}
                  onClick={handleComplete}
                  startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <PointOfSaleIcon />}
                >
                  {submitting ? 'Completing…' : 'Complete Sale'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default QuickCounterSale;
