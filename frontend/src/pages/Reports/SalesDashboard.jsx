/**
 * Sales Dashboard Page
 * Comprehensive sales analytics with charts and KPIs
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Paper,
  Stack,
} from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { FileDownload as ExportIcon } from '@mui/icons-material';
import DatePicker from 'react-datepicker';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'react-toastify';
import RevenueChart from '../../components/Reports/RevenueChart';
import TopProducts from '../../components/Reports/TopProducts';
import { getSalesReport, exportSalesReport } from '../../services/reportService';
import {
  LEAF, INK, CATEGORICAL, STATUS_COLORS, TOOLTIP_STYLE, fullINR,
} from '../../utils/chartTheme';

const DATE_RANGES = [
  { label: 'Today', value: 'today', days: 0 },
  { label: 'Yesterday', value: 'yesterday', days: 1 },
  { label: 'Last 7 Days', value: 'week', days: 7 },
  { label: 'Last 30 Days', value: 'month', days: 30 },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Custom', value: 'custom' },
];

const SalesDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [dateRange, setDateRange] = useState('month');
  const [groupBy, setGroupBy] = useState('day');
  const [startDate, setStartDate] = useState(subDays(new Date(), 90));
  const [endDate, setEndDate] = useState(new Date());

  useEffect(() => {
    fetchReport();
  }, []);

  const handleDateRangeChange = (value) => {
    setDateRange(value);
    const today = new Date();

    switch (value) {
      case 'today':
        setStartDate(today);
        setEndDate(today);
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setStartDate(yesterday);
        setEndDate(yesterday);
        break;
      case 'week':
        setStartDate(subDays(today, 7));
        setEndDate(today);
        break;
      case 'month':
        setStartDate(subDays(today, 30));
        setEndDate(today);
        break;
      case 'thisMonth':
        setStartDate(startOfMonth(today));
        setEndDate(endOfMonth(today));
        break;
      case 'lastMonth':
        const lastMonth = subDays(today, 30);
        setStartDate(startOfMonth(lastMonth));
        setEndDate(endOfMonth(lastMonth));
        break;
      default:
        break;
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        group_by: groupBy,
      };

      console.log('=== Fetching Sales Report ===');
      console.log('Params:', params);

      const response = await getSalesReport(params);
      console.log('API Response:', response);
      console.log('Report Data:', response.data || response);

      setReportData(response.data || response);
    } catch (error) {
      console.error('Error fetching sales report:', error);
      toast.error('Failed to load sales report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        group_by: groupBy,
        format: 'excel',
      };

      const blob = await exportSalesReport(params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const kpis = reportData?.kpis || {};
  const revenueTrend = reportData?.revenue_trend || [];
  const topProducts = reportData?.top_products || [];
  const orderStatusBreakdown = reportData?.order_status_breakdown || [];
  const paymentBreakdown = reportData?.payment_breakdown || [];

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Sales Dashboard</Typography>
        <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExport}>
          Export Report
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Date Range</InputLabel>
              <Select
                value={dateRange}
                label="Date Range"
                onChange={(e) => handleDateRangeChange(e.target.value)}
              >
                {DATE_RANGES.map((range) => (
                  <MenuItem key={range.value} value={range.value}>
                    {range.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {dateRange === 'custom' && (
            <>
              <Grid item xs={12} md={3}>
                <DatePicker
                  selected={startDate}
                  onChange={(date) => setStartDate(date)}
                  customInput={<FormControl fullWidth><InputLabel>Start Date</InputLabel></FormControl>}
                  dateFormat="dd/MM/yyyy"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <DatePicker
                  selected={endDate}
                  onChange={(date) => setEndDate(date)}
                  customInput={<FormControl fullWidth><InputLabel>End Date</InputLabel></FormControl>}
                  minDate={startDate}
                  dateFormat="dd/MM/yyyy"
                />
              </Grid>
            </>
          )}

          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Group By</InputLabel>
              <Select value={groupBy} label="Group By" onChange={(e) => setGroupBy(e.target.value)}>
                <MenuItem value="day">Day</MenuItem>
                <MenuItem value="week">Week</MenuItem>
                <MenuItem value="month">Month</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <Button variant="contained" fullWidth onClick={fetchReport}>
              Apply
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Total Revenue', value: formatCurrency(kpis.totalRevenue), accent: LEAF, color: LEAF },
          { label: 'Total Orders', value: kpis.orderCount || 0, accent: INK },
          { label: 'Avg Order Value', value: formatCurrency(kpis.avgOrderValue), accent: INK },
          {
            label: 'Growth vs Previous Period',
            value: `${kpis.growthRate >= 0 ? '+' : ''}${kpis.growthRate || 0}%`,
            accent: kpis.growthRate >= 0 ? LEAF : '#c62828',
            color: kpis.growthRate >= 0 ? LEAF : '#c62828',
          },
        ].map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Card elevation={2} sx={{ height: '100%', borderTop: `4px solid ${kpi.accent}` }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {kpi.label}
                </Typography>
                <Typography variant="h4" fontWeight={800} sx={kpi.color ? { color: kpi.color } : {}}>
                  {kpi.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <RevenueChart data={revenueTrend} groupBy={groupBy} />
        </Grid>

        <Grid item xs={12} md={8}>
          <TopProducts data={topProducts.slice(0, 10)} />
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight={700}>Order Status</Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Orders by stage in the pipeline
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={orderStatusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {orderStatusBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#90a4ae'} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value, name) => [`${value} orders`, name]}
                />
                <Legend iconType="circle" iconSize={9} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700}>Payment Methods</Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>
              How customers paid in this period
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={paymentBreakdown}
                  dataKey="amount"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {paymentBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORICAL[index % CATEGORICAL.length]} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => [fullINR(value), name]} />
                <Legend iconType="circle" iconSize={9} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SalesDashboard;
