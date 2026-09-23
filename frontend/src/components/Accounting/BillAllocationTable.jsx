import { Fragment, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Checkbox, TextField, Chip, Typography, Box,
} from '@mui/material';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * BillAllocationTable
 *
 * The vendor's open bills, each with an "Adjust" amount — the part of this
 * payment that settles it (Tally's "Agst Ref"). Seed invoices are stored as
 * one row per product, so rows sharing an invoice number are grouped under one
 * header that can be ticked as a whole.
 *
 * Props:
 *   bills       – rows from GET /vendor-payments/vendors/:id/open-bills
 *   allocations – { [billKey]: string }  amount typed per bill
 *   onChange    – (nextAllocations) => void
 *   disabled    – boolean
 */

export const billKey = (b) => `${b.bill_type}:${b.bill_id}`;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Fill bills oldest first until `amount` runs out. Bills arrive pre-sorted. */
export const autoAllocate = (bills, amount) => {
  let left = round2(amount) || 0;
  const next = {};
  for (const b of bills) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Number(b.balance)));
    if (take > 0) {
      next[billKey(b)] = String(take);
      left = round2(left - take);
    }
  }
  return next;
};

export const allocatedTotal = (allocations) =>
  round2(Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0));

/** Rows whose amount exceeds the bill's balance or is negative. */
export const invalidAllocations = (bills, allocations) =>
  bills.filter((b) => {
    const v = Number(allocations[billKey(b)] || 0);
    return v < 0 || v > Number(b.balance) + 0.005;
  });

/** API payload: only bills with a positive amount. */
export const allocationPayload = (bills, allocations) =>
  bills
    .map((b) => ({ bill_type: b.bill_type, bill_id: b.bill_id, amount: round2(allocations[billKey(b)] || 0) }))
    .filter((a) => a.amount > 0);

// Group seed rows sharing an invoice number; everything else stands alone.
const groupBills = (bills) => {
  const groups = [];
  const byKey = new Map();
  for (const b of bills) {
    const key = b.bill_type === 'seed' && b.invoice_number ? `inv:${b.invoice_number}` : billKey(b);
    if (!byKey.has(key)) {
      const g = { key, invoice: b.bill_type === 'seed' ? b.invoice_number : null, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).rows.push(b);
  }
  return groups;
};

const BillAllocationTable = ({ bills, allocations, onChange, disabled = false }) => {
  const groups = useMemo(() => groupBills(bills), [bills]);

  const setRow = (b, value) => onChange({ ...allocations, [billKey(b)]: value });

  const toggleRows = (rows, checked) => {
    const next = { ...allocations };
    rows.forEach((b) => { next[billKey(b)] = checked ? String(round2(b.balance)) : ''; });
    onChange(next);
  };

  if (bills.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No unpaid bills for this vendor.</Typography>
      </Paper>
    );
  }

  const renderRow = (b, nested) => {
    const value = allocations[billKey(b)] ?? '';
    const num = Number(value) || 0;
    const over = num > Number(b.balance) + 0.005;
    return (
      <TableRow key={billKey(b)} hover selected={num > 0}>
        <TableCell padding="checkbox">
          <Checkbox
            size="small"
            checked={num > 0}
            disabled={disabled}
            onChange={(e) => toggleRows([b], e.target.checked)}
          />
        </TableCell>
        <TableCell sx={nested ? { pl: 4 } : undefined}>
          <Typography variant="body2" fontWeight={500}>{b.purchase_number}</Typography>
          <Typography variant="caption" color="text.secondary">{b.description || '—'}</Typography>
        </TableCell>
        <TableCell>{nested ? '' : (b.invoice_number || '—')}</TableCell>
        <TableCell>{formatDate(b.bill_date, 'DD MMM YYYY')}</TableCell>
        <TableCell>
          <Chip
            size="small"
            variant="outlined"
            label={b.bill_type === 'seed' ? 'Seeds' : 'Supplies'}
            color={b.bill_type === 'seed' ? 'success' : 'info'}
          />
        </TableCell>
        <TableCell align="right">{formatCurrency(b.grand_total)}</TableCell>
        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(b.balance)}</TableCell>
        <TableCell align="right" sx={{ width: 150 }}>
          <TextField
            size="small"
            type="number"
            value={value}
            disabled={disabled}
            error={over}
            helperText={over ? 'More than due' : ''}
            onChange={(e) => setRow(b, e.target.value)}
            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
            placeholder="0.00"
          />
        </TableCell>
      </TableRow>
    );
  };

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50' } }}>
            <TableCell padding="checkbox">
              <Checkbox
                size="small"
                disabled={disabled}
                checked={bills.every((b) => Number(allocations[billKey(b)]) >= Number(b.balance) - 0.005)}
                indeterminate={
                  bills.some((b) => Number(allocations[billKey(b)]) > 0)
                  && !bills.every((b) => Number(allocations[billKey(b)]) >= Number(b.balance) - 0.005)
                }
                onChange={(e) => toggleRows(bills, e.target.checked)}
              />
            </TableCell>
            <TableCell>Bill</TableCell>
            <TableCell>Invoice #</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Bill Total</TableCell>
            <TableCell align="right">Due</TableCell>
            <TableCell align="right">Adjust</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g) => {
            if (g.rows.length === 1) return renderRow(g.rows[0], false);
            const due = round2(g.rows.reduce((s, b) => s + Number(b.balance), 0));
            const adj = round2(g.rows.reduce((s, b) => s + (Number(allocations[billKey(b)]) || 0), 0));
            const full = adj >= due - 0.005;
            return (
              <Fragment key={g.key}>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      disabled={disabled}
                      checked={full}
                      indeterminate={adj > 0 && !full}
                      onChange={(e) => toggleRows(g.rows, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell colSpan={2}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" fontWeight={600}>Invoice {g.invoice}</Typography>
                      <Typography variant="caption" color="text.secondary">{g.rows.length} items</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(g.rows[0].bill_date, 'DD MMM YYYY')}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(due)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, pr: 3 }}>{adj > 0 ? formatCurrency(adj) : ''}</TableCell>
                </TableRow>
                {g.rows.map((b) => renderRow(b, true))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default BillAllocationTable;
