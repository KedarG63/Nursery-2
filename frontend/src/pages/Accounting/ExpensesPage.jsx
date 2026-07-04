import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Stack, Alert,
  CircularProgress, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Paper, IconButton, Tooltip, Chip, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, Pagination,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import {
  getExpenses, getExpenseSummary, createExpense, updateExpense, deleteExpense, getCategories,
} from '../../services/expenseService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  expense_date: todayStr(),
  category_id: '',
  vendor_id: '',
  amount: '',
  tax_amount: '',
  payment_source: 'cash',
  bank_account_id: '',
  cash_account_id: '',
  description: '',
  reference_number: '',
};

const ExpenseDialog = ({ open, onClose, onSaved, editing, categories, cashAccounts, bankAccounts, vendors }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          expense_date: editing.expense_date?.split('T')[0] || todayStr(),
          category_id: editing.category_id || '',
          vendor_id: editing.vendor_id || '',
          amount: editing.amount ?? '',
          tax_amount: editing.tax_amount ?? '',
          payment_source: editing.payment_source || 'cash',
          bank_account_id: editing.bank_account_id || '',
          cash_account_id: editing.cash_account_id || '',
          description: editing.description || '',
          reference_number: '',
        });
      } else {
        setForm({
          ...emptyForm,
          cash_account_id: cashAccounts[0]?.id || '',
          bank_account_id: bankAccounts[0]?.id || '',
        });
      }
    }
  }, [open, editing, cashAccounts, bankAccounts]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.category_id) return toast.error(t('accounting.errCategory', 'Please select a category'));
    if (!form.amount || Number(form.amount) <= 0) return toast.error(t('accounting.errAmount', 'Enter a valid amount'));
    if (form.payment_source === 'cash' && !form.cash_account_id) return toast.error(t('accounting.errCashAcc', 'Select a cash account'));
    if (form.payment_source === 'bank' && !form.bank_account_id) return toast.error(t('accounting.errBankAcc', 'Select a bank account'));

    const payload = {
      expense_date: form.expense_date,
      category_id: form.category_id,
      vendor_id: form.vendor_id || null,
      amount: Number(form.amount),
      tax_amount: form.tax_amount ? Number(form.tax_amount) : 0,
      description: form.description || null,
      reference_number: form.reference_number || null,
      payment_source: form.payment_source,
      bank_account_id: form.payment_source === 'bank' ? form.bank_account_id : null,
      cash_account_id: form.payment_source === 'cash' ? form.cash_account_id : null,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateExpense(editing.id, payload);
        toast.success(t('accounting.expenseUpdated', 'Expense updated'));
      } else {
        await createExpense(payload);
        toast.success(t('accounting.expenseAdded', 'Expense recorded'));
      }
      onSaved();
    } catch (err) {
      toast.error(err.message || (err.errors?.[0]) || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? t('accounting.editExpense', 'Edit Expense') : t('accounting.addExpense', 'Add Expense')}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={6}>
            <TextField label={t('accounting.date', 'Date')} type="date" fullWidth size="small"
              InputLabelProps={{ shrink: true }} value={form.expense_date} onChange={set('expense_date')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label={t('accounting.category', 'Category')} fullWidth size="small"
              value={form.category_id} onChange={set('category_id')}>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('accounting.amount', 'Amount')} type="number" fullWidth size="small"
              value={form.amount} onChange={set('amount')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('accounting.tax', 'Tax (optional)')} type="number" fullWidth size="small"
              value={form.tax_amount} onChange={set('tax_amount')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label={t('accounting.paidFrom', 'Paid From')} fullWidth size="small"
              value={form.payment_source} onChange={set('payment_source')}>
              <MenuItem value="cash">{t('accounting.cashInHand', 'Cash in Hand')}</MenuItem>
              <MenuItem value="bank">{t('accounting.bank', 'Bank')}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            {form.payment_source === 'cash' ? (
              <TextField select label={t('accounting.cashAccount', 'Cash Account')} fullWidth size="small"
                value={form.cash_account_id} onChange={set('cash_account_id')}>
                {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
              </TextField>
            ) : (
              <TextField select label={t('accounting.bankAccount', 'Bank Account')} fullWidth size="small"
                value={form.bank_account_id} onChange={set('bank_account_id')}>
                {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
              </TextField>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label={t('accounting.vendorOptional', 'Vendor (optional)')} fullWidth size="small"
              value={form.vendor_id} onChange={set('vendor_id')}>
              <MenuItem value="">{t('common.none', 'None')}</MenuItem>
              {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.vendor_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('accounting.reference', 'Reference No.')} fullWidth size="small"
              value={form.reference_number} onChange={set('reference_number')} />
          </Grid>
          <Grid item xs={12}>
            <TextField label={t('accounting.description', 'Description')} fullWidth size="small" multiline rows={2}
              value={form.description} onChange={set('description')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ExpensesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ by_category: [], grand_total: 0 });
  const [categories, setCategories] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [confirm, setConfirm] = useState({ open: false, row: null, loading: false });

  const loadStatic = useCallback(async () => {
    try {
      const [cat, cash, bank, vend] = await Promise.all([
        getCategories(),
        getCashAccounts(),
        getBankAccounts(),
        api.get('/api/vendors', { params: { limit: 200, status: 'active' } }).then((r) => r.data).catch(() => ({ data: [] })),
      ]);
      setCategories(cat.data || []);
      setCashAccounts(cash.data || []);
      setBankAccounts(bank.data || []);
      setVendors(vend.data || vend.vendors || []);
    } catch (err) {
      // non-fatal — page still works for listing
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.category_id = categoryFilter;
      if (sourceFilter) params.payment_source = sourceFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const [list, sum] = await Promise.all([
        getExpenses(params),
        getExpenseSummary({ from_date: fromDate || undefined, to_date: toDate || undefined }),
      ]);
      setRows(list.data || []);
      setTotalPages(list.pagination?.totalPages || 1);
      setSummary(sum.data || { by_category: [], grand_total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, categoryFilter, sourceFilter, fromDate, toDate]);

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, categoryFilter, sourceFilter, fromDate, toDate]);

  const handleSaved = () => { setDialog({ open: false, editing: null }); load(); loadStatic(); };

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteExpense(confirm.row.id);
      toast.success(t('accounting.expenseDeleted', 'Expense deleted'));
      setConfirm({ open: false, row: null, loading: false });
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
      setConfirm((c) => ({ ...c, loading: false }));
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <ReceiptLongIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('accounting.expenses', 'Expenses')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('accounting.expensesSub', 'Record daily expenses — auto-deducted from cash or bank')}
            </Typography>
          </Box>
        </Stack>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, editing: null })}>
            {t('accounting.addExpense', 'Add Expense')}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary cards */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2} sx={{ borderTop: '4px solid #c62828' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{t('accounting.totalExpenses', 'Total (filtered)')}</Typography>
              <Typography variant="h5" fontWeight={800} color="#c62828">{formatCurrency(summary.grand_total)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        {summary.by_category.slice(0, 3).map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.category_id}>
            <Card elevation={1}>
              <CardContent>
                <Typography variant="caption" color="text.secondary">{c.category_name}</Typography>
                <Typography variant="h6" fontWeight={700}>{formatCurrency(c.total)}</Typography>
                <Typography variant="caption" color="text.secondary">{c.count} {t('accounting.entries', 'entries')}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField label={t('common.search', 'Search')} size="small" fullWidth value={search} onChange={(e) => setSearch(e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField select label={t('accounting.category', 'Category')} size="small" fullWidth value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <MenuItem value="">{t('common.all', 'All')}</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField select label={t('accounting.paidFrom', 'Paid From')} size="small" fullWidth value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <MenuItem value="">{t('common.all', 'All')}</MenuItem>
              <MenuItem value="cash">{t('accounting.cashInHand', 'Cash in Hand')}</MenuItem>
              <MenuItem value="bank">{t('accounting.bank', 'Bank')}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label={t('accounting.from', 'From')} type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField label={t('accounting.to', 'To')} type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('accounting.number', 'No.')}</TableCell>
                <TableCell>{t('accounting.date', 'Date')}</TableCell>
                <TableCell>{t('accounting.category', 'Category')}</TableCell>
                <TableCell>{t('accounting.description', 'Description')}</TableCell>
                <TableCell>{t('accounting.vendor', 'Vendor')}</TableCell>
                <TableCell>{t('accounting.paidFrom', 'Paid From')}</TableCell>
                <TableCell align="right">{t('accounting.amount', 'Amount')}</TableCell>
                {canWrite && <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={canWrite ? 8 : 7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t('accounting.noExpenses', 'No expenses found')}</Typography>
                </TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.expense_number}</TableCell>
                  <TableCell>{formatDate(r.expense_date)}</TableCell>
                  <TableCell>{r.category_name}</TableCell>
                  <TableCell>{r.description || '-'}</TableCell>
                  <TableCell>{r.vendor_name || '-'}</TableCell>
                  <TableCell>
                    <Chip size="small"
                      label={r.payment_source === 'cash' ? (r.cash_account_name || t('accounting.cashInHand', 'Cash')) : (r.bank_account_name || t('accounting.bank', 'Bank'))}
                      color={r.payment_source === 'cash' ? 'warning' : 'info'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.total_amount)}</TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      <Tooltip title={t('common.edit', 'Edit')}>
                        <IconButton size="small" onClick={() => setDialog({ open: true, editing: r })}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete', 'Delete')}>
                        <IconButton size="small" color="error" onClick={() => setConfirm({ open: true, row: r, loading: false })}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" />
        </Box>
      )}

      <ExpenseDialog
        open={dialog.open}
        editing={dialog.editing}
        categories={categories}
        cashAccounts={cashAccounts}
        bankAccounts={bankAccounts}
        vendors={vendors}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirm.open}
        title={t('accounting.deleteExpense', 'Delete Expense')}
        message={t('accounting.deleteExpenseMsg', 'This will reverse its cash/bank ledger entry. Continue?')}
        confirmText={t('common.delete', 'Delete')}
        confirmColor="error"
        loading={confirm.loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, row: null, loading: false })}
      />
    </Box>
  );
};

export default ExpensesPage;
