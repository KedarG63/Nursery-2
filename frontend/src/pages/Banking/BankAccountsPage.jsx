import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, CardActions,
  Typography, Button, Chip, Divider, IconButton,
  Tooltip, Alert, CircularProgress, Stack,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EditIcon from '@mui/icons-material/Edit';
import BalanceIcon from '@mui/icons-material/AccountBalanceWallet';
import SyncIcon from '@mui/icons-material/Sync';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BarChartIcon from '@mui/icons-material/BarChart';
import { toast } from 'react-toastify';
import { getBankAccounts } from '../../services/bankLedgerService';
import EditAccountModal from '../../components/Banking/EditAccountModal';
import SetOpeningBalanceModal from '../../components/Banking/SetOpeningBalanceModal';
import SyncTransactionsModal from '../../components/Banking/SyncTransactionsModal';
import useAuth from '../../hooks/useAuth';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

const BankAccountsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('Admin');
  const isManager = user?.roles?.includes('Manager');
  const canWrite = isAdmin || isManager;

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [editModal, setEditModal] = useState({ open: false, account: null });
  const [openingModal, setOpeningModal] = useState({ open: false, account: null });
  const [syncModal, setSyncModal] = useState({ open: false, account: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBankAccounts();
      setAccounts(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load bank accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEditSuccess = () => {
    setEditModal({ open: false, account: null });
    toast.success('Bank account updated.');
    load();
  };

  const handleOpeningSuccess = (message) => {
    setOpeningModal({ open: false, account: null });
    toast.success(message || 'Opening balance set.');
    load();
  };

  const handleSyncSuccess = (message) => {
    setSyncModal({ open: false, account: null });
    toast.success(message || 'Sync complete.');
    load();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <AccountBalanceIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Bank Accounts</Typography>
            <Typography variant="body2" color="text.secondary">
              View balances and ledger for each business bank account
            </Typography>
          </Box>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {accounts.map((account) => {
          const balance = parseFloat(account.current_balance || 0);
          const isPositive = balance >= 0;

          return (
            <Grid item xs={12} md={4} key={account.id}>
              <Card
                elevation={2}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: `4px solid ${isPositive ? '#2e7d32' : '#c62828'}`,
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: 6 },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  {/* Account name + edit button */}
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight={700} gutterBottom>
                        {account.account_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {account.bank_name}
                      </Typography>
                    </Box>
                    {canWrite && (
                      <Tooltip title="Edit account details">
                        <IconButton
                          size="small"
                          onClick={() => setEditModal({ open: true, account })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />

                  {/* Account number */}
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Account No.
                  </Typography>
                  <Typography variant="body2" fontWeight={500} mb={1.5}>
                    {account.account_number}
                  </Typography>

                  {account.ifsc_code && (
                    <Chip label={`IFSC: ${account.ifsc_code}`} size="small" variant="outlined" sx={{ mb: 1.5 }} />
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  {/* Current balance — the hero number */}
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Current Balance
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    sx={{ color: isPositive ? '#2e7d32' : '#c62828', letterSpacing: '-0.5px' }}
                  >
                    {fmt(balance)}
                  </Typography>
                </CardContent>

                <Divider />

                <CardActions sx={{ px: 2, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
                  <Button
                    size="small"
                    startIcon={<ListAltIcon />}
                    onClick={() => navigate(`/banking/${account.id}/ledger`)}
                    variant="contained"
                    sx={{ flexGrow: 1 }}
                  >
                    View Ledger
                  </Button>

                  <Button
                    size="small"
                    startIcon={<BarChartIcon />}
                    onClick={() => navigate(`/banking/${account.id}/summary`)}
                    variant="outlined"
                  >
                    Summary
                  </Button>

                  {canWrite && (
                    <>
                      <Button
                        size="small"
                        startIcon={<BalanceIcon />}
                        onClick={() => setOpeningModal({ open: true, account })}
                        variant="outlined"
                        color="secondary"
                      >
                        Opening Bal.
                      </Button>

                      <Tooltip title="Sync bank-transfer payments from the system into this account's ledger">
                        <Button
                          size="small"
                          startIcon={<SyncIcon />}
                          onClick={() => setSyncModal({ open: true, account })}
                          variant="outlined"
                          color="info"
                        >
                          Sync
                        </Button>
                      </Tooltip>
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}

        {accounts.length === 0 && !loading && (
          <Grid item xs={12}>
            <Alert severity="info">No bank accounts configured yet. Contact Admin to set up accounts.</Alert>
          </Grid>
        )}
      </Grid>

      {/* Modals */}
      <EditAccountModal
        open={editModal.open}
        account={editModal.account}
        onClose={() => setEditModal({ open: false, account: null })}
        onSuccess={handleEditSuccess}
      />

      <SetOpeningBalanceModal
        open={openingModal.open}
        accountId={openingModal.account?.id}
        accountName={openingModal.account?.account_name}
        onClose={() => setOpeningModal({ open: false, account: null })}
        onSuccess={handleOpeningSuccess}
      />

      <SyncTransactionsModal
        open={syncModal.open}
        accountId={syncModal.account?.id}
        accountName={syncModal.account?.account_name}
        onClose={() => setSyncModal({ open: false, account: null })}
        onSuccess={handleSyncSuccess}
      />
    </Box>
  );
};

export default BankAccountsPage;
