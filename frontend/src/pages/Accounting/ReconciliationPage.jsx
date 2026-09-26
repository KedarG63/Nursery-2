import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as PassIcon,
  Error as FailIcon,
  Warning as WarnIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import reconciliationService from '../../services/reconciliationService';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v || 0);

// Columns whose values are money, so they render right-aligned and formatted.
const MONEY_COLUMNS = new Set([
  'return_amount', 'settled', 'excess', 'stored', 'should_be', 'difference',
  'amount', 'ledger_total', 'issued', 'applied', 'balance', 'total_amount',
  'paid_amount', 'credit_applied', 'owed_back', 'open_balance',
  'bill_total', 'applied_to_invoice',
]);

// Internal identifiers never reach the screen — they mean nothing to the people
// reading this page, and a raw uuid in a table just looks like something broke.
const HIDDEN_COLUMNS = new Set([
  'id', 'customer_id', 'return_item_id', 'source_id', 'source_type',
]);

// Column names are written for people, not copied from the database.
const COLUMN_LABELS = {
  return_number: 'Return No.',
  purchase_number: 'Bill No.',
  order_number: 'Order No.',
  customer_name: 'Customer',
  vendor_name: 'Vendor',
  return_amount: 'Return Value',
  settled: 'Settled',
  excess: 'Over-settled By',
  stored: 'Shown On Record',
  should_be: 'Should Be',
  difference: 'Difference',
  amount: 'Amount',
  ledger_entries: 'Entries Found',
  ledger_total: 'Amount In Ledger',
  settlement_date: 'Date',
  payment_source: 'Paid By',
  entry_date: 'Date',
  narration: 'Description',
  issued: 'Credit Given',
  applied: 'Credit Spent',
  balance: 'Balance',
  total_amount: 'Order Total',
  paid_amount: 'Paid',
  credit_applied: 'Credit Applied',
  owed_back: 'Owed Back',
  open_balance: 'Still Owed',
  accepted_at: 'Accepted On',
  return_date: 'Return Date',
  sku_code: 'Variety Code',
  quantity: 'Quantity',
  billed_on: 'Billed On',
  bill_total: 'Bill',
  payments: 'Payments',
  receipt_number: 'Receipt / UTR',
  problem: 'Problem',
  ledger: 'Book',
  invoice_number: 'Invoice No.',
  applied_to_invoice: 'Shown On Invoice',
};

const prettyColumn = (key) =>
  COLUMN_LABELS[key]
  || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const SEVERITY = {
  critical: { color: 'error', Icon: FailIcon, label: 'Must be fixed' },
  warning: { color: 'warning', Icon: WarnIcon, label: 'Worth checking' },
  info: { color: 'info', Icon: InfoIcon, label: 'For information' },
};

/**
 * ReconciliationPage
 *
 * One page that answers: "are the books exactly right, and if not, which rows?"
 *
 * Findings are listed as rows, never as counts alone — a count tells you
 * something is wrong, a row tells you what to fix.
 */
const ReconciliationPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reconciliationService.getReturnsReconciliation();
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to run the reconciliation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const renderRows = (check) => {
    if (check.rows.length === 0) return null;
    const columns = Object.keys(check.rows[0]).filter((c) => !HIDDEN_COLUMNS.has(c));

    return (
      <TableContainer sx={{ maxHeight: 420 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c} align={MONEY_COLUMNS.has(c) ? 'right' : 'left'}>
                  {prettyColumn(c)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {check.rows.map((row, i) => (
              <TableRow key={row.id || i} hover>
                {columns.map((c) => (
                  <TableCell key={c} align={MONEY_COLUMNS.has(c) ? 'right' : 'left'}>
                    {MONEY_COLUMNS.has(c)
                      ? formatCurrency(row[c])
                      : (row[c] === null || row[c] === undefined ? '—' : String(row[c]))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          The reconciliation could not be run.
          <Button size="small" onClick={fetchReport} sx={{ ml: 2 }}>Try again</Button>
        </Alert>
      </Container>
    );
  }

  const { summary, checks } = data;
  const problems = checks.filter((c) => c.severity !== 'info' && c.passed === false);
  const errored = checks.filter((c) => c.passed === null);
  const clean = checks.filter((c) => c.passed === true);
  const informational = checks.filter((c) => c.severity === 'info' && c.passed === false);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Typography variant="h4">Returns Reconciliation</Typography>
          <Typography variant="body2" color="text.secondary">
            Every figure below is worked out again from the original returns, refunds and
            payments, then compared with what the system is showing.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchReport}>
          Run Again
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Generated {new Date(summary.generated_at).toLocaleString('en-IN')}
      </Typography>

      {/* Headline verdict */}
      <Box sx={{ mt: 2, mb: 3 }}>
        {summary.balanced ? (
          <Alert severity="success" icon={<PassIcon />}>
            <AlertTitle>The books balance</AlertTitle>
            All {summary.checks_run} checks passed. Every refund is recorded in the cash book
            or bank ledger, every order balance matches the returns behind it, and nothing has
            been settled for more than it is worth.
          </Alert>
        ) : (
          <Alert severity={summary.critical > 0 ? 'error' : 'warning'}>
            <AlertTitle>
              {summary.problems} check{summary.problems === 1 ? '' : 's'} found a mismatch
            </AlertTitle>
            {summary.critical > 0 && (
              <>{summary.critical} of them affect money directly and should be fixed before the next close. </>
            )}
            The affected records are listed below.
          </Alert>
        )}
      </Box>

      {/* Money at stake */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">Checks Passed</Typography>
            <Typography variant="h5" color={summary.balanced ? 'success.main' : 'text.primary'}>
              {summary.checks_passed} / {summary.checks_run}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">Owed Back to Customers</Typography>
            <Typography variant="h5" color="warning.main">
              {formatCurrency(summary.owed_to_customers)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Accepted returns not yet refunded or credited
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">Owed to Us by Vendors</Typography>
            <Typography variant="h5" color="info.main">
              {formatCurrency(summary.owed_by_vendors)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Return credit not yet taken or paid back
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">Mismatches</Typography>
            <Typography variant="h5" color={summary.problems > 0 ? 'error.main' : 'success.main'}>
              {summary.problems}
            </Typography>
            {summary.checks_errored > 0 && (
              <Typography variant="caption" color="error.main">
                {summary.checks_errored} could not be completed
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Anything wrong, first */}
      {[...errored, ...problems].map((check) => {
        const sev = SEVERITY[check.severity] || SEVERITY.warning;
        return (
          <Accordion key={check.key} defaultExpanded sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                <sev.Icon color={sev.color} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{check.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{check.explain}</Typography>
                </Box>
                <Chip
                  size="small"
                  color={sev.color}
                  label={check.passed === null ? 'Could not run' : `${check.count} found`}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {check.passed === null
                ? <Alert severity="error">{check.error}</Alert>
                : renderRows(check)}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Open balances — real, expected, but worth watching */}
      {informational.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>Open Balances</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These are not errors. They are money still owed in one direction or the
            other, listed so nothing sits forgotten.
          </Typography>
          {informational.map((check) => (
            <Accordion key={check.key} sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                  <InfoIcon color="info" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1">{check.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{check.explain}</Typography>
                  </Box>
                  <Chip size="small" color="info" label={`${check.count}`} />
                </Box>
              </AccordionSummary>
              <AccordionDetails>{renderRows(check)}</AccordionDetails>
            </Accordion>
          ))}
        </>
      )}

      {/* What passed — collapsed, but present, so the report is complete */}
      {clean.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>What Was Checked</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each of these was confirmed correct.
          </Typography>
          <Paper sx={{ p: 2 }}>
            {clean.map((check) => (
              <Box key={check.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75 }}>
                <PassIcon color="success" fontSize="small" />
                {/* The reassuring label, never the problem wording — these passed,
                    and describing the failure here reads as an accusation. */}
                <Typography variant="body2">{check.verified || check.title}</Typography>
              </Box>
            ))}
          </Paper>
        </>
      )}
    </Container>
  );
};

export default ReconciliationPage;
