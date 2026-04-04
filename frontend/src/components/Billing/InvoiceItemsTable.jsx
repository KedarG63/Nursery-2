import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableFooter, Paper, Typography, TextField, IconButton, Button, Box,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { formatCurrency } from '../../utils/formatters';

/**
 * InvoiceItemsTable
 *
 * Props:
 *  - items: Array of item objects
 *  - editable: boolean (default false)
 *  - onChange: (newItems) => void  (only used when editable=true)
 *  - taxRate: number (invoice-level tax rate, used as default for new items)
 */
const InvoiceItemsTable = ({ items = [], editable = false, onChange, taxRate = 0 }) => {
  const handleFieldChange = (index, field, value) => {
    if (!onChange) return;
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [field]: value };
      // Auto-recalculate line_total and tax_amount client-side for preview
      const qty = parseFloat(newItem.quantity) || 0;
      const price = parseFloat(newItem.unit_price) || 0;
      const disc = parseFloat(newItem.discount_amount) || 0;
      const rate = parseFloat(newItem.tax_rate) || 0;
      newItem.line_total = (qty * price - disc).toFixed(2);
      newItem.tax_amount = ((qty * price - disc) * rate / 100).toFixed(2);
      return newItem;
    });
    onChange(updated);
  };

  const handleRemoveItem = (index) => {
    if (!onChange) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    if (!onChange) return;
    onChange([
      ...items,
      {
        description: '',
        sku_code: '',
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
        tax_rate: taxRate,
        line_total: 0,
        tax_amount: 0,
      },
    ]);
  };

  const subtotal = items.reduce((s, item) => s + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)), 0);
  const totalTax  = items.reduce((s, item) => s + parseFloat(item.tax_amount || 0), 0);
  const totalDisc = items.reduce((s, item) => s + parseFloat(item.discount_amount || 0), 0);

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: 'grey.50', fontSize: '0.75rem' } }}>
              <TableCell sx={{ width: 36 }}>#</TableCell>
              <TableCell>Description</TableCell>
              <TableCell sx={{ width: 80 }} align="center">Qty</TableCell>
              <TableCell sx={{ width: 110 }} align="right">Unit Price</TableCell>
              <TableCell sx={{ width: 90 }} align="right">Discount</TableCell>
              <TableCell sx={{ width: 110 }} align="right">Line Total</TableCell>
              <TableCell sx={{ width: 70 }} align="center">Tax %</TableCell>
              <TableCell sx={{ width: 90 }} align="right">Tax Amt</TableCell>
              {editable && <TableCell sx={{ width: 40 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 9 : 8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No items. {editable && 'Click "Add Item" below.'}
                </TableCell>
              </TableRow>
            )}
            {items.map((item, index) => (
              <TableRow key={index} hover>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  {editable ? (
                    <TextField
                      size="small"
                      fullWidth
                      variant="standard"
                      value={item.description || ''}
                      onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  ) : (
                    <>
                      <Typography variant="body2">{item.description}</Typography>
                      {item.sku_variety && (
                        <Typography variant="caption" color="text.secondary" display="block">{item.sku_variety}</Typography>
                      )}
                      {item.lot_number && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {'Lot: ' + item.lot_number}
                          {item.vendor_name ? ' | ' + item.vendor_name : ''}
                          {item.seed_purchase_date
                            ? ' | Purchased: ' + new Date(item.seed_purchase_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : ''}
                        </Typography>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell align="center">
                  {editable ? (
                    <TextField
                      size="small"
                      type="number"
                      variant="standard"
                      inputProps={{ min: 1, style: { textAlign: 'center', width: 60 } }}
                      value={item.quantity || ''}
                      onChange={(e) => handleFieldChange(index, 'quantity', e.target.value)}
                    />
                  ) : (
                    <Typography variant="body2">{item.quantity}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {editable ? (
                    <TextField
                      size="small"
                      type="number"
                      variant="standard"
                      inputProps={{ min: 0, style: { textAlign: 'right', width: 90 } }}
                      value={item.unit_price || ''}
                      onChange={(e) => handleFieldChange(index, 'unit_price', e.target.value)}
                    />
                  ) : (
                    <Typography variant="body2">{formatCurrency(item.unit_price)}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {editable ? (
                    <TextField
                      size="small"
                      type="number"
                      variant="standard"
                      inputProps={{ min: 0, style: { textAlign: 'right', width: 70 } }}
                      value={item.discount_amount || 0}
                      onChange={(e) => handleFieldChange(index, 'discount_amount', e.target.value)}
                    />
                  ) : (
                    <Typography variant="body2">
                      {parseFloat(item.discount_amount) > 0 ? formatCurrency(item.discount_amount) : '—'}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={500}>{formatCurrency(item.line_total)}</Typography>
                </TableCell>
                <TableCell align="center">
                  {editable ? (
                    <TextField
                      size="small"
                      type="number"
                      variant="standard"
                      inputProps={{ min: 0, max: 100, style: { textAlign: 'center', width: 50 } }}
                      value={item.tax_rate ?? taxRate}
                      onChange={(e) => handleFieldChange(index, 'tax_rate', e.target.value)}
                    />
                  ) : (
                    <Typography variant="body2">
                      {parseFloat(item.tax_rate) > 0 ? `${item.tax_rate}%` : '—'}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {parseFloat(item.tax_amount) > 0 ? formatCurrency(item.tax_amount) : '—'}
                  </Typography>
                </TableCell>
                {editable && (
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => handleRemoveItem(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={editable ? 5 : 4} />
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                Subtotal
              </TableCell>
              <TableCell />
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {formatCurrency(subtotal)}
              </TableCell>
              {editable && <TableCell />}
            </TableRow>
            {totalDisc > 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 5 : 4} />
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  Item Discounts
                </TableCell>
                <TableCell />
                <TableCell align="right" sx={{ color: 'text.secondary' }}>
                  ({formatCurrency(totalDisc)})
                </TableCell>
                {editable && <TableCell />}
              </TableRow>
            )}
            <TableRow>
              <TableCell colSpan={editable ? 5 : 4} />
              <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                Tax (GST)
              </TableCell>
              <TableCell />
              <TableCell align="right" sx={{ color: 'text.secondary' }}>
                {formatCurrency(totalTax)}
              </TableCell>
              {editable && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>

      {editable && (
        <Box sx={{ mt: 1 }}>
          <Button
            startIcon={<AddIcon />}
            size="small"
            onClick={handleAddItem}
            variant="outlined"
          >
            Add Item
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default InvoiceItemsTable;
