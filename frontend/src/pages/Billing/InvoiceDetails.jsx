import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Grid, Chip, Stack, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, CircularProgress, Breadcrumbs, Link, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PrintIcon from '@mui/icons-material/Print';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { getInvoice, issueInvoice, voidInvoice, removePayment, openInvoicePDF } from '../../services/invoiceService';
import BillingStatusBadge from '../../components/Billing/BillingStatusBadge';
import InvoiceItemsTable from '../../components/Billing/InvoiceItemsTable';
import ApplyPaymentModal from '../../components/Billing/ApplyPaymentModal';
import { formatCurrency, formatDate } from '../../utils/formatters';

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const fetchInvoice = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getInvoice(id);
      setInvoice(result.data);
    } catch (err) {
      setError(err?.message || 'Failed to load invoice');
      if (err?.status === 404) navigate('/billing/invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  const handleIssue = async () => {
    setActionLoading(true);
    try {
      await issueInvoice(id);
      toast.success('Invoice issued successfully');
      setIssueDialogOpen(false);
      fetchInvoice();
    } catch (err) {
      toast.error(err?.message || 'Failed to issue invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoid = async () => {
    setActionLoading(true);
    try {
      await voidInvoice(id);
      toast.success('Invoice voided');
      setVoidDialogOpen(false);
      fetchInvoice();
    } catch (err) {
      toast.error(err?.message || 'Failed to void invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemovePayment = async (paymentId) => {
    if (!window.confirm('Remove this payment application?')) return;
    try {
      await removePayment(id, paymentId);
      toast.success('Payment removed');
      fetchInvoice();
    } catch (err) {
      toast.error(err?.message || 'Failed to remove payment');
    }
  };

  const handlePDF = async () => {
    try {
      await openInvoicePDF(id);
    } catch {
      toast.error('Could not open invoice PDF');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
  }

  if (!invoice) return null;

  const canVoid = isAdmin && ['draft', 'issued', 'partially_paid'].includes(invoice.status);
  const canIssue = isAdmin && invoice.status === 'draft';
  const canApplyPayment = ['issued', 'partially_paid'].includes(invoice.status);

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/billing/invoices" underline="hover" color="inherit">
          Invoices
        </Link>
        <Typography color="text.primary">{invoice.invoice_number}</Typography>
      </Breadcrumbs>

      {/* Header Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/billing/invoices')} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>{invoice.invoice_number}</Typography>
          <BillingStatusBadge status={invoice.status} />
        </Box>
        <Stack direction="row" spacing={1}>
          {canIssue && (
            <Button
              startIcon={<CheckCircleIcon />}
              variant="contained"
              color="success"
              size="small"
              onClick={() => setIssueDialogOpen(true)}
            >
              Issue Invoice
            </Button>
          )}
          {canVoid && (
            <Button
              startIcon={<BlockIcon />}
              variant="outlined"
              color="error"
              size="small"
              onClick={() => setVoidDialogOpen(true)}
            >
              Void
            </Button>
          )}
          <Tooltip title="PDF / Print">
            <Button startIcon={<PictureAsPdfIcon />} variant="outlined" size="small" onClick={handlePDF}>
              PDF
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* Info Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Customer */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary">Customer</Typography>
            <Typography variant="subtitle1" fontWeight={600}>{invoice.customer_name}</Typography>
            <Typography variant="body2" color="text.secondary">{invoice.customer_code}</Typography>
            {invoice.customer_phone && <Typography variant="body2">{invoice.customer_phone}</Typography>}
            {invoice.customer_email && <Typography variant="body2">{invoice.customer_email}</Typography>}
            {invoice.customer_gst && (
              <Typography variant="body2" sx={{ mt: 1 }}>GSTIN: <strong>{invoice.customer_gst}</strong></Typography>
            )}
          </Paper>
        </Grid>

        {/* Dates */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="overline" color="text.secondary">Dates</Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">Invoice Date</Typography>
              <Typography variant="subtitle2">{formatDate(invoice.invoice_date)}</Typography>
            </Box>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">Due Date</Typography>
              <Typography
                variant="subtitle2"
                color={
                  invoice.status !== 'paid' && new Date(invoice.due_date) < new Date()
                    ? 'error.main'
                    : 'text.primary'
                }
              >
                {formatDate(invoice.due_date)}
              </Typography>
            </Box>
            {invoice.order_number && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">Order</Typography>
                <Typography variant="subtitle2">{invoice.order_number}</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Financials */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%', bgcolor: 'grey.50' }}>
            <Typography variant="overline" color="text.secondary">Summary</Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                <Typography variant="body2">{formatCurrency(invoice.subtotal_amount)}</Typography>
              </Box>
              {parseFloat(invoice.discount_amount) > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Discount</Typography>
                  <Typography variant="body2" color="success.main">-{formatCurrency(invoice.discount_amount)}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">GST ({invoice.tax_rate}%)</Typography>
                <Typography variant="body2">{formatCurrency(invoice.tax_amount)}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" fontWeight={700}>Total</Typography>
                <Typography variant="subtitle2" fontWeight={700}>{formatCurrency(invoice.total_amount)}</Typography>
              </Box>
              {parseFloat(invoice.paid_amount) > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="success.main">Paid</Typography>
                  <Typography variant="body2" color="success.main">-{formatCurrency(invoice.paid_amount)}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" color={parseFloat(invoice.balance_amount) > 0 ? 'error.main' : 'text.secondary'}>
                  Balance Due
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color={parseFloat(invoice.balance_amount) > 0 ? 'error.main' : 'text.secondary'}>
                  {formatCurrency(invoice.balance_amount)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Line Items */}
      <Typography variant="h6" sx={{ mb: 1 }}>Line Items</Typography>
      <InvoiceItemsTable items={invoice.items || []} editable={false} />

      {/* Applied Payments */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">Applied Payments</Typography>
          {canApplyPayment && (
            <Button
              startIcon={<AddIcon />}
              size="small"
              variant="outlined"
              onClick={() => setApplyModalOpen(true)}
            >
              Apply Payment
            </Button>
          )}
        </Box>

        {invoice.applied_payments?.length === 0 ? (
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography color="text.secondary" variant="body2">No payments applied yet.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600 } }}>
                  <TableCell>Transaction ID</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Payment Date</TableCell>
                  <TableCell>Applied By</TableCell>
                  <TableCell align="right">Amount Applied</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.applied_payments?.map((ap) => (
                  <TableRow key={ap.id}>
                    <TableCell><Typography variant="body2" fontWeight={500}>{ap.transaction_id}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{ap.payment_method?.toUpperCase()}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{formatDate(ap.payment_date)}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{ap.applied_by_name || '—'}</Typography></TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} color="success.main">
                        {formatCurrency(ap.amount_applied)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {isAdmin && invoice.status !== 'void' && (
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => handleRemovePayment(ap.payment_id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms_and_conditions) && (
        <Box sx={{ mt: 3 }}>
          {invoice.notes && (
            <Paper sx={{ p: 2, mb: 1 }}>
              <Typography variant="overline" color="text.secondary">Notes</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{invoice.notes}</Typography>
            </Paper>
          )}
          {invoice.terms_and_conditions && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">Terms &amp; Conditions</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{invoice.terms_and_conditions}</Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Apply Payment Modal */}
      <ApplyPaymentModal
        open={applyModalOpen}
        invoiceId={id}
        customerId={invoice.customer_id}
        balanceDue={parseFloat(invoice.balance_amount)}
        onClose={() => setApplyModalOpen(false)}
        onSuccess={fetchInvoice}
      />

      {/* Issue Confirmation */}
      <Dialog open={issueDialogOpen} onClose={() => setIssueDialogOpen(false)}>
        <DialogTitle>Issue Invoice?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will issue <strong>{invoice.invoice_number}</strong> for{' '}
            <strong>{formatCurrency(invoice.total_amount)}</strong>. Once issued, items cannot be edited.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueDialogOpen(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleIssue} disabled={actionLoading}>
            {actionLoading ? 'Issuing…' : 'Issue Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Void Confirmation */}
      <Dialog open={voidDialogOpen} onClose={() => setVoidDialogOpen(false)}>
        <DialogTitle>Void Invoice?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to void <strong>{invoice.invoice_number}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidDialogOpen(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleVoid} disabled={actionLoading}>
            {actionLoading ? 'Voiding…' : 'Void Invoice'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceDetails;
