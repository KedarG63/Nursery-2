import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert,
} from '@mui/material';
import { upsertBankAccount } from '../../services/bankLedgerService';

const EditAccountModal = ({ open, onClose, account, onSuccess }) => {
  const [form, setForm] = useState({
    account_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account) {
      setForm({
        account_name: account.account_name || '',
        bank_name: account.bank_name || '',
        account_number: account.account_number || '',
        ifsc_code: account.ifsc_code || '',
        branch: account.branch || '',
      });
    }
  }, [account]);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.account_name || !form.bank_name || !form.account_number) {
      setError('Account name, bank name, and account number are required.');
      return;
    }
    setLoading(true);
    try {
      await upsertBankAccount(form, account?.id || null);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to save account details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account?.id ? 'Edit Bank Account' : 'Add Bank Account'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Account Name"
            value={form.account_name}
            onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
            fullWidth
            required
            placeholder='e.g. HDFC Current Account'
          />
          <TextField
            label="Bank Name"
            value={form.bank_name}
            onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
            fullWidth
            required
            placeholder='e.g. HDFC Bank'
          />
          <TextField
            label="Account Number"
            value={form.account_number}
            onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
            fullWidth
            required
          />
          <TextField
            label="IFSC Code"
            value={form.ifsc_code}
            onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))}
            fullWidth
            placeholder='e.g. HDFC0001234'
          />
          <TextField
            label="Branch"
            value={form.branch}
            onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            fullWidth
            placeholder='e.g. Koramangala, Bangalore'
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditAccountModal;
