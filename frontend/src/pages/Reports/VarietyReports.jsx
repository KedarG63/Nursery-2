/**
 * Variety Report — master table
 * One row per product variety (SKU): seeds bought → produced → in stock →
 * sold → revenue → price range → buyers. Click a row for the full 360°.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, TableSortLabel, TextField, InputAdornment, CircularProgress,
  Alert, Chip, Stack,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import { useNavigate } from 'react-router-dom';
import { getVarietyReport } from '../../services/reportService';
import PeriodPicker from '../../components/Accounting/PeriodPicker';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LEAF } from '../../utils/chartTheme';

const nf = (v) => Number(v || 0).toLocaleString('en-IN');

const COLUMNS = [
  { key: 'productName', label: 'Variety', numeric: false },
  { key: 'seedsBought', label: 'Seeds Bought', numeric: true },
  { key: 'producedQty', label: 'Produced', numeric: true },
  { key: 'currentStock', label: 'In Stock', numeric: true },
  { key: 'soldQty', label: 'Sold', numeric: true },
  { key: 'revenue', label: 'Revenue', numeric: true },
  { key: 'avgPrice', label: 'Selling Price', numeric: true },
  { key: 'buyerCount', label: 'Buyers', numeric: true },
  { key: 'lastSaleDate', label: 'Last Sale', numeric: true },
];

const VarietyReports = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [window_, setWindow] = useState({ from_date: null, to_date: null });
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (window_.from_date) params.from_date = window_.from_date;
      if (window_.to_date) params.to_date = window_.to_date;
      const res = await getVarietyReport(params);
      setRows(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load variety report');
    } finally {
      setLoading(false);
    }
  }, [window_]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          (r.variety || '').toLowerCase().includes(q) ||
          (r.skuCode || '').toLowerCase().includes(q)
      );
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [rows, search, sort]);

  const handleSort = (key) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} mb={3} spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <LocalFloristIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Variety Report</Typography>
            <Typography variant="body2" color="text.secondary">
              Every variety end to end: seeds bought → produced → in stock → sold → who bought it and at what price
            </Typography>
          </Box>
        </Stack>
        <PeriodPicker value={window_} onChange={setWindow} allowAllTime defaultPreset="all_time" />
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search by plant, variety or SKU code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          }}
        />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} align={c.numeric ? 'right' : 'left'} sortDirection={sort.key === c.key ? sort.dir : false}>
                    <TableSortLabel
                      active={sort.key === c.key}
                      direction={sort.key === c.key ? sort.dir : 'desc'}
                      onClick={() => handleSort(c.key)}
                    >
                      {c.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No varieties match</Typography>
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => (
                <TableRow
                  key={r.skuId}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/reports/varieties/${r.skuId}`)}
                >
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {r.productName}{r.variety && r.variety !== r.skuCode ? ` — ${r.variety}` : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{r.skuCode}</Typography>
                      </Box>
                      {!r.active && <Chip label="Inactive" size="small" variant="outlined" />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{nf(r.seedsBought)}</TableCell>
                  <TableCell align="right">{nf(r.producedQty)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: r.currentStock > 0 ? 'text.primary' : 'text.disabled' }}>
                    {nf(r.currentStock)}
                  </TableCell>
                  <TableCell align="right">{nf(r.soldQty)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: LEAF }}>{formatCurrency(r.revenue)}</TableCell>
                  <TableCell align="right">
                    {r.avgPrice === null ? (
                      <Typography variant="caption" color="text.disabled">no sales</Typography>
                    ) : (
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{formatCurrency(r.avgPrice)}</Typography>
                        {r.minPrice !== r.maxPrice && (
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(r.minPrice)} – {formatCurrency(r.maxPrice)}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">{r.buyerCount}</TableCell>
                  <TableCell align="right">
                    {r.lastSaleDate ? formatDate(r.lastSaleDate) : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default VarietyReports;
