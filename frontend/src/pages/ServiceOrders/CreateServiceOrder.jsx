import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Breadcrumbs,
  Link,
  Card,
  CardContent,
  Grid,
  TextField,
  MenuItem,
  InputAdornment,
  Divider,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import CustomerSelect from '../../components/Orders/CustomerSelect';
import { createServiceOrder } from '../../services/serviceOrderService';

/**
 * Create Service Order Page
 * Simple single form (no SKUs/lots/availability): pick customer, describe the
 * grow job (customer's own seeds), set a flat service fee and optional advance.
 */
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const CreateServiceOrder = () => {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [serviceFee, setServiceFee] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('cash');
  const [startDate, setStartDate] = useState('');
  const [expectedReadyDate, setExpectedReadyDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    if (!customer) {
      toast.error('Please select a customer');
      return false;
    }
    if (!description.trim()) {
      toast.error('Please describe what is being grown');
      return false;
    }
    const fee = parseFloat(serviceFee);
    if (isNaN(fee) || fee < 0) {
      toast.error('Please enter a valid service fee');
      return false;
    }
    if (advanceAmount && parseFloat(advanceAmount) > fee) {
      toast.error('Advance cannot exceed the service fee');
      return false;
    }
    if (startDate && expectedReadyDate && expectedReadyDate < startDate) {
      toast.error('Expected ready date cannot be before the start date');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      const payload = {
        customer_id: customer.id,
        description: description.trim(),
        quantity: quantity ? parseInt(quantity, 10) : null,
        service_fee: parseFloat(serviceFee),
        advance_amount: advanceAmount ? parseFloat(advanceAmount) : 0,
        advance_method: advanceMethod,
        start_date: startDate || null,
        expected_ready_date: expectedReadyDate || null,
        notes: notes.trim() || null,
      };
      const response = await createServiceOrder(payload);
      toast.success('Service order created successfully');
      const created = response.data;
      navigate(`/service-orders/${created.id}`);
    } catch (error) {
      console.error('Error creating service order:', error);
      toast.error(error.message || 'Failed to create service order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/service-orders" underline="hover" color="inherit">
          Service Orders
        </Link>
        <Typography color="text.primary">New</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/service-orders')} variant="outlined">
          Back
        </Button>
        <Typography variant="h4">New Service Order</Typography>
      </Box>

      <Card>
        <CardContent>
          {/* Customer */}
          <CustomerSelect selectedCustomer={customer} onCustomerSelect={setCustomer} />

          <Divider sx={{ my: 3 }} />

          {/* Job details */}
          <Typography variant="h6" gutterBottom>
            Grow Job Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                minRows={2}
                label="Description"
                placeholder="What is being grown? (e.g. Customer's own tomato seeds, 4 trays)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Quantity (optional)"
                placeholder="e.g. number of trays/plants"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputProps={{ min: 1 }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                type="number"
                label="Service Fee (flat)"
                value={serviceFee}
                onChange={(e) => setServiceFee(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                }}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Expected Ready Date"
                value={expectedReadyDate}
                onChange={(e) => setExpectedReadyDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Advance payment */}
          <Typography variant="h6" gutterBottom>
            Advance Payment (optional)
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Advance Amount"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                }}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Payment Method"
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value)}
                disabled={!advanceAmount}
              >
                {PAYMENT_METHODS.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate('/service-orders')} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Service Order'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};

export default CreateServiceOrder;
