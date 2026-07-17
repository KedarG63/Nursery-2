/**
 * MaterialPurchaseForm — create / edit a Supplies & Materials purchase (payable).
 *
 * Creating a purchase records what you owe the vendor; no money moves here.
 * Payments are recorded separately (in MaterialPurchaseDetails) as tranches.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Grid, InputAdornment, CircularProgress, Typography, Box, Divider,
} from '@mui/material';
import { toast } from 'react-toastify';
import materialPurchaseService from '../../services/materialPurchaseService';
import { getCategories } from '../../services/expenseService';
import api from '../../utils/api';

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  purchase_date: todayStr(),
  vendor_id: '',
  category_id: '',
  item_description: '',
  quantity: '',
  unit: '',
  rate: '',
  amount: '',
  tax_amount: '',
  other_charges: '',
  invoice_number: '',
  invoice_date: '',
  due_date: '',
  notes: '',
};

const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);

const MaterialPurchaseForm = ({ open, onClose, onSuccess, purchase }) => {
  const editing = Boolean(purchase);
  const [form, setForm] = useState(emptyForm);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadStatic = useCallback(async () => {
    try {
      const [vend, cat] = await Promise.all([
        api.get('/api/vendors', { params: { limit: 200, status: 'active' } })
          .then((r) => r.data).catch(() => ({ data: [] })),
        getCategories().catch(() => ({ data: [] })),
      ]);
      setVendors(vend.data || vend.vendors || []);
      setCategories(cat.data || []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadStatic();
    if (editing) {
      setForm({
        purchase_date: purchase.purchase_date?.split('T')[0] || todayStr(),
        vendor_id: purchase.vendor_id || '',
        category_id: purchase.category_id || '',
        item_description: purchase.item_description || '',
        quantity: purchase.quantity ?? '',
        unit: purchase.unit || '',
        rate: purchase.rate ?? '',
        amount: purchase.amount ?? '',
        tax_amount: purchase.tax_amount ?? '',
        other_charges: purchase.other_charges ?? '',
        invoice_number: purchase.invoice_number || '',
        invoice_date: purchase.invoice_date?.split('T')[0] || '',
        due_date: purchase.due_date?.split('T')[0] || '',
        notes: purchase.notes || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, editing, purchase, loadStatic]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Auto-fill amount = quantity × rate whenever either changes and both are numeric.
  const setQtyOrRate = (k) => (e) => {
    const val = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: val };
      const q = parseFloat(k === 'quantity' ? val : next.quantity);
      const r = parseFloat(k === 'rate' ? val : next.rate);
      if (!Number.isNaN(q) && !Number.isNaN(r)) {
        next.amount = String(Number((q * r).toFixed(2)));
      }
      return next;
    });
  };

  const grandTotal =
    (parseFloat(form.amount) || 0) +
    (parseFloat(form.tax_amount) || 0) +
    (parseFloat(form.other_charges) || 0);

  const handleSubmit = async () => {
    if (!form.vendor_id) return toast.error('Please select a vendor');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');

    const payload = {
      purchase_date: form.purchase_date,
      vendor_id: form.vendor_id,
      category_id: form.category_id || null,
      item_description: form.item_description || null,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      unit: form.unit || null,
      rate: form.rate === '' ? null : Number(form.rate),
      amount: Number(form.amount),
      tax_amount: form.tax_amount ? Number(form.tax_amount) : 0,
      other_charges: form.other_charges ? Number(form.other_charges) : 0,
      invoice_number: form.invoice_number || null,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await materialPurchaseService.update(purchase.id, payload);
        toast.success('Purchase updated');
      } else {
        await materialPurchaseService.create(payload);
        toast.success('Purchase recorded');
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? 'Edit Supplies Purchase' : 'Add Supplies Purchase'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={4}>
            <TextField label="Purchase Date" type="date" fullWidth size="small"
              InputLabelProps={{ shrink: true }} value={form.purchase_date} onChange={set('purchase_date')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField select label="Vendor" fullWidth size="small" required
              value={form.vendor_id} onChange={set('vendor_id')}>
              {vendors.length === 0 && <MenuItem value="" disabled>No vendors — add one first</MenuItem>}
              {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.vendor_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField select label="Material Type (category)" fullWidth size="small"
              value={form.category_id} onChange={set('category_id')}>
              <MenuItem value="">None</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField label="Item / Description" fullWidth size="small"
              placeholder='e.g. "Cocopeat 5kg blocks"' value={form.item_description} onChange={set('item_description')} />
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField label="Quantity" type="number" fullWidth size="small"
              value={form.quantity} onChange={setQtyOrRate('quantity')} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField label="Unit" fullWidth size="small" placeholder="bags, kg, litre"
              value={form.unit} onChange={set('unit')} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField label="Rate / unit" type="number" fullWidth size="small"
              value={form.rate} onChange={setQtyOrRate('rate')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField label="Amount (subtotal)" type="number" fullWidth size="small" required
              value={form.amount} onChange={set('amount')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField label="Tax" type="number" fullWidth size="small"
              value={form.tax_amount} onChange={set('tax_amount')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField label="Other charges" type="number" fullWidth size="small"
              value={form.other_charges} onChange={set('other_charges')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>Grand Total:</Typography>
              <Typography variant="h6" fontWeight={700}>{fmtINR(grandTotal)}</Typography>
            </Box>
          </Grid>

          <Grid item xs={12}><Divider /></Grid>

          <Grid item xs={12} sm={4}>
            <TextField label="Invoice No." fullWidth size="small"
              value={form.invoice_number} onChange={set('invoice_number')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Invoice Date" type="date" fullWidth size="small"
              InputLabelProps={{ shrink: true }} value={form.invoice_date} onChange={set('invoice_date')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Payment Due Date" type="date" fullWidth size="small"
              InputLabelProps={{ shrink: true }} value={form.due_date} onChange={set('due_date')}
              helperText="Blank = auto from vendor terms" />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Notes" fullWidth size="small" multiline rows={2}
              value={form.notes} onChange={set('notes')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MaterialPurchaseForm;
