import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Grid,
  Paper,
  MenuItem,
  InputAdornment,
  Divider,
  Button,
} from '@mui/material';

/**
 * Payment Method Component
 * Select payment terms and, optionally, record money collected right now
 * (e.g. a walk-in / counter sale) so the order is created already paid.
 * Issue #57: Order creation wizard - Step 4
 */
const PaymentMethod = ({
  paymentMethod,
  notes,
  onPaymentChange,
  orderTotal = 0,
  amountPaidNow = '',
  payNowVia = 'cash',
  payNowCashAccount = '',
  payNowBankAccount = '',
  cashAccounts = [],
  bankAccounts = [],
}) => {
  const handleMethodChange = (event) => {
    onPaymentChange('paymentMethod', event.target.value);
  };

  const handleNotesChange = (event) => {
    onPaymentChange('notes', event.target.value);
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Payment Method
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend">Select Payment Method *</FormLabel>
              <RadioGroup
                value={paymentMethod || 'advance'}
                onChange={handleMethodChange}
              >
                <FormControlLabel value="advance" control={<Radio />} label="Advance Payment (Full)" />
                <FormControlLabel value="installment" control={<Radio />} label="Installment Payment" />
                <FormControlLabel value="credit" control={<Radio />} label="Credit (Payment Terms)" />
                <FormControlLabel value="cod" control={<Radio />} label="Cash on Delivery (COD)" />
              </RadioGroup>
            </FormControl>
          </Paper>
        </Grid>

        {/* Optional: money collected now (walk-in / counter sale) */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Payment received now <Typography component="span" variant="body2" color="text.secondary">(optional)</Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              For a walk-in / counter sale, enter what the customer paid now. It records the payment with the order and posts it to your Cash Book / Bank. Leave blank if unpaid.
            </Typography>

            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Amount received"
                  type="number"
                  value={amountPaidNow}
                  onChange={(e) => onPaymentChange('amountPaidNow', e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  inputProps={{ min: 0, step: 0.01 }}
                />
                {orderTotal > 0 && (
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => onPaymentChange('amountPaidNow', String(orderTotal))}>
                    Paid in full ({fmt(orderTotal)})
                  </Button>
                )}
              </Grid>

              {parseFloat(amountPaidNow) > 0 && (
                <>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      select
                      size="small"
                      label="Paid via"
                      value={payNowVia}
                      onChange={(e) => onPaymentChange('payNowVia', e.target.value)}
                    >
                      <MenuItem value="cash">Cash</MenuItem>
                      <MenuItem value="upi">UPI</MenuItem>
                      <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                      <MenuItem value="card">Card</MenuItem>
                    </TextField>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    {payNowVia === 'cash' ? (
                      <TextField
                        fullWidth
                        select
                        size="small"
                        label="Cash Drawer"
                        value={payNowCashAccount}
                        onChange={(e) => onPaymentChange('payNowCashAccount', e.target.value)}
                      >
                        {cashAccounts.map((a) => (
                          <MenuItem key={a.id} value={a.id}>{a.account_name}</MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        fullWidth
                        select
                        size="small"
                        required
                        label="Bank Account"
                        value={payNowBankAccount}
                        onChange={(e) => onPaymentChange('payNowBankAccount', e.target.value)}
                        error={!payNowBankAccount}
                        helperText={!payNowBankAccount ? 'Pick where the money landed' : ''}
                      >
                        {bankAccounts.map((a) => (
                          <MenuItem key={a.id} value={a.id}>
                            {a.account_name}{a.bank_name ? ` — ${a.bank_name}` : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  </Grid>
                </>
              )}
            </Grid>
          </Paper>
        </Grid>

        <Divider sx={{ width: '100%' }} />

        {/* Notes */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Order Notes (Optional)"
            value={notes || ''}
            onChange={handleNotesChange}
            placeholder="Add any special instructions or notes for this order..."
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default PaymentMethod;
