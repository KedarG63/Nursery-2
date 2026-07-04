import { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Chip, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Pagination,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, InputAdornment,
} from '@mui/material';
import PaidIcon from '@mui/icons-material/Paid';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { getAdvances, createAdvance, deleteAdvance } from '../../services/advanceService';
import { getEmployees } from '../../services/employeeService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const todayStr = () => new Date().toISOString().split('T')[0];

const AdvancesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ employee_id: '', advance_date: todayStr(), amount: '', payment_source: 'cash', bank_account_id: '', cash_account_id: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, loading: false });

  const loadStatic = useCallback(async () => {
    try {
      const [emp, cash, bank] = await Promise.all([getEmployees({ limit: 200, status: 'active' }), getCashAccounts(), getBankAccounts()]);
      setEmployees(emp.data || []);
      setCashAccounts(cash.data || []);
      setBankAccounts(bank.data || []);
    } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await getAdvances(params);
      setRows(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err) { setError(err.message || 'Failed to load advances'); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const openDialog = () => {
    setForm({ employee_id: '', advance_date: todayStr(), amount: '', payment_source: 'cash', bank_account_id: bankAccounts[0]?.id || '', cash_account_id: cashAccounts[0]?.id || '', notes: '' });
    setDialog(true);
  };

  const submit = async () => {
    if (!form.employee_id) return toast.error(t('payroll.errEmployee', 'Select an employee'));
    if (!(Number(form.amount) > 0)) return toast.error(t('accounting.errAmount', 'Enter a valid amount'));
    if (form.payment_source === 'cash' && !form.cash_account_id) return toast.error(t('accounting.errCashAcc', 'Select a cash account'));
    if (form.payment_source === 'bank' && !form.bank_account_id) return toast.error(t('accounting.errBankAcc', 'Select a bank account'));
    setSaving(true);
    try {
      await createAdvance({
        employee_id: form.employee_id, advance_date: form.advance_date, amount: Number(form.amount),
        payment_source: form.payment_source,
        bank_account_id: form.payment_source === 'bank' ? form.bank_account_id : null,
        cash_account_id: form.payment_source === 'cash' ? form.cash_account_id : null,
        notes: form.notes || null,
      });
      toast.success(t('payroll.advanceRecorded', 'Advance recorded'));
      setDialog(false); load();
    } catch (err) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteAdvance(confirm.row.id);
      toast.success(t('payroll.advanceDeleted', 'Advance deleted'));
      setConfirm({ open: false, row: null, loading: false });
      load();
    } catch (err) { toast.error(err.message || 'Failed'); setConfirm((c) => ({ ...c, loading: false })); }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <PaidIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('payroll.advances', 'Staff Advances')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payroll.advancesSub', 'Advances paid out — recovered automatically from payroll')}</Typography>
          </Box>
        </Stack>
        {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>{t('payroll.giveAdvance', 'Give Advance')}</Button>}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField select label={t('payroll.status', 'Status')} size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">{t('common.all', 'All')}</MenuItem>
          <MenuItem value="outstanding">{t('payroll.outstanding', 'Outstanding')}</MenuItem>
          <MenuItem value="recovered">{t('payroll.recovered', 'Recovered')}</MenuItem>
        </TextField>
      </Paper>

      {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('payroll.number', 'No.')}</TableCell>
                <TableCell>{t('payroll.date', 'Date')}</TableCell>
                <TableCell>{t('payroll.employee', 'Employee')}</TableCell>
                <TableCell>{t('accounting.paidFrom', 'Paid From')}</TableCell>
                <TableCell align="right">{t('payroll.amount', 'Amount')}</TableCell>
                <TableCell align="right">{t('payroll.recoveredAmt', 'Recovered')}</TableCell>
                <TableCell align="right">{t('payroll.balance', 'Balance')}</TableCell>
                <TableCell>{t('payroll.status', 'Status')}</TableCell>
                {canWrite && <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={canWrite ? 9 : 8} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noAdvances', 'No advances yet')}</Typography></TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.advance_number}</TableCell>
                  <TableCell>{formatDate(r.advance_date)}</TableCell>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={r.payment_source === 'cash' ? 'warning' : 'info'} label={r.payment_source === 'cash' ? (r.cash_account_name || t('accounting.cashInHand', 'Cash')) : (r.bank_account_name || t('accounting.bank', 'Bank'))} /></TableCell>
                  <TableCell align="right">{formatCurrency(r.amount)}</TableCell>
                  <TableCell align="right">{formatCurrency(r.amount_recovered)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.balance)}</TableCell>
                  <TableCell><Chip size="small" label={r.status} color={r.status === 'recovered' ? 'success' : 'warning'} /></TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      {Number(r.amount_recovered) === 0 && (
                        <Tooltip title={t('common.delete', 'Delete')}><IconButton size="small" color="error" onClick={() => setConfirm({ open: true, row: r, loading: false })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {totalPages > 1 && <Box display="flex" justifyContent="center" mt={2}><Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" /></Box>}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('payroll.giveAdvance', 'Give Advance')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField select label={t('payroll.employee', 'Employee')} size="small" value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}>
              {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</MenuItem>)}
            </TextField>
            <TextField label={t('payroll.date', 'Date')} type="date" InputLabelProps={{ shrink: true }} size="small" value={form.advance_date} onChange={(e) => setForm((f) => ({ ...f, advance_date: e.target.value }))} />
            <TextField label={t('payroll.amount', 'Amount')} type="number" size="small" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <TextField select label={t('accounting.paidFrom', 'Paid From')} size="small" value={form.payment_source} onChange={(e) => setForm((f) => ({ ...f, payment_source: e.target.value }))}>
              <MenuItem value="cash">{t('accounting.cashInHand', 'Cash in Hand')}</MenuItem>
              <MenuItem value="bank">{t('accounting.bank', 'Bank')}</MenuItem>
            </TextField>
            {form.payment_source === 'cash' ? (
              <TextField select label={t('accounting.cashAccount', 'Cash Account')} size="small" value={form.cash_account_id} onChange={(e) => setForm((f) => ({ ...f, cash_account_id: e.target.value }))}>
                {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
              </TextField>
            ) : (
              <TextField select label={t('accounting.bankAccount', 'Bank Account')} size="small" value={form.bank_account_id} onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}>
                {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
              </TextField>
            )}
            <TextField label={t('payroll.notes', 'Notes')} size="small" multiline rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={confirm.open} title={t('payroll.deleteAdvance', 'Delete Advance')} message={t('payroll.deleteAdvanceMsg', 'This reverses the cash/bank ledger entry. Continue?')} confirmText={t('common.delete', 'Delete')} confirmColor="error" loading={confirm.loading} onConfirm={handleDelete} onCancel={() => setConfirm({ open: false, row: null, loading: false })} />
    </Box>
  );
};

export default AdvancesPage;
