import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Stack, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, InputAdornment,
  IconButton, Tooltip, Pagination,
} from '@mui/material';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
  getCashAccounts, setOpeningBalance, getLedger, addManualEntry, deleteManualEntry,
} from '../../services/cashLedgerService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const todayStr = () => new Date().toISOString().split('T')[0];

const CashBookPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [account, setAccount] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [obDialog, setObDialog] = useState(false);
  const [obForm, setObForm] = useState({ entry_date: todayStr(), amount: '' });
  const [entryDialog, setEntryDialog] = useState(false);
  const [entryForm, setEntryForm] = useState({ entry_date: todayStr(), entry_type: 'credit', amount: '', party_name: '', narration: '' });
  const [confirm, setConfirm] = useState({ open: false, entry: null, loading: false });
  const [saving, setSaving] = useState(false);

  const loadAccount = useCallback(async () => {
    const res = await getCashAccounts();
    const acc = res.data?.[0] || null;
    setAccount(acc);
    return acc;
  }, []);

  const loadLedger = useCallback(async (accId) => {
    if (!accId) return;
    const res = await getLedger(accId, { page, limit: 50 });
    setLedger(res.data || []);
    setTotalPages(res.pagination?.totalPages || 1);
  }, [page]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const acc = await loadAccount();
      await loadLedger(acc?.id);
    } catch (err) {
      setError(err.message || 'Failed to load cash book');
    } finally {
      setLoading(false);
    }
  }, [loadAccount, loadLedger]);

  useEffect(() => { refresh(); }, [refresh]);

  const submitOpening = async () => {
    if (!obForm.amount || Number(obForm.amount) < 0) return toast.error(t('accounting.errAmount', 'Enter a valid amount'));
    setSaving(true);
    try {
      const res = await setOpeningBalance(account.id, { entry_date: obForm.entry_date, amount: Number(obForm.amount) });
      toast.success(res.message || t('accounting.openingSet', 'Opening balance set'));
      setObDialog(false);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally { setSaving(false); }
  };

  const submitEntry = async () => {
    if (!entryForm.amount || Number(entryForm.amount) <= 0) return toast.error(t('accounting.errAmount', 'Enter a valid amount'));
    if (!entryForm.party_name) return toast.error(t('accounting.errParty', 'Party name is required'));
    setSaving(true);
    try {
      await addManualEntry(account.id, { ...entryForm, amount: Number(entryForm.amount) });
      toast.success(t('accounting.entryAdded', 'Entry added'));
      setEntryDialog(false);
      setEntryForm({ entry_date: todayStr(), entry_type: 'credit', amount: '', party_name: '', narration: '' });
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally { setSaving(false); }
  };

  const handleDeleteEntry = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteManualEntry(account.id, confirm.entry.id);
      toast.success(t('accounting.entryDeleted', 'Entry deleted'));
      setConfirm({ open: false, entry: null, loading: false });
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed');
      setConfirm((c) => ({ ...c, loading: false }));
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>;
  }

  const balance = parseFloat(account?.current_balance || 0);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <SavingsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('accounting.cashBook', 'Cash Book (Cash in Hand)')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('accounting.cashBookSub', 'Running cash balance with every credit and debit')}</Typography>
          </Box>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={5}>
          <Card elevation={2} sx={{ borderTop: `4px solid ${balance >= 0 ? '#2e7d32' : '#c62828'}` }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <AccountBalanceWalletIcon color="action" />
                <Typography variant="h6" fontWeight={700}>{account?.account_name || t('accounting.cashInHand', 'Cash in Hand')}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">{t('accounting.currentBalance', 'Current Balance')}</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: balance >= 0 ? '#2e7d32' : '#c62828' }}>
                {formatCurrency(balance)}
              </Typography>
              {canWrite && (
                <Stack direction="row" spacing={1} mt={2}>
                  <Button size="small" variant="outlined" onClick={() => { setObForm({ entry_date: todayStr(), amount: '' }); setObDialog(true); }}>
                    {t('accounting.setOpening', 'Set Opening Balance')}
                  </Button>
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEntryDialog(true)}>
                    {t('accounting.addEntry', 'Add Entry')}
                  </Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('accounting.date', 'Date')}</TableCell>
              <TableCell>{t('accounting.particulars', 'Particulars')}</TableCell>
              <TableCell>{t('accounting.type', 'Type')}</TableCell>
              <TableCell align="right">{t('accounting.credit', 'Credit (In)')}</TableCell>
              <TableCell align="right">{t('accounting.debit', 'Debit (Out)')}</TableCell>
              <TableCell align="right">{t('accounting.balance', 'Balance')}</TableCell>
              {canWrite && <TableCell align="right"></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {ledger.length === 0 && (
              <TableRow><TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ py: 4 }}>
                <Typography color="text.secondary">{t('accounting.noEntries', 'No ledger entries yet')}</Typography>
              </TableCell></TableRow>
            )}
            {ledger.map((e) => (
              <TableRow key={e.id} hover>
                <TableCell>{formatDate(e.entry_date)}</TableCell>
                <TableCell>
                  <Typography variant="body2">{e.party_name || '-'}</Typography>
                  {e.narration && <Typography variant="caption" color="text.secondary">{e.narration}</Typography>}
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined"
                    label={e.source_type === 'manual' ? t('accounting.manual', 'Manual') : e.source_type}
                    color={e.source_type === 'manual' ? 'default' : 'secondary'} />
                </TableCell>
                <TableCell align="right" sx={{ color: '#2e7d32' }}>{e.entry_type === 'credit' ? formatCurrency(e.amount) : ''}</TableCell>
                <TableCell align="right" sx={{ color: '#c62828' }}>{e.entry_type === 'debit' ? formatCurrency(e.amount) : ''}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(e.running_balance)}</TableCell>
                {canWrite && (
                  <TableCell align="right">
                    {e.source_type === 'manual' && e.entry_type !== 'opening_balance' && (
                      <Tooltip title={t('common.delete', 'Delete')}>
                        <IconButton size="small" color="error" onClick={() => setConfirm({ open: true, entry: e, loading: false })}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" />
        </Box>
      )}

      {/* Opening balance dialog */}
      <Dialog open={obDialog} onClose={() => setObDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('accounting.setOpening', 'Set Opening Balance')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField label={t('accounting.date', 'Date')} type="date" InputLabelProps={{ shrink: true }} size="small"
              value={obForm.entry_date} onChange={(e) => setObForm((f) => ({ ...f, entry_date: e.target.value }))} />
            <TextField label={t('accounting.amount', 'Amount')} type="number" size="small"
              value={obForm.amount} onChange={(e) => setObForm((f) => ({ ...f, amount: e.target.value }))}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setObDialog(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={submitOpening} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Manual entry dialog */}
      <Dialog open={entryDialog} onClose={() => setEntryDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('accounting.addEntry', 'Add Cash Entry')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField label={t('accounting.date', 'Date')} type="date" InputLabelProps={{ shrink: true }} size="small"
              value={entryForm.entry_date} onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))} />
            <TextField select label={t('accounting.type', 'Type')} size="small"
              value={entryForm.entry_type} onChange={(e) => setEntryForm((f) => ({ ...f, entry_type: e.target.value }))}>
              <MenuItem value="credit">{t('accounting.creditIn', 'Credit (cash in)')}</MenuItem>
              <MenuItem value="debit">{t('accounting.debitOut', 'Debit (cash out)')}</MenuItem>
            </TextField>
            <TextField label={t('accounting.amount', 'Amount')} type="number" size="small"
              value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            <TextField label={t('accounting.partyName', 'Received from / Paid to')} size="small"
              value={entryForm.party_name} onChange={(e) => setEntryForm((f) => ({ ...f, party_name: e.target.value }))} />
            <TextField label={t('accounting.narration', 'Narration')} size="small" multiline rows={2}
              value={entryForm.narration} onChange={(e) => setEntryForm((f) => ({ ...f, narration: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEntryDialog(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={submitEntry} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        title={t('accounting.deleteEntry', 'Delete Entry')}
        message={t('accounting.deleteEntryMsg', 'Delete this manual cash entry?')}
        confirmText={t('common.delete', 'Delete')}
        confirmColor="error"
        loading={confirm.loading}
        onConfirm={handleDeleteEntry}
        onCancel={() => setConfirm({ open: false, entry: null, loading: false })}
      />
    </Box>
  );
};

export default CashBookPage;
