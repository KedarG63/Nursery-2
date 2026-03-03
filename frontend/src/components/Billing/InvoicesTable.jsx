import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography, IconButton, Tooltip, Skeleton, Box,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useNavigate } from 'react-router-dom';
import BillingStatusBadge from './BillingStatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { openInvoicePDF } from '../../services/invoiceService';

const InvoicesTable = ({ invoices, loading }) => {
  const navigate = useNavigate();

  const handlePDF = async (e, id) => {
    e.stopPropagation();
    try {
      await openInvoicePDF(id);
    } catch {
      // silently ignore — new tab blocked or fetch failed
    }
  };

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(9)].map((__, j) => (
                  <TableCell key={j}><Skeleton /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No invoices found.</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50' } }}>
            <TableCell>Invoice #</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Order #</TableCell>
            <TableCell>Invoice Date</TableCell>
            <TableCell>Due Date</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Paid</TableCell>
            <TableCell align="right">Balance</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((inv) => {
            const isOverdue =
              inv.status !== 'paid' &&
              inv.status !== 'void' &&
              inv.status !== 'draft' &&
              new Date(inv.due_date) < new Date();

            return (
              <TableRow
                key={inv.id}
                hover
                onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Typography variant="body2" fontWeight={600} color="primary">
                    {inv.invoice_number}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{inv.customer_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{inv.customer_code}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{inv.order_number || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(inv.invoice_date)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={isOverdue ? 'error.main' : 'text.primary'}
                    fontWeight={isOverdue ? 600 : 400}
                  >
                    {formatDate(inv.due_date)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{formatCurrency(inv.total_amount)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="success.main">{formatCurrency(inv.paid_amount)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight={parseFloat(inv.balance_amount) > 0 ? 600 : 400}
                    color={parseFloat(inv.balance_amount) > 0 ? 'error.main' : 'text.secondary'}
                  >
                    {formatCurrency(inv.balance_amount)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <BillingStatusBadge status={inv.status} />
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="View">
                    <IconButton size="small" onClick={() => navigate(`/billing/invoices/${inv.id}`)}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="PDF / Print">
                    <IconButton size="small" onClick={(e) => handlePDF(e, inv.id)}>
                      <PictureAsPdfIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default InvoicesTable;
