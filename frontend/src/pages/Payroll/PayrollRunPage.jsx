import { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Chip, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, InputAdornment, Divider,
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { previewRun, getRuns, getRun, createRun, payRun, deleteRun } from '../../services/payrollService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2020, i, 1).toLocaleDateString('en-IN', { month: 'long' }) }));
const YEARS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

const statusColor = (s) => (s === 'paid' ? 'success' : s === 'finalized' ? 'info' : 'default');

const PayrollRunPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New run dialog
  const [newOpen, setNewOpen] = useState(false);
  const [meta, setMeta] = useState({ period_month: now.getMonth() + 1, period_year: now.getFullYear(), run_type: 'salary' });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);

  // Pay + view + delete
  const [pay, setPay] = useState({ open: false, run: null, payment_source: 'cash', bank_account_id: '', cash_account_id: '', loading: false });
  const [view, setView] = useState({ open: false, run: null, loading: false });
  const [confirm, setConfirm] = useState({ open: false, run: null, loading: false });
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getRuns({ limit: 50 });
      setRuns(res.data || []);
    } catch (err) { setError(err.message || 'Failed to load payroll runs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getCashAccounts().then((r) => setCashAccounts(r.data || [])).catch(() => {});
    getBankAccounts().then((r) => setBankAccounts(r.data || [])).catch(() => {});
  }, []);

  const runPreview = async () => {
    setPreviewing(true); setPreview(null);
    try {
      const res = await previewRun(meta);
      setPreview(res.data);
    } catch (err) { toast.error(err.message || 'Failed to preview'); }
    finally { setPreviewing(false); }
  };

  const setItemAdvance = (employee_id, val) => {
    setPreview((p) => ({
      ...p,
      items: p.items.map((it) => {
        if (it.employee_id !== employee_id) return it;
        const adv = Math.max(0, Math.min(Number(val) || 0, it.gross_amount));
        return { ...it, advance_deducted: adv, net_amount: Number((it.gross_amount - adv).toFixed(2)) };
      }),
    }));
  };

  const create = async () => {
    const items = preview.items.filter((it) => it.gross_amount > 0)
      .map((it) => ({ employee_id: it.employee_id, gross_amount: it.gross_amount, days_worked: it.days_worked, advance_deducted: it.advance_deducted }));
    if (items.length === 0) return toast.error(t('payroll.errNoItems', 'No payable employees in this period'));
    setCreating(true);
    try {
      await createRun({ ...meta, items });
      toast.success(t('payroll.runCreated', 'Draft payroll run created'));
      setNewOpen(false); setPreview(null); load();
    } catch (err) { toast.error(err.message || 'Failed to create run'); }
    finally { setCreating(false); }
  };

  const openPay = (run) => setPay({ open: true, run, payment_source: 'cash', bank_account_id: bankAccounts[0]?.id || '', cash_account_id: cashAccounts[0]?.id || '', loading: false });

  const doPay = async () => {
    setPay((p) => ({ ...p, loading: true }));
    try {
      const body = { payment_source: pay.payment_source };
      if (pay.payment_source === 'bank') body.bank_account_id = pay.bank_account_id; else body.cash_account_id = pay.cash_account_id;
      const res = await payRun(pay.run.id, body);
      toast.success(res.message || t('payroll.paid', 'Payroll paid'));
      setPay({ open: false, run: null, payment_source: 'cash', bank_account_id: '', cash_account_id: '', loading: false });
      load();
    } catch (err) { toast.error(err.message || 'Failed to pay'); setPay((p) => ({ ...p, loading: false })); }
  };

  const openView = async (run) => {
    setView({ open: true, run: null, loading: true });
    try { const res = await getRun(run.id); setView({ open: true, run: res.data, loading: false }); }
    catch (err) { toast.error(err.message || 'Failed'); setView({ open: false, run: null, loading: false }); }
  };

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteRun(confirm.run.id);
      toast.success(t('payroll.runDeleted', 'Run deleted'));
      setConfirm({ open: false, run: null, loading: false });
      load();
    } catch (err) { toast.error(err.message || 'Failed'); setConfirm((c) => ({ ...c, loading: false })); }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <PaymentsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('payroll.payrollRuns', 'Payroll Runs')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payroll.payrollRunsSub', 'Run salary & daily-wage payouts; pay from cash or bank')}</Typography>
          </Box>
        </Stack>
        {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setNewOpen(true); setPreview(null); }}>{t('payroll.newRun', 'New Payroll Run')}</Button>}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('payroll.number', 'Run No.')}</TableCell>
                <TableCell>{t('payroll.period', 'Period')}</TableCell>
                <TableCell>{t('payroll.type', 'Type')}</TableCell>
                <TableCell align="right">{t('payroll.employees', 'Employees')}</TableCell>
                <TableCell align="right">{t('payroll.gross', 'Gross')}</TableCell>
                <TableCell align="right">{t('payroll.advance', 'Advance')}</TableCell>
                <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                <TableCell>{t('payroll.status', 'Status')}</TableCell>
                <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noRuns', 'No payroll runs yet')}</Typography></TableCell></TableRow>}
              {runs.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.run_number}</TableCell>
                  <TableCell>{r.period_label}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={r.run_type === 'salary' ? t('payroll.salary', 'Salary') : t('payroll.wages', 'Wages')} /></TableCell>
                  <TableCell align="right">{r.item_count}</TableCell>
                  <TableCell align="right">{formatCurrency(r.total_gross)}</TableCell>
                  <TableCell align="right">{formatCurrency(r.total_advance_deducted)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.total_net)}</TableCell>
                  <TableCell><Chip size="small" label={r.status} color={statusColor(r.status)} /></TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('common.view', 'View')}><IconButton size="small" onClick={() => openView(r)}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                    {canWrite && r.status !== 'paid' && (
                      <>
                        <Tooltip title={t('payroll.pay', 'Pay')}><IconButton size="small" color="success" onClick={() => openPay(r)}><PriceCheckIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title={t('common.delete', 'Delete')}><IconButton size="small" color="error" onClick={() => setConfirm({ open: true, run: r, loading: false })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* New run dialog */}
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('payroll.newRun', 'New Payroll Run')}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} alignItems="center" mb={2}>
            <Grid item xs={12} sm={3}>
              <TextField select label={t('payroll.type', 'Type')} fullWidth size="small" value={meta.run_type} onChange={(e) => { setMeta((m) => ({ ...m, run_type: e.target.value })); setPreview(null); }}>
                <MenuItem value="salary">{t('payroll.salary', 'Salary (monthly)')}</MenuItem>
                <MenuItem value="wages">{t('payroll.wages', 'Daily wages')}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label={t('payroll.month', 'Month')} fullWidth size="small" value={meta.period_month} onChange={(e) => { setMeta((m) => ({ ...m, period_month: e.target.value })); setPreview(null); }}>
                {MONTHS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label={t('payroll.year', 'Year')} fullWidth size="small" value={meta.period_year} onChange={(e) => { setMeta((m) => ({ ...m, period_year: e.target.value })); setPreview(null); }}>
                {YEARS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button fullWidth variant="outlined" onClick={runPreview} disabled={previewing}>{previewing ? <CircularProgress size={20} /> : t('payroll.preview', 'Preview')}</Button>
            </Grid>
          </Grid>

          {preview && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('payroll.name', 'Name')}</TableCell>
                    {meta.run_type === 'wages' && <TableCell align="right">{t('payroll.days', 'Days')}</TableCell>}
                    <TableCell align="right">{t('payroll.gross', 'Gross')}</TableCell>
                    <TableCell align="right">{t('payroll.outstandingAdvance', 'Outstanding Adv.')}</TableCell>
                    <TableCell align="right">{t('payroll.deduct', 'Deduct Advance')}</TableCell>
                    <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.items.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}><Typography color="text.secondary">{t('payroll.noEligible', 'No eligible employees for this period')}</Typography></TableCell></TableRow>}
                  {preview.items.map((it) => (
                    <TableRow key={it.employee_id}>
                      <TableCell>{it.full_name}</TableCell>
                      {meta.run_type === 'wages' && <TableCell align="right">{it.days_worked ?? '-'}</TableCell>}
                      <TableCell align="right">{formatCurrency(it.gross_amount)}</TableCell>
                      <TableCell align="right">{formatCurrency(it.outstanding_advance)}</TableCell>
                      <TableCell align="right">
                        <TextField type="number" size="small" value={it.advance_deducted} onChange={(e) => setItemAdvance(it.employee_id, e.target.value)} sx={{ width: 110 }} inputProps={{ min: 0, max: it.gross_amount }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(it.net_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)} disabled={creating}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={create} disabled={creating || !preview || preview.items.length === 0}>
            {creating ? <CircularProgress size={20} /> : t('payroll.createDraft', 'Create Draft Run')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={pay.open} onClose={() => setPay((p) => ({ ...p, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle>{t('payroll.payRun', 'Pay Payroll Run')}</DialogTitle>
        <DialogContent dividers>
          {pay.run && (
            <Stack spacing={2} mt={1}>
              <Typography variant="body2">{pay.run.run_number} — {pay.run.period_label}</Typography>
              <Typography variant="h6" fontWeight={700}>{t('payroll.totalNet', 'Total Net')}: {formatCurrency(pay.run.total_net)}</Typography>
              <Divider />
              <TextField select label={t('accounting.paidFrom', 'Pay From')} size="small" value={pay.payment_source} onChange={(e) => setPay((p) => ({ ...p, payment_source: e.target.value }))}>
                <MenuItem value="cash">{t('accounting.cashInHand', 'Cash in Hand')}</MenuItem>
                <MenuItem value="bank">{t('accounting.bank', 'Bank')}</MenuItem>
              </TextField>
              {pay.payment_source === 'cash' ? (
                <TextField select label={t('accounting.cashAccount', 'Cash Account')} size="small" value={pay.cash_account_id} onChange={(e) => setPay((p) => ({ ...p, cash_account_id: e.target.value }))}>
                  {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name} ({formatCurrency(a.current_balance)})</MenuItem>)}
                </TextField>
              ) : (
                <TextField select label={t('accounting.bankAccount', 'Bank Account')} size="small" value={pay.bank_account_id} onChange={(e) => setPay((p) => ({ ...p, bank_account_id: e.target.value }))}>
                  {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name} ({formatCurrency(a.current_balance)})</MenuItem>)}
                </TextField>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPay((p) => ({ ...p, open: false }))} disabled={pay.loading}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" color="success" onClick={doPay} disabled={pay.loading}>{pay.loading ? <CircularProgress size={20} /> : t('payroll.confirmPay', 'Confirm & Pay')}</Button>
        </DialogActions>
      </Dialog>

      {/* View dialog */}
      <Dialog open={view.open} onClose={() => setView({ open: false, run: null, loading: false })} maxWidth="md" fullWidth>
        <DialogTitle>{view.run ? `${view.run.run_number} — ${view.run.period_label}` : t('common.loading', 'Loading...')}</DialogTitle>
        <DialogContent dividers>
          {view.loading ? <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box> : view.run && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('payroll.name', 'Name')}</TableCell>
                    <TableCell align="right">{t('payroll.days', 'Days')}</TableCell>
                    <TableCell align="right">{t('payroll.gross', 'Gross')}</TableCell>
                    <TableCell align="right">{t('payroll.advance', 'Advance')}</TableCell>
                    <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                    <TableCell>{t('payroll.status', 'Status')}</TableCell>
                    <TableCell>{t('accounting.paidFrom', 'Paid From')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {view.run.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.full_name}</TableCell>
                      <TableCell align="right">{it.days_worked ?? '-'}</TableCell>
                      <TableCell align="right">{formatCurrency(it.gross_amount)}</TableCell>
                      <TableCell align="right">{formatCurrency(it.advance_deducted)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(it.net_amount)}</TableCell>
                      <TableCell><Chip size="small" label={it.status} color={it.status === 'paid' ? 'success' : 'default'} /></TableCell>
                      <TableCell>{it.status === 'paid' ? (it.payment_source === 'cash' ? (it.cash_account_name || 'Cash') : (it.bank_account_name || 'Bank')) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setView({ open: false, run: null, loading: false })}>{t('common.close', 'Close')}</Button></DialogActions>
      </Dialog>

      <ConfirmDialog open={confirm.open} title={t('payroll.deleteRun', 'Delete Payroll Run')} message={t('payroll.deleteRunMsg', 'Delete this draft run?')} confirmText={t('common.delete', 'Delete')} confirmColor="error" loading={confirm.loading} onConfirm={handleDelete} onCancel={() => setConfirm({ open: false, run: null, loading: false })} />
    </Box>
  );
};

export default PayrollRunPage;
