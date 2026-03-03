import React, { useState } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Alert, CircularProgress, Stack,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { getAgingReport } from '../../services/invoiceService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const COLUMNS = [
  { key: 'customer_name', label: 'Customer' },
  { key: 'current_due',   label: 'Current',  money: true },
  { key: 'aged_1_30',     label: '1–30 Days', money: true },
  { key: 'aged_31_60',    label: '31–60 Days', money: true },
  { key: 'aged_61_90',    label: '61–90 Days', money: true },
  { key: 'aged_over_90',  label: '90+ Days',  money: true },
  { key: 'total_outstanding', label: 'Total Outstanding', money: true },
];

const CustomerAgingReport = () => {
  const [asOfDate, setAsOfDate] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ran, setRan] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAgingReport({ as_of_date: format(asOfDate, 'yyyy-MM-dd') });
      setRows(result.data || []);
      setRan(true);
    } catch (err) {
      setError(err?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const totals = COLUMNS.slice(1).reduce((acc, col) => {
    acc[col.key] = rows.reduce((s, r) => s + parseFloat(r[col.key] || 0), 0);
    return acc;
  }, {});

  const handleExport = () => {
    const data = rows.map((r) => ({
      'Customer Code': r.customer_code,
      'Customer': r.customer_name,
      'Current': parseFloat(r.current_due || 0),
      '1-30 Days': parseFloat(r.aged_1_30 || 0),
      '31-60 Days': parseFloat(r.aged_31_60 || 0),
      '61-90 Days': parseFloat(r.aged_61_90 || 0),
      '90+ Days': parseFloat(r.aged_over_90 || 0),
      'Total Outstanding': parseFloat(r.total_outstanding || 0),
    }));
    data.push({
      'Customer Code': '',
      'Customer': 'TOTAL',
      'Current': totals.current_due,
      '1-30 Days': totals.aged_1_30,
      '31-60 Days': totals.aged_31_60,
      '61-90 Days': totals.aged_61_90,
      '90+ Days': totals.aged_over_90,
      'Total Outstanding': totals.total_outstanding,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AR Aging');
    XLSX.writeFile(wb, `AR-Aging-${format(asOfDate, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Accounts Receivable Aging
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              As of Date
            </Typography>
            <DatePicker
              selected={asOfDate}
              onChange={setAsOfDate}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              customInput={
                <input
                  readOnly
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    fontSize: 14,
                    cursor: 'pointer',
                    width: 140,
                  }}
                />
              }
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleRun}
            disabled={loading}
            sx={{ mt: { xs: 0, sm: 2.5 } }}
          >
            {loading ? 'Running…' : 'Run Report'}
          </Button>
          {ran && rows.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              sx={{ mt: { xs: 0, sm: 2.5 } }}
            >
              Export Excel
            </Button>
          )}
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}

      {!loading && ran && (
        rows.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No outstanding invoices as of {formatDate(asOfDate)}.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, backgroundColor: 'grey.100' } }}>
                  <TableCell>Customer Code</TableCell>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key} align={col.money ? 'right' : 'left'}>
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.customer_code}</TableCell>
                    {COLUMNS.map((col) => (
                      <TableCell key={col.key} align={col.money ? 'right' : 'left'}>
                        {col.money
                          ? (parseFloat(row[col.key] || 0) > 0
                              ? (col.key === 'total_outstanding'
                                  ? <Typography variant="body2" fontWeight={700} color="error.main">{formatCurrency(row[col.key])}</Typography>
                                  : formatCurrency(row[col.key]))
                              : <Typography variant="body2" color="text.disabled">—</Typography>)
                          : row[col.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {/* Grand total row */}
                <TableRow sx={{ '& td': { fontWeight: 700, backgroundColor: 'grey.50', borderTop: '2px solid #ccc' } }}>
                  <TableCell>TOTAL</TableCell>
                  <TableCell />
                  {COLUMNS.slice(1).map((col) => (
                    <TableCell key={col.key} align="right">
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        color={col.key === 'total_outstanding' ? 'error.main' : 'text.primary'}
                      >
                        {formatCurrency(totals[col.key])}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}
    </Box>
  );
};

export default CustomerAgingReport;
