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
import { getAgingReport } from '../../services/vendorBillService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const COLUMNS = [
  { key: 'vendor_name',       label: 'Vendor' },
  { key: 'no_due_date',       label: 'No Due Date',     money: true },
  { key: 'current_due',       label: 'Overdue',         money: true, alert: true },
  { key: 'aged_1_30',         label: 'Due 0–30 Days',   money: true },
  { key: 'aged_31_60',        label: 'Due 31–60 Days',  money: true },
  { key: 'aged_61_90',        label: 'Due 61–90 Days',  money: true },
  { key: 'aged_over_90',      label: 'Due 90+ Days',    money: true },
  { key: 'total_outstanding', label: 'Total Outstanding', money: true },
];

const VendorAgingReport = () => {
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
      'Vendor Code': r.vendor_code,
      'Vendor': r.vendor_name,
      'No Due Date': parseFloat(r.no_due_date || 0),
      'Overdue': parseFloat(r.current_due || 0),
      'Due 0-30 Days': parseFloat(r.aged_1_30 || 0),
      'Due 31-60 Days': parseFloat(r.aged_31_60 || 0),
      'Due 61-90 Days': parseFloat(r.aged_61_90 || 0),
      'Due 90+ Days': parseFloat(r.aged_over_90 || 0),
      'Total Outstanding': parseFloat(r.total_outstanding || 0),
    }));
    data.push({
      'Vendor Code': '',
      'Vendor': 'TOTAL',
      'No Due Date': totals.no_due_date,
      'Overdue': totals.current_due,
      'Due 0-30 Days': totals.aged_1_30,
      'Due 31-60 Days': totals.aged_31_60,
      'Due 61-90 Days': totals.aged_61_90,
      'Due 90+ Days': totals.aged_over_90,
      'Total Outstanding': totals.total_outstanding,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AP Aging');
    XLSX.writeFile(wb, `AP-Aging-${format(asOfDate, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Accounts Payable Aging
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
            <Typography color="text.secondary">No outstanding vendor bills as of {formatDate(asOfDate)}.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, backgroundColor: 'grey.100' } }}>
                  <TableCell>Vendor Code</TableCell>
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
                    <TableCell>{row.vendor_code}</TableCell>
                    {COLUMNS.map((col) => (
                      <TableCell key={col.key} align={col.money ? 'right' : 'left'}>
                        {col.money
                          ? (parseFloat(row[col.key] || 0) > 0
                              ? (col.key === 'total_outstanding' || col.key === 'current_due'
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

export default VendorAgingReport;
