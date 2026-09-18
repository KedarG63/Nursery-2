import { useState, useEffect } from 'react';
import {
  Grid,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Box,
} from '@mui/material';
import {
  AccountBalance as BankIcon,
  Payments as CashIcon,
} from '@mui/icons-material';
import { getBankAccounts } from '../../services/bankLedgerService';
import { getCashAccounts } from '../../services/cashLedgerService';

/**
 * PaymentSourcePicker
 *
 * Chooses where money moves in or out of: a cash drawer or a bank account.
 *
 * Money that moves without naming its account is money the books cannot
 * explain later, so there is deliberately no "unspecified" option and no
 * silent default to a single account — if several accounts exist, the user
 * picks one. The first account is preselected only to save a click; it is
 * still visible and changeable.
 *
 * Props:
 *   value     – { payment_source, bank_account_id, cash_account_id }
 *   onChange  – (next) => void   receives the whole value object
 *   disabled  – boolean
 *   direction – 'out' | 'in'     wording only; defaults to 'out'
 */
const PaymentSourcePicker = ({ value, onChange, disabled = false, direction = 'out' }) => {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);

  useEffect(() => {
    let cancelled = false;

    getBankAccounts()
      .then((r) => {
        if (cancelled) return;
        const list = r.data || r.accounts || [];
        setBankAccounts(list);
        if (!value.bank_account_id && list[0]?.id) {
          onChange({ ...value, bank_account_id: list[0].id });
        }
      })
      .catch(() => {});

    getCashAccounts()
      .then((r) => {
        if (cancelled) return;
        const list = r.data || r.accounts || [];
        setCashAccounts(list);
        if (!value.cash_account_id && list[0]?.id) {
          onChange({ ...value, cash_account_id: list[0].id });
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verb = direction === 'in' ? 'lands in' : 'goes out from';

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Where the money {verb}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={value.payment_source}
          disabled={disabled}
          onChange={(e, next) => {
            if (!next) return; // never allow deselecting to "no source"
            onChange({ ...value, payment_source: next });
          }}
        >
          <ToggleButton value="cash">
            <CashIcon fontSize="small" sx={{ mr: 0.5 }} /> Cash Drawer
          </ToggleButton>
          <ToggleButton value="bank">
            <BankIcon fontSize="small" sx={{ mr: 0.5 }} /> Bank Account
          </ToggleButton>
        </ToggleButtonGroup>
      </Grid>

      <Grid item xs={12}>
        {value.payment_source === 'bank' ? (
          <TextField
            select
            fullWidth
            required
            size="small"
            label="Bank Account"
            value={value.bank_account_id || ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, bank_account_id: e.target.value })}
            helperText={bankAccounts.length === 0 ? 'No active bank accounts found' : ' '}
          >
            {bankAccounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.account_name}
                {a.bank_name ? ` — ${a.bank_name}` : ''}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            select
            fullWidth
            required
            size="small"
            label="Cash Drawer"
            value={value.cash_account_id || ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, cash_account_id: e.target.value })}
            helperText={cashAccounts.length === 0 ? 'No active cash accounts found' : ' '}
          >
            {cashAccounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.account_name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Grid>
    </Grid>
  );
};

/**
 * Shared validation, so every caller rejects the same things.
 * Returns an error string, or '' when the selection is usable.
 */
export const validatePaymentSource = (value) => {
  if (!['cash', 'bank'].includes(value?.payment_source)) {
    return 'Choose whether this is cash or bank';
  }
  if (value.payment_source === 'bank' && !value.bank_account_id) {
    return 'Select the bank account';
  }
  if (value.payment_source === 'cash' && !value.cash_account_id) {
    return 'Select the cash drawer';
  }
  return '';
};

/** Only the account matching the chosen source is sent — the DB allows exactly one. */
export const paymentSourcePayload = (value) => ({
  payment_source: value.payment_source,
  bank_account_id: value.payment_source === 'bank' ? value.bank_account_id : null,
  cash_account_id: value.payment_source === 'cash' ? value.cash_account_id : null,
});

export const emptyPaymentSource = { payment_source: 'cash', bank_account_id: '', cash_account_id: '' };

export default PaymentSourcePicker;
