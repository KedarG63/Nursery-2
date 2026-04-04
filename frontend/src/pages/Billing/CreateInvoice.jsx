import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Stepper, Step, StepLabel, Button,
  TextField, Stack, Grid, Autocomplete, InputAdornment,
  CircularProgress, Alert, FormControlLabel, Switch,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { format, addDays } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getOrders, getOrder } from '../../services/orderService';
import { createInvoice } from '../../services/invoiceService';
import InvoiceItemsTable from '../../components/Billing/InvoiceItemsTable';

const STEPS = ['Select Order', 'Edit Items', 'Invoice Details'];

const CreateInvoice = () => {
  const navigate = useNavigate();

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1 state
  const [orderSearch, setOrderSearch] = useState('');
  const [orderOptions, setOrderOptions] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Step 2 state
  const [items, setItems] = useState([]);

  // Step 3 state
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [issueNow, setIssueNow] = useState(false);

  // Load orders for invoice selection (all billable statuses)
  const loadOrders = useCallback(async (searchValue) => {
    setLoadingOrders(true);
    try {
      const params = { limit: 50, status: 'pending,confirmed,preparing,ready,dispatched,delivered' };
      if (searchValue && searchValue.length >= 2) params.search = searchValue;
      const result = await getOrders(params);
      setOrderOptions(result.data || []);
    } catch {
      setOrderOptions([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Trigger search on input change
  const handleOrderSearch = useCallback((value) => {
    loadOrders(value);
  }, [loadOrders]);

  // When order is selected: fetch its items and default due date
  const handleSelectOrder = async (order) => {
    if (!order) { setSelectedOrder(null); setItems([]); return; }
    try {
      const detail = await getOrder(order.id);
      const o = detail.data || detail;
      setSelectedOrder(o);

      // Pre-fill items from order_items
      const mappedItems = (o.items || []).map((oi) => ({
        order_item_id: oi.id,
        description: oi.product_name || oi.sku_name || oi.description || `Item`,
        sku_id: oi.sku_id,
        sku_variety: oi.variety || oi.sku_code || '',
        quantity: oi.quantity,
        unit_price: parseFloat(oi.unit_price),
        discount_amount: 0,
        tax_rate: 0,
        line_total: (oi.quantity * parseFloat(oi.unit_price)).toFixed(2),
        tax_amount: (0).toFixed(2),
      }));
      setItems(mappedItems);

      // Default due date = today + credit_days
      const creditDays = o.credit_days || o.customer?.credit_days || 30;
      setDueDate(addDays(new Date(), creditDays));
    } catch (err) {
      toast.error('Could not load order details');
    }
  };

  const handleNext = () => {
    setError('');
    if (activeStep === 0 && !selectedOrder) {
      setError('Please select an order to continue.');
      return;
    }
    if (activeStep === 1 && items.length === 0) {
      setError('Please add at least one item.');
      return;
    }
    setActiveStep((s) => s + 1);
  };

  const handleBack = () => {
    setError('');
    setActiveStep((s) => s - 1);
  };

  const handleSubmit = async (issue) => {
    if (!dueDate) { setError('Please set a due date.'); return; }
    if (!invoiceDate) { setError('Please set an invoice date.'); return; }
    if (new Date(dueDate) < new Date(invoiceDate)) { setError('Due date must be on or after invoice date.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        customer_id: selectedOrder.customer_id,
        order_id: selectedOrder.id,
        invoice_date: format(invoiceDate, 'yyyy-MM-dd'),
        due_date: format(dueDate, 'yyyy-MM-dd'),
        discount_amount: parseFloat(discountAmount) || 0,
        tax_rate: parseFloat(taxRate) || 0,
        notes: notes || undefined,
        terms_and_conditions: terms || undefined,
        items: items.map((item) => ({
          order_item_id: item.order_item_id || undefined,
          description: item.description,
          sku_id: item.sku_id || undefined,
          quantity: parseInt(item.quantity),
          unit_price: parseFloat(item.unit_price),
          discount_amount: parseFloat(item.discount_amount) || 0,
          tax_rate: parseFloat(item.tax_rate) || 0,
          notes: item.notes || undefined,
        })),
      };

      const result = await createInvoice(payload);
      const newId = result.data?.id;

      // Issue immediately if requested
      if (issue && newId) {
        const { issueInvoice } = await import('../../services/invoiceService');
        await issueInvoice(newId);
        toast.success('Invoice created and issued');
      } else {
        toast.success('Invoice created as draft');
      }

      navigate(`/billing/invoices/${newId}`);
    } catch (err) {
      setError(err?.message || (err?.errors ? err.errors.join(', ') : 'Failed to create invoice'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/billing/invoices')} size="small">
          Back
        </Button>
        <Typography variant="h5" fontWeight={700}>Create Invoice</Typography>
      </Box>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 1: Select Order */}
      {activeStep === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Select an Order</Typography>
          <Autocomplete
            options={orderOptions}
            getOptionLabel={(o) => `${o.order_number} — ${o.customer_name || ''} (${o.status})`}
            onOpen={() => loadOrders('')}
            onInputChange={(_, value) => handleOrderSearch(value)}
            onChange={(_, value) => handleSelectOrder(value)}
            loading={loadingOrders}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search by order number or customer"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingOrders ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            sx={{ mb: 2 }}
          />

          {selectedOrder && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Order #</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedOrder.order_number}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Customer</Typography>
                  <Typography variant="body2">{selectedOrder.customer_name || selectedOrder.customer?.name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{selectedOrder.status}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography variant="body2">₹{parseFloat(selectedOrder.total_amount || 0).toLocaleString('en-IN')}</Typography>
                </Grid>
              </Grid>
            </Paper>
          )}
        </Paper>
      )}

      {/* Step 2: Edit Items */}
      {activeStep === 1 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Invoice Line Items</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Items are pre-filled from the order. You can adjust prices, quantities, or add/remove items.
          </Typography>
          <InvoiceItemsTable
            items={items}
            editable
            onChange={setItems}
            taxRate={taxRate}
          />
        </Paper>
      )}

      {/* Step 3: Invoice Details */}
      {activeStep === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Invoice Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Invoice Date *
                </Typography>
                <DatePicker
                  selected={invoiceDate}
                  onChange={setInvoiceDate}
                  dateFormat="dd/MM/yyyy"
                  customInput={<TextField size="small" fullWidth />}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Due Date *
                </Typography>
                <DatePicker
                  selected={dueDate}
                  onChange={setDueDate}
                  dateFormat="dd/MM/yyyy"
                  minDate={invoiceDate}
                  customInput={<TextField size="small" fullWidth />}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="Discount Amount (₹)"
                type="number"
                size="small"
                fullWidth
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="GST Rate (%)"
                type="number"
                size="small"
                fullWidth
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                inputProps={{ min: 0, max: 100 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes (optional)"
                multiline
                rows={2}
                size="small"
                fullWidth
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Terms & Conditions (optional)"
                multiline
                rows={3}
                size="small"
                fullWidth
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="e.g. Payment due within 30 days..."
              />
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button onClick={handleBack} disabled={activeStep === 0 || submitting}>
          Back
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {activeStep < STEPS.length - 1 ? (
            <Button variant="contained" onClick={handleNext} disabled={submitting}>
              Next
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save as Draft'}
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => handleSubmit(true)}
                disabled={submitting}
              >
                {submitting ? 'Creating…' : 'Create & Issue'}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default CreateInvoice;
