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
} from '@mui/material';

/**
 * Payment Method Component
 * Select payment method and terms
 * Issue #57: Order creation wizard - Step 4
 */
const PaymentMethod = ({ paymentMethod, notes, onPaymentChange }) => {
  const handleMethodChange = (event) => {
    onPaymentChange('paymentMethod', event.target.value);
  };

  const handleNotesChange = (event) => {
    onPaymentChange('notes', event.target.value);
  };

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
