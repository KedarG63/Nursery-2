import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert, MenuItem, Typography,
  InputAdornment,
} from '@mui/material';
import { setOpeningBalance } from '../../services/bankLedgerService';

// Generate FY options: current FY and 2 prior
function getFYOptions() {
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [-1, 0, 1].map((offset) => {
    const yr = currentFYStart + offset;
    return {
      value: `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`,
      label: `FY ${yr}-${String((yr + 1) % 100).padStart(2, '0')}`,
      aprilFirst: `${yr}-04-01`,
    };
  });
}

const SetOpeningBalanceModal = ({ open, onClose, accountId, accountName, onSuccess }) => {
  const fyOptions = getFYOptions();
  const defaultFY = fyOptions[1]; // current FY

  const [selectedFY, setSelectedFY] = useState(defaultFY.value);
  const [entryDate, setEntryDate] = useState(defaultFY.aprilFirst);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFYChange = (fy) => {
    setSelectedFY(fy);
    const opt = fyOptions.find((o) => o.value === fy);
    if (opt) setEntryDate(opt.aprilFirst);
  };

  const reset = () => {
    setSelectedFY(defaultFY.value);
    setEntryDate(defaultFY.aprilFirst);
    setAmount('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (!amount || parseFloat(amount) < 0) {
      setError('Please enter a valid opening balance (0 or greater).');
      return;
    }
    setLoading(true);
    try {
      const result = await setOpeningBalance(accountId, {
        entry_date: entryDate,
        amount: parseFloat(amount),
      });
      reset();
      onSuccess(result.message);
    } catch (err) {
      setError(err.message || 'Failed to set opening balance.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Set Opening Balance</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {accountName && (
            <Typography variant="body2" color="text.secondary">
              Account: <strong>{accountName}</strong>
            </Typography>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            select
            label="Financial Year"
            value={selectedFY}
            onChange={(e) => handleFYChange(e.target.value)}
            fullWidth
          >
            {fyOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="As on Date"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            helperText="Typically April 1st of the financial year"
          />

          <TextField
            label="Opening Balance (₹)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 0.01 }}
            fullWidth
            required
            helperText="Enter the bank balance as on the date above"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Set Opening Balance'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SetOpeningBalanceModal;
