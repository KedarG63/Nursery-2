import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Stack, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, InputAdornment,
  IconButton, Tooltip,
} from '@mui/material';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { getTransfers, createTransfer, deleteTransfer } from '../../services/fundTransferService';
import { getCashAccounts } from '../../services/cashLedgerService';
import { getBankAccounts } from '../../services/bankLedgerService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const todayStr = () => new Date().toISOString().split('T')[0];

const DepositsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [transfers, setTransfers] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ transfer_date: todayStr(), from_cash_account_id: '', to_bank_account_id: '', amount: '', reference_number: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, loading: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, cash, bank] = await Promise.all([getTransfers({ limit: 50 }), getCashAccounts(), getBankAccounts()]);
      setTransfers(list.data || []);
      setCashAccounts(cash.data || []);
      setBankAccounts(bank.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDialog = () => {
    setForm({
      transfer_date: todayStr(),
      from_cash_account_id: cashAccounts[0]?.id || '',
      to_bank_account_id: bankAccounts[0]?.id || '',
      amount: '', reference_number: '', notes: '',
    });
    setDialog(true);
  };

  const cashBalance = cashAccounts.find((a) => a.id === form.from_cash_account_id)?.current_balance;

  const submit = async () => {
    if (!form.from_cash_account_id || !form.to_bank_account_id) return toast.error(t('accounting.errAccounts', 'Select cash and bank accounts'));
    if (!form.amount || Number(form.amount) <= 0) return toast.error(t('accounting.errAmount', 'Enter a valid amount'));
    setSaving(true);
    try {
      await createTransfer({ ...form, amount: Number(form.amount) });
      toast.success(t('accounting.depositRecorded', 'Deposit recorded'));
      setDialog(false);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to record deposit');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteTransfer(confirm.row.id);
      toast.success(t('accounting.depositDeleted', 'Deposit deleted'));
      setConfirm({ open: false, row: null, loading: false });
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
      setConfirm((c) => ({ ...c, loading: false }));
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <MoveDownIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('accounting.deposits', 'Cash Deposits')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('accounting.depositsSub', 'Move cash-in-hand into a bank account (savings deposit)')}</Typography>
          </Box>
        </Stack>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>{t('accounting.recordDeposit', 'Record Deposit')}</Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Balance overview */}
      <Grid container spacing={2} mb={2}>
        {cashAccounts.map((a) => (
          <Grid item xs={12} sm={6} md={4} key={a.id}>
            <Card elevation={1} sx={{ borderTop: '4px solid #ed6c02' }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary">{a.account_name}</Typography>
                <Typography variant="h6" fontWeight={700}>{formatCurrency(a.current_balance)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('accounting.number', 'No.')}</TableCell>
                <TableCell>{t('accounting.date', 'Date')}</TableCell>
                <TableCell>{t('accounting.fromCash', 'From (Cash)')}</TableCell>
                <TableCell>{t('accounting.toBank', 'To (Bank)')}</TableCell>
                <TableCell>{t('accounting.reference', 'Reference')}</TableCell>
                <TableCell align="right">{t('accounting.amount', 'Amount')}</TableCell>
                {canWrite && <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.length === 0 && (
                <TableRow><TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t('accounting.noDeposits', 'No deposits yet')}</Typography>
                </TableCell></TableRow>
              )}
              {transfers.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.transfer_number}</TableCell>
                  <TableCell>{formatDate(r.transfer_date)}</TableCell>
                  <TableCell>{r.from_cash_account_name}</TableCell>
                  <TableCell>{r.to_bank_account_name}</TableCell>
                  <TableCell>{r.reference_number || '-'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(r.amount)}</TableCell>
                  {canWrite && (
                    <TableCell align="right">
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

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('accounting.recordDeposit', 'Record Deposit')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField label={t('accounting.date', 'Date')} type="date" InputLabelProps={{ shrink: true }} size="small"
              value={form.transfer_date} onChange={(e) => setForm((f) => ({ ...f, transfer_date: e.target.value }))} />
            <TextField select label={t('accounting.fromCash', 'From (Cash)')} size="small"
              value={form.from_cash_account_id} onChange={(e) => setForm((f) => ({ ...f, from_cash_account_id: e.target.value }))}
              helperText={cashBalance != null ? t('accounting.available', 'Available: {{bal}}', { bal: formatCurrency(cashBalance) }) : ''}>
              {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
            </TextField>
            <TextField select label={t('accounting.toBank', 'To (Bank)')} size="small"
              value={form.to_bank_account_id} onChange={(e) => setForm((f) => ({ ...f, to_bank_account_id: e.target.value }))}>
              {bankAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>)}
            </TextField>
            <TextField label={t('accounting.amount', 'Amount')} type="number" size="small"
              value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <TextField label={t('accounting.reference', 'Reference / Slip No.')} size="small"
              value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} />
            <TextField label={t('accounting.notes', 'Notes')} size="small" multiline rows={2}
              value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        title={t('accounting.deleteDeposit', 'Delete Deposit')}
        message={t('accounting.deleteDepositMsg', 'This reverses both the cash and bank ledger entries. Continue?')}
        confirmText={t('common.delete', 'Delete')}
        confirmColor="error"
        loading={confirm.loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, row: null, loading: false })}
      />
    </Box>
  );
};

export default DepositsPage;
