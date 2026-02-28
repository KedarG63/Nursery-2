/**
 * Delivery Reports Page
 * Comprehensive delivery performance analytics
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  TextField,
} from '@mui/material';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FileDownload as ExportIcon } from '@mui/icons-material';
import DatePicker from 'react-datepicker';
import { format, subDays } from 'date-fns';
import { toast } from 'react-toastify';
import DeliveryMetrics from '../../components/Reports/DeliveryMetrics';
import DriverPerformance from '../../components/Reports/DriverPerformance';
import { getDeliveryReport, exportDeliveryReport } from '../../services/reportService';

const FAILURE_COLORS = ['#f44336', '#ff9800', '#ffc107', '#9c27b0', '#673ab7'];

const DeliveryReports = () => {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [filters, setFilters] = useState({
    driverId: '',
    vehicleId: '',
    startDate: subDays(new Date(), 30),
    endDate: new Date(),
  });

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {
        start_date: format(filters.startDate, 'yyyy-MM-dd'),
        end_date: format(filters.endDate, 'yyyy-MM-dd'),
        ...(filters.driverId && { driver_id: filters.driverId }),
        ...(filters.vehicleId && { vehicle_id: filters.vehicleId }),
      };

      const response = await getDeliveryReport(params);
      setReportData(response.data || response);
    } catch (error) {
      console.error('Error fetching delivery report:', error);
      toast.error('Failed to load delivery report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {
        start_date: format(filters.startDate, 'yyyy-MM-dd'),
        end_date: format(filters.endDate, 'yyyy-MM-dd'),
        ...(filters.driverId && { driver_id: filters.driverId }),
      };

      const blob = await exportDeliveryReport(params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `delivery-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const kpis = reportData?.kpis || {};
  const deliveryTrends = reportData?.delivery_trends || [];
  const driverPerformance = reportData?.driver_performance || [];
  const failureReasons = reportData?.failure_reasons || [];
  const routeEfficiency = reportData?.route_efficiency || [];

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Delivery Performance Dashboard</Typography>
        <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExport}>
          Export Report
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Driver</InputLabel>
              <Select
                value={filters.driverId}
                label="Driver"
                onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}
              >
                <MenuItem value="">All Drivers</MenuItem>
                <MenuItem value="driver1">Driver 1</MenuItem>
                <MenuItem value="driver2">Driver 2</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <DatePicker
              selected={filters.startDate}
              onChange={(date) => setFilters({ ...filters, startDate: date })}
              customInput={<TextField fullWidth label="Start Date" />}
              dateFormat="dd/MM/yyyy"
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <DatePicker
              selected={filters.endDate}
              onChange={(date) => setFilters({ ...filters, endDate: date })}
              customInput={<TextField fullWidth label="End Date" />}
              minDate={filters.startDate}
              dateFormat="dd/MM/yyyy"
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <Button variant="contained" fullWidth onClick={fetchReport}>
              Apply Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* KPI Metrics */}
      <DeliveryMetrics kpis={kpis} />

      {/* Charts */}
      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Delivery Trends
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={deliveryTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(date) => format(new Date(date), 'dd MMM')} />
                <YAxis />
                <Tooltip labelFormatter={(label) => format(new Date(label), 'dd MMM yyyy')} />
                <Legend />
                <Line type="monotone" dataKey="on_time" stroke="#4caf50" name="On-Time" />
                <Line type="monotone" dataKey="late" stroke="#ff9800" name="Late" />
                <Line type="monotone" dataKey="failed" stroke="#f44336" name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <DriverPerformance data={driverPerformance} />
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Failed Delivery Reasons
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={failureReasons}
                  dataKey="count"
                  nameKey="reason"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {failureReasons.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={FAILURE_COLORS[index % FAILURE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DeliveryReports;
