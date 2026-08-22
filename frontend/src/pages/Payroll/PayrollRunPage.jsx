import { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Chip, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Divider,
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
const fmtD = (d) => d.toISOString().split('T')[0];
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 6); return fmtD(d); };

const statusColor = (s) => (s === 'paid' ? 'success' : s === 'finalized' ? 'info' : 'default');

const PayrollRunPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newOpen, setNewOpen] = useState(false);
  const [meta, setMeta] = useState({
    run_type: 'salary',
    period_month: now.getMonth() + 1,
    period_year: now.getFullYear(),
    from_date: weekAgo(),
    to_date: fmtD(now),
  });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [pay, setPay] = useState({ open: false, run: null, rows: [], payment_source: 'cash', bank_account_id: '', cash_account_id: '', loading: false, loadingRows: false });
  const [view, setView] = useState({ open: false, run: null, loading: false });
  const [confirm, setConfirm] = useState({ open: false, run: null, loading: false });
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const isWages = meta.run_type === 'wages';

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
      const body = meta.run_type === 'salary'
        ? { run_type: 'salary', period_month: meta.period_month, period_year: meta.period_year }
        : { run_type: 'wages', from_date: meta.from_date, to_date: meta.to_date };
      const res = await previewRun(body);
      setPreview(res.data);
    } catch (err) { toast.error(err.message || 'Failed to preview'); }
    finally { setPreviewing(false); }
  };

  const setItemAdvance = (employee_id, val) => {
    setPreview((p) => ({
      ...p,
      items: p.items.map((it) => {
        if (it.employee_id !== employee_id) return it;
        const payable = it.gross_amount - (it.leave_deducted || 0);
        const adv = Math.max(0, Math.min(Number(val) || 0, payable));
        return { ...it, advance_deducted: adv, net_amount: Number((payable - adv).toFixed(2)) };
      }),
    }));
  };

  const create = async () => {
    const items = preview.items
      .filter((it) => it.gross_amount > 0)
      .map((it) => ({
        employee_id: it.employee_id,
        gross_amount: it.gross_amount,
        days_worked: it.days_worked,
        unpaid_leave_days: it.unpaid_leave_days,
        leave_deducted: it.leave_deducted || 0,
        advance_deducted: it.advance_deducted,
      }));
    if (items.length === 0) return toast.error(t('payroll.errNoItems', 'No payable employees in this period'));
    setCreating(true);
    try {
      const body = meta.run_type === 'salary'
        ? { run_type: 'salary', period_month: meta.period_month, period_year: meta.period_year, items }
        : { run_type: 'wages', from_date: meta.from_date, to_date: meta.to_date, items };
      await createRun(body);
      toast.success(t('payroll.runCreated', 'Draft payroll run created'));
      setNewOpen(false); setPreview(null); load();
    } catch (err) { toast.error(err.message || 'Failed to create run'); }
    finally { setCreating(false); }
  };

  // Load the run's pending items so each employee can be paid from their own
  // source — some staff are paid in cash, some by transfer.
  const openPay = async (run) => {
    const defaultCash = cashAccounts[0]?.id || '';
    const defaultBank = bankAccounts[0]?.id || '';
    setPay({ open: true, run, rows: [], payment_source: 'cash', bank_account_id: defaultBank, cash_account_id: defaultCash, loading: false, loadingRows: true });
    try {
      const res = await getRun(run.id);
      const rows = (res.data.items || [])
        .filter((it) => it.status === 'pending')
        .map((it) => {
          // Default to bank for anyone who has transfer details on file.
          const paidOnline = Boolean(it.bank_account_number || it.upi_id);
          return {
            payroll_item_id: it.id,
            full_name: it.full_name,
            net_amount: it.net_amount,
            payment_source: paidOnline ? 'bank' : 'cash',
            bank_account_id: defaultBank,
            cash_account_id: defaultCash,
          };
        });
      setPay((p) => ({ ...p, run: res.data, rows, loadingRows: false }));
    } catch (err) {
      toast.error(err.message || 'Failed to load run');
      setPay((p) => ({ ...p, open: false, loadingRows: false }));
    }
  };

  const setRow = (itemId, patch) => setPay((p) => ({
    ...p,
    rows: p.rows.map((r) => (r.payroll_item_id === itemId ? { ...r, ...patch } : r)),
  }));

  // "Set all to…" — bulk-apply one source across every row.
  const setAllRows = (source) => setPay((p) => ({
    ...p,
    rows: p.rows.map((r) => ({ ...r, payment_source: source })),
  }));

  const doPay = async () => {
    const bad = pay.rows.find((r) =>
      (r.payment_source === 'bank' && !r.bank_account_id) ||
      (r.payment_source === 'cash' && !r.cash_account_id));
    if (bad) return toast.error(t('payroll.errPayAccount', `Choose an account for ${bad.full_name}`));

    setPay((p) => ({ ...p, loading: true }));
    try {
      // The run-level source is the fallback for anything not itemised.
      const body = { payment_source: pay.payment_source };
      if (pay.payment_source === 'bank') body.bank_account_id = pay.bank_account_id; else body.cash_account_id = pay.cash_account_id;
      body.items = pay.rows.map((r) => ({
        payroll_item_id: r.payroll_item_id,
        payment_source: r.payment_source,
        ...(r.payment_source === 'bank'
          ? { bank_account_id: r.bank_account_id }
          : { cash_account_id: r.cash_account_id }),
      }));

      const res = await payRun(pay.run.id, body);
      toast.success(res.message || t('payroll.paid', 'Payroll paid'));
      setPay({ open: false, run: null, rows: [], payment_source: 'cash', bank_account_id: '', cash_account_id: '', loading: false, loadingRows: false });
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
            <Typography variant="body2" color="text.secondary">{t('payroll.payrollRunsSub2', 'Monthly salaries and daily wages (any period); pay from cash or bank')}</Typography>
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
                <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                <TableCell>{t('payroll.status', 'Status')}</TableCell>
                <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noRuns', 'No payroll runs yet')}</Typography></TableCell></TableRow>}
              {runs.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.run_number}</TableCell>
                  <TableCell>{r.period_label}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={r.run_type === 'salary' ? t('payroll.salary', 'Salary') : t('payroll.wages', 'Wages')} /></TableCell>
                  <TableCell align="right">{r.item_count}</TableCell>
                  <TableCell align="right">{formatCurrency(r.total_gross)}</TableCell>
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
                <MenuItem value="salary">{t('payroll.salaryMonthly', 'Salary (monthly)')}</MenuItem>
                <MenuItem value="wages">{t('payroll.wagesRange', 'Daily wages (date range)')}</MenuItem>
              </TextField>
            </Grid>

            {!isWages ? (
              <>
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
              </>
            ) : (
              <>
                <Grid item xs={6} sm={3}>
                  <TextField label={t('payroll.from', 'From')} type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} value={meta.from_date} onChange={(e) => { setMeta((m) => ({ ...m, from_date: e.target.value })); setPreview(null); }} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField label={t('payroll.to', 'To')} type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} value={meta.to_date} onChange={(e) => { setMeta((m) => ({ ...m, to_date: e.target.value })); setPreview(null); }} />
                </Grid>
              </>
            )}

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
                    {isWages
                      ? <TableCell align="right">{t('payroll.days', 'Days')}</TableCell>
                      : <TableCell align="right">{t('payroll.unpaidLeaveCol', 'Unpaid Leave')}</TableCell>}
                    <TableCell align="right">{isWages ? t('payroll.gross', 'Gross') : t('payroll.salaryCol', 'Salary')}</TableCell>
                    <TableCell align="right">{t('payroll.deduct', 'Deduct Advance')}</TableCell>
                    <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.items.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}><Typography color="text.secondary">{t('payroll.noEligible', 'No eligible employees for this period')}</Typography></TableCell></TableRow>}
                  {preview.items.map((it) => (
                    <TableRow key={it.employee_id}>
                      <TableCell>{it.full_name}</TableCell>
                      {isWages ? (
                        <TableCell align="right">{it.days_worked ?? '-'}</TableCell>
                      ) : (
                        <TableCell align="right">
                          {Number(it.unpaid_leave_days) > 0
                            ? <Typography variant="body2" color="error.main">{it.unpaid_leave_days} {t('payroll.daysShort', 'd')} (−{formatCurrency(it.leave_deducted)})</Typography>
                            : <Typography variant="body2" color="text.secondary">—</Typography>}
                        </TableCell>
                      )}
                      <TableCell align="right">
                        {formatCurrency(it.gross_amount)}
                        {!isWages && it.payable_days != null && it.payable_days < preview.days_in_month && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {t('payroll.partMonth', 'part month')} — {it.payable_days}/{preview.days_in_month} {t('payroll.daysShort', 'd')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <TextField type="number" size="small" value={it.advance_deducted}
                          onChange={(e) => setItemAdvance(it.employee_id, e.target.value)}
                          sx={{ width: 120 }} inputProps={{ min: 0 }}
                          helperText={Number(it.outstanding_advance) > 0 ? `${t('payroll.outstandingShort', 'due')} ${formatCurrency(it.outstanding_advance)}` : ' '} />
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
      <Dialog open={pay.open} onClose={() => setPay((p) => ({ ...p, open: false }))} maxWidth="md" fullWidth>
        <DialogTitle>{t('payroll.payRun', 'Pay Payroll Run')}</DialogTitle>
        <DialogContent dividers>
          {pay.loadingRows ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>
          ) : pay.run && (
            <Stack spacing={2} mt={1}>
              <Typography variant="body2">{pay.run.run_number} — {pay.run.period_label}</Typography>
              <Typography variant="h6" fontWeight={700}>{t('payroll.totalNet', 'Total Net')}: {formatCurrency(pay.run.total_net)}</Typography>
              <Divider />

              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">{t('payroll.setAll', 'Set all to')}:</Typography>
                <Button size="small" variant="outlined" onClick={() => setAllRows('cash')}>{t('accounting.cashInHand', 'Cash in Hand')}</Button>
                <Button size="small" variant="outlined" onClick={() => setAllRows('bank')}>{t('accounting.bank', 'Bank')}</Button>
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('payroll.name', 'Name')}</TableCell>
                      <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                      <TableCell>{t('accounting.paidFrom', 'Pay From')}</TableCell>
                      <TableCell>{t('payroll.account', 'Account')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pay.rows.length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">{t('payroll.noPending', 'No pending employees in this run')}</Typography>
                      </TableCell></TableRow>
                    )}
                    {pay.rows.map((r) => (
                      <TableRow key={r.payroll_item_id}>
                        <TableCell>{r.full_name}</TableCell>
                        <TableCell align="right">{formatCurrency(r.net_amount)}</TableCell>
                        <TableCell>
                          <TextField select size="small" sx={{ minWidth: 130 }} value={r.payment_source}
                            onChange={(e) => setRow(r.payroll_item_id, { payment_source: e.target.value })}>
                            <MenuItem value="cash">{t('accounting.cashInHand', 'Cash in Hand')}</MenuItem>
                            <MenuItem value="bank">{t('accounting.bank', 'Bank')}</MenuItem>
                          </TextField>
                        </TableCell>
                        <TableCell>
                          {r.payment_source === 'cash' ? (
                            <TextField select size="small" sx={{ minWidth: 190 }} value={r.cash_account_id}
                              onChange={(e) => setRow(r.payroll_item_id, { cash_account_id: e.target.value })}>
                              {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                            </TextField>
                          ) : (
                            <TextField select size="small" sx={{ minWidth: 190 }} value={r.bank_account_id}
                              onChange={(e) => setRow(r.payroll_item_id, { bank_account_id: e.target.value })}>
                              {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
                            </TextField>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="caption" color="text.secondary">
                {t('payroll.paySplitHint', 'Cash')}: {formatCurrency(pay.rows.filter((r) => r.payment_source === 'cash').reduce((s, r) => s + Number(r.net_amount || 0), 0))}
                {' · '}
                {t('accounting.bank', 'Bank')}: {formatCurrency(pay.rows.filter((r) => r.payment_source === 'bank').reduce((s, r) => s + Number(r.net_amount || 0), 0))}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPay((p) => ({ ...p, open: false }))} disabled={pay.loading}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" color="success" onClick={doPay} disabled={pay.loading || pay.loadingRows || pay.rows.length === 0}>{pay.loading ? <CircularProgress size={20} /> : t('payroll.confirmPay', 'Confirm & Pay')}</Button>
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
                    <TableCell align="right">{t('payroll.gross', 'Gross')}</TableCell>
                    <TableCell align="right">{t('payroll.leaveCol', 'Leave −')}</TableCell>
                    <TableCell align="right">{t('payroll.advance', 'Advance −')}</TableCell>
                    <TableCell align="right">{t('payroll.net', 'Net')}</TableCell>
                    <TableCell>{t('payroll.status', 'Status')}</TableCell>
                    <TableCell>{t('accounting.paidFrom', 'Paid From')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {view.run.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.full_name}</TableCell>
                      <TableCell align="right">{formatCurrency(it.gross_amount)}</TableCell>
                      <TableCell align="right">{Number(it.leave_deducted) > 0 ? formatCurrency(it.leave_deducted) : '-'}</TableCell>
                      <TableCell align="right">{Number(it.advance_deducted) > 0 ? formatCurrency(it.advance_deducted) : '-'}</TableCell>
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
