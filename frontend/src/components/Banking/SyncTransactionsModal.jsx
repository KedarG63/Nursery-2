import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, Alert, FormControlLabel, Checkbox,
  Typography, Divider,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { syncTransactions } from '../../services/bankLedgerService';

const SyncTransactionsModal = ({ open, onClose, accountId, accountName, onSuccess }) => {
  const [syncCredits, setSyncCredits] = useState(true);
  const [syncDebits, setSyncDebits] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSync = async () => {
    if (!syncCredits && !syncDebits) {
      setError('Select at least one option to sync.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await syncTransactions(accountId, {
        sync_credits: syncCredits,
        sync_debits: syncDebits,
      });
      onSuccess(result.message);
      handleClose();
    } catch (err) {
      setError(err.message || 'Sync failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SyncIcon /> Sync Transactions
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {accountName && (
            <Typography variant="body2">
              Syncing into: <strong>{accountName}</strong>
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary">
            This will pull existing bank-mode transactions from the system into this account's ledger.
            Only transactions not yet linked to this ledger will be imported — no duplicates.
          </Typography>

          <Divider />

          {error && <Alert severity="error">{error}</Alert>}

          <FormControlLabel
            control={
              <Checkbox
                checked={syncCredits}
                onChange={(e) => setSyncCredits(e.target.checked)}
                color="success"
              />
            }
            label={
              <Stack>
                <Typography variant="body2" fontWeight={600}>
                  Customer Receipts (Credits)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Payments received via Bank Transfer, UPI, or Cheque from customers
                </Typography>
              </Stack>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={syncDebits}
                onChange={(e) => setSyncDebits(e.target.checked)}
                color="error"
              />
            }
            label={
              <Stack>
                <Typography variant="body2" fontWeight={600}>
                  Vendor Payments (Debits)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Payments made via Bank Transfer or Cheque to vendors for seed purchases
                </Typography>
              </Stack>
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSync}
          disabled={loading || (!syncCredits && !syncDebits)}
          startIcon={<SyncIcon />}
        >
          {loading ? 'Syncing...' : 'Run Sync'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SyncTransactionsModal;
