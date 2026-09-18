import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  MenuItem,
  CircularProgress,
  Link,
  Alert,
  Button,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import customerReturnService from '../../services/customerReturnService';
import ReturnSettlementDialog from '../../components/Orders/ReturnSettlementDialog';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

/**
 * CustomerReturnsList
 *
 * Every return across all orders. The reason this page exists rather than
 * leaving returns on their order: an accepted return with money still owed back
 * is an open liability, and it is invisible if you have to know which order to
 * look at. The "Owed back" filter is the working list for clearing them.
 */
const CustomerReturnsList = () => {
  const { user } = useSelector((state) => state.auth);
  const canWrite = user?.roles?.some((r) => ['Admin', 'Manager'].includes(r));

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [onlyOwed, setOnlyOwed] = useState(false);
  const [settling, setSettling] = useState(null);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerReturnService.listReturns({
        page: page + 1,
        limit: rowsPerPage,
        ...(status ? { status } : {}),
      });
      setReturns(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      toast.error('Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, status]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  // Filtered client-side: "owed back" is derived from open_balance, which the
  // list endpoint already computes, so it needs no extra query parameter.
  const visible = onlyOwed
    ? returns.filter((r) => r.status === 'accepted' && parseFloat(r.open_balance || 0) > 0.005)
    : returns;

  const owedCount = returns.filter(
    (r) => r.status === 'accepted' && parseFloat(r.open_balance || 0) > 0.005
  ).length;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>Customer Returns</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Plants brought back by customers. Accepting a return restocks it and
        cancels any unpaid balance on its order first; only what the customer
        already paid for is refunded or kept as store credit.
      </Typography>

      {owedCount > 0 && !onlyOwed && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setOnlyOwed(true)}>
              Show them
            </Button>
          }
        >
          {owedCount} return{owedCount === 1 ? ' has' : 's have'} money still owed back
          to the customer on this page.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="accepted">Accepted</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </TextField>

          <Button
            size="small"
            variant={onlyOwed ? 'contained' : 'outlined'}
            color="warning"
            onClick={() => setOnlyOwed((v) => !v)}
          >
            {onlyOwed ? 'Showing only owed back' : 'Owed back only'}
          </Button>
        </Box>
      </Paper>

      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Return #</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Order</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Offset</TableCell>
                    <TableCell align="right">Refunded</TableCell>
                    <TableCell align="right">Store Credit</TableCell>
                    <TableCell align="right">Owed Back</TableCell>
                    <TableCell>Status</TableCell>
                    {canWrite && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canWrite ? 11 : 10} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          {onlyOwed ? 'Nothing is owed back — every return is settled.' : 'No returns found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((r) => {
                      const owed = parseFloat(r.open_balance || 0);
                      return (
                        <TableRow key={r.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{r.return_number}</Typography>
                          </TableCell>
                          <TableCell>{formatDate(r.return_date)}</TableCell>
                          <TableCell>{r.customer_name}</TableCell>
                          <TableCell>
                            <Link component={RouterLink} to={`/orders/${r.order_id}`} underline="hover">
                              {r.order_number}
                            </Link>
                          </TableCell>
                          <TableCell align="right">
                            {r.status === 'accepted' ? formatCurrency(r.return_amount) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {parseFloat(r.offset_total || 0) > 0 ? formatCurrency(r.offset_total) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {parseFloat(r.refund_total || 0) > 0 ? formatCurrency(r.refund_total) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {parseFloat(r.store_credit_total || 0) > 0 ? formatCurrency(r.store_credit_total) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {owed > 0.005 ? (
                              <Typography variant="body2" color="warning.main" fontWeight={700}>
                                {formatCurrency(owed)}
                              </Typography>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={customerReturnService.getStatusLabel(r.status)}
                              color={customerReturnService.getStatusColor(r.status)}
                            />
                          </TableCell>
                          {canWrite && (
                            <TableCell align="right">
                              {r.status === 'accepted' && owed > 0.005 && (
                                <Button size="small" variant="outlined" color="warning" onClick={() => setSettling(r)}>
                                  Settle
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50, 100]}
            />
          </>
        )}
      </Paper>

      <ReturnSettlementDialog
        open={Boolean(settling)}
        returnNote={settling}
        onClose={() => setSettling(null)}
        onSettled={(result) => {
          toast.success(result?.message || 'Return settled');
          fetchReturns();
        }}
      />
    </Container>
  );
};

export default CustomerReturnsList;
