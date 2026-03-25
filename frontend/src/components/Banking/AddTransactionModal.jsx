import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, ToggleButtonGroup, ToggleButton,
  Stack, Typography, InputAdornment, Alert,
} from '@mui/material';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import { addManualEntry } from '../../services/bankLedgerService';

const today = () => new Date().toISOString().split('T')[0];

const AddTransactionModal = ({ open, onClose, accountId, onSuccess }) => {
  const [form, setForm] = useState({
    entry_type: 'credit',
    entry_date: today(),
    amount: '',
    party_name: '',
    narration: '',
    reference_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setForm({
      entry_type: 'credit',
      entry_date: today(),
      amount: '',
      party_name: '',
      narration: '',
      reference_number: '',
    });
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.entry_date || !form.amount || !form.party_name) {
      setError('Date, amount, and party name are required.');
      return;
    }
    if (parseFloat(form.amount) <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }
    setLoading(true);
    try {
      await addManualEntry(accountId, {
        ...form,
        amount: parseFloat(form.amount),
      });
      reset();
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to add entry.');
    } finally {
      setLoading(false);
    }
  };

  const isCredit = form.entry_type === 'credit';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Transaction</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Credit / Debit toggle */}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
              Type
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={form.entry_type}
              onChange={(_, val) => val && setForm((f) => ({ ...f, entry_type: val }))}
              size="small"
            >
              <ToggleButton
                value="credit"
                sx={{
                  px: 2.5,
                  '&.Mui-selected': { backgroundColor: '#e8f5e9', color: '#2e7d32', borderColor: '#4caf50' },
                }}
              >
                <SouthWestIcon sx={{ fontSize: '1rem', mr: 0.5 }} />
                Credit (Money In)
              </ToggleButton>
              <ToggleButton
                value="debit"
                sx={{
                  px: 2.5,
                  '&.Mui-selected': { backgroundColor: '#fce4ec', color: '#c62828', borderColor: '#ef9a9a' },
                }}
              >
                <NorthEastIcon sx={{ fontSize: '1rem', mr: 0.5 }} />
                Debit (Money Out)
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <TextField
            label="Date"
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
          />

          <TextField
            label="Amount (₹)"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            inputProps={{ min: 0.01, step: 0.01 }}
            fullWidth
            required
          />

          <TextField
            label={isCredit ? 'Received From' : 'Sent To'}
            value={form.party_name}
            onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
            fullWidth
            required
            placeholder={isCredit ? 'e.g. Customer name' : 'e.g. Vendor name'}
          />

          <TextField
            label="Narration / Description"
            value={form.narration}
            onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description"
          />

          <TextField
            label="Reference Number"
            value={form.reference_number}
            onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
            fullWidth
            placeholder="Cheque no, UTR, transaction ref, etc."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{
            backgroundColor: isCredit ? '#2e7d32' : '#c62828',
            '&:hover': { backgroundColor: isCredit ? '#1b5e20' : '#b71c1c' },
          }}
        >
          {loading ? 'Saving...' : `Add ${isCredit ? 'Credit' : 'Debit'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddTransactionModal;
