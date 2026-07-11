/**
 * Variety 360° Detail
 * Everything about one product variety: stock & production, seed purchases,
 * monthly sales, selling-price variation, every buyer and recent sales.
 */

import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, CircularProgress, Alert, Chip, Stack,
  Button, Link,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { getVarietyDetail } from '../../services/reportService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  LEAF, SKY, INK, GRID_STROKE, TICK_STYLE, TOOLTIP_STYLE, compactINR,
} from '../../utils/chartTheme';

const nf = (v) => Number(v || 0).toLocaleString('en-IN');

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const Tile = ({ label, value, sub, color }) => (
  <Card elevation={2} sx={{ height: '100%', borderTop: `4px solid ${color || '#90a4ae'}` }}>
    <CardContent sx={{ py: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={color ? { color } : {}}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </CardContent>
  </Card>
);

const SectionCard = ({ title, subtitle, children }) => (
  <Paper sx={{ p: 3, height: '100%' }}>
    <Typography variant="h6" fontWeight={700}>{title}</Typography>
    {subtitle && <Typography variant="body2" color="text.secondary" mb={1.5}>{subtitle}</Typography>}
    {children}
  </Paper>
);

const VarietyDetail = () => {
  const { skuId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await getVarietyDetail(skuId);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Failed to load variety detail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [skuId]);

  if (loading) return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return null;

  const { info, stock, sales, procurement, lots, monthly, buyers, recent_sales: recentSales } = data;

  // Price band for the chart: [min, max] per month (null when no sales)
  const priceSeries = monthly.map((m) => ({
    ...m,
    label: monthLabel(m.month_key),
    band: m.min_price === null ? null : [m.min_price, m.max_price],
  }));
  const hasSales = sales.sold_qty > 0;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3} flexWrap="wrap" useFlexGap>
        <Button startIcon={<ArrowBackIcon />} variant="outlined" onClick={() => navigate('/reports/varieties')}>
          All Varieties
        </Button>
        <LocalFloristIcon sx={{ fontSize: 30, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {info.product_name}{info.variety && info.variety !== info.sku_code ? ` — ${info.variety}` : ''}
          </Typography>
          <Stack direction="row" spacing={1} mt={0.5}>
            <Chip label={info.sku_code} size="small" variant="outlined" />
            {info.category && <Chip label={info.category.replace('_', ' ')} size="small" variant="outlined" />}
            <Chip label={info.active ? 'Active' : 'Inactive'} size="small"
              color={info.active ? 'success' : 'default'} variant="outlined" />
          </Stack>
        </Box>
      </Stack>

      {/* KPI tiles */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={4} md={2}>
          <Tile label="In Stock" value={nf(stock.available)} sub={`${stock.lot_count} lot${stock.lot_count !== 1 ? 's' : ''}`} color={INK} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Tile label="Produced (all time)" value={nf(stock.produced)} sub={`from ${nf(procurement.seeds_bought)} seeds`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Tile label="Sold (all time)" value={nf(sales.sold_qty)} sub={`${sales.order_count} orders`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Tile label="Revenue" value={compactINR(sales.revenue)} sub={formatCurrency(sales.revenue)} color={LEAF} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Tile
            label="Avg Selling Price"
            value={sales.avg_price === null ? '—' : formatCurrency(sales.avg_price)}
            sub={`listed ${formatCurrency(info.listed_price)} · cost ${formatCurrency(info.cost)}`}
            color={SKY}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Tile label="Buyers" value={sales.buyer_count} sub={`seed spend ${compactINR(procurement.spend)}`} />
        </Grid>
      </Grid>

      <Grid container spacing={2} mb={2}>
        {/* Units sold per month */}
        <Grid item xs={12} md={6}>
          <SectionCard title="Units Sold" subtitle="Last 12 months">
            {!hasSales ? (
              <Typography color="text.secondary" sx={{ py: 5 }} align="center">No sales yet</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={priceSeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={48}
                    tickFormatter={(v) => nf(v)} />
                  <Tooltip {...TOOLTIP_STYLE}
                    formatter={(v, name) => (name === 'Units' ? [nf(v), name] : [formatCurrency(v), name])} />
                  <Bar dataKey="qty" name="Units" fill={LEAF} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </Grid>

        {/* Price variation per month */}
        <Grid item xs={12} md={6}>
          <SectionCard title="Selling Price Variation" subtitle="Monthly low–high band with the average line">
            {!hasSales ? (
              <Typography color="text.secondary" sx={{ py: 5 }} align="center">No sales yet</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={priceSeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={64}
                    tickFormatter={compactINR} domain={['auto', 'auto']} />
                  <Tooltip {...TOOLTIP_STYLE}
                    formatter={(v, name) => {
                      if (name === 'Low–High') return [Array.isArray(v) ? `${formatCurrency(v[0])} – ${formatCurrency(v[1])}` : '—', name];
                      return [formatCurrency(v), name];
                    }} />
                  <Legend iconType="circle" iconSize={9} />
                  <Area dataKey="band" name="Low–High" stroke="none" fill={SKY} fillOpacity={0.15} connectNulls />
                  <Line dataKey="avg_price" name="Average" stroke={SKY} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Buyers */}
      <Paper sx={{ mb: 2 }}>
        <Box px={3} pt={2.5} pb={1}>
          <Typography variant="h6" fontWeight={700}>Who Buys This Variety</Typography>
          <Typography variant="body2" color="text.secondary">
            Every buyer with quantity, spend and the price they actually paid
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Orders</TableCell>
                <TableCell align="right">Spent</TableCell>
                <TableCell align="right">Price Paid (avg)</TableCell>
                <TableCell align="right">Price Range</TableCell>
                <TableCell align="right">Last Purchase</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {buyers.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">No buyers yet</Typography>
                </TableCell></TableRow>
              )}
              {buyers.map((b, i) => (
                <TableRow key={b.customer_id} hover>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Link component={RouterLink} to={`/customers/${b.customer_id}`} underline="hover">
                        {b.customer_name}
                      </Link>
                      {i === 0 && <Chip label="Top" size="small" color="success" variant="outlined" />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{nf(b.qty)}</TableCell>
                  <TableCell align="right">{b.order_count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(b.spent)}</TableCell>
                  <TableCell align="right">{formatCurrency(b.avg_price)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {b.min_price === b.max_price
                        ? formatCurrency(b.min_price)
                        : `${formatCurrency(b.min_price)} – ${formatCurrency(b.max_price)}`}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatDate(b.last_purchase_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Grid container spacing={2} mb={2}>
        {/* Recent sales */}
        <Grid item xs={12} md={6}>
          <SectionCard title="Recent Sales" subtitle="Latest order lines for this variety">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Order</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentSales.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">No sales yet</Typography>
                    </TableCell></TableRow>
                  )}
                  {recentSales.map((s2, i) => (
                    <TableRow key={`${s2.order_number}-${i}`} hover>
                      <TableCell>
                        <Link component={RouterLink} to={`/orders/${s2.order_id}`} underline="hover">
                          {s2.order_number}
                        </Link>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {formatDate(s2.order_date)}
                        </Typography>
                      </TableCell>
                      <TableCell>{s2.customer_name || '—'}</TableCell>
                      <TableCell align="right">{nf(s2.quantity)}</TableCell>
                      <TableCell align="right">{formatCurrency(s2.unit_price)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(s2.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Grid>

        {/* Lots on the ground */}
        <Grid item xs={12} md={6}>
          <SectionCard title="Lots" subtitle="Production batches of this variety">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Lot</TableCell>
                    <TableCell>Stage</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="right">Available / Total</TableCell>
                    <TableCell align="right">Planted</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lots.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">No lots recorded</Typography>
                    </TableCell></TableRow>
                  )}
                  {lots.map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell>{l.lot_number}</TableCell>
                      <TableCell><Chip label={l.growth_stage} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} /></TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{l.location || '—'}</TableCell>
                      <TableCell align="right">{nf(l.available_quantity)} / {nf(l.quantity)}</TableCell>
                      <TableCell align="right">{l.planted_date ? formatDate(l.planted_date) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Grid>
      </Grid>

      {/* Seed purchases */}
      <Paper sx={{ mb: 2 }}>
        <Box px={3} pt={2.5} pb={1}>
          <Typography variant="h6" fontWeight={700}>Seed Purchases</Typography>
          <Typography variant="body2" color="text.secondary">
            What was bought to grow this variety — {nf(procurement.seeds_bought)} seeds for {formatCurrency(procurement.spend)}
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Purchase</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell align="right">Packets</TableCell>
                <TableCell align="right">Seeds</TableCell>
                <TableCell align="right">Used / Remaining</TableCell>
                <TableCell align="right">Germination</TableCell>
                <TableCell align="right">Cost</TableCell>
                <TableCell align="center">Payment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {procurement.purchases.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">No seed purchases recorded for this variety</Typography>
                </TableCell></TableRow>
              )}
              {procurement.purchases.map((sp) => (
                <TableRow key={sp.id} hover>
                  <TableCell>
                    {sp.purchase_number}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {formatDate(sp.purchase_date)}
                    </Typography>
                  </TableCell>
                  <TableCell>{sp.vendor_name || '—'}</TableCell>
                  <TableCell align="right">{nf(sp.number_of_packets)}</TableCell>
                  <TableCell align="right">{nf(sp.total_seeds)}</TableCell>
                  <TableCell align="right">{nf(sp.seeds_used)} / {nf(sp.seeds_remaining)}</TableCell>
                  <TableCell align="right">{sp.germination_rate === null ? '—' : `${sp.germination_rate}%`}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(sp.grand_total)}</TableCell>
                  <TableCell align="center">
                    <Chip label={sp.payment_status} size="small" sx={{ textTransform: 'capitalize' }}
                      color={sp.payment_status === 'paid' ? 'success' : sp.payment_status === 'partial' ? 'warning' : 'default'}
                      variant="outlined" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default VarietyDetail;
