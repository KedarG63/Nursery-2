import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Pagination,
  Grid,
  Chip,
  Stack
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FileDownload as ExportIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useDebounce } from 'use-debounce';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import OrdersTable from '../../components/Orders/OrdersTable';
import { getOrders } from '../../services/orderService';
import { canEdit } from '../../utils/roleCheck';

/**
 * Orders List Page
 * Issue #58: Orders list with filters and status management
 */
const OrdersList = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const statusOptions = [
    'Pending',
    'Confirmed',
    'Ready',
    'Dispatched',
    'Delivered',
    'Cancelled'
  ];

  /**
   * Fetch orders from API
   */
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined
      };

      const response = await getOrders(params);

      setOrders(response.data || response.orders || []);
      setTotal(response.total || 0);
      setTotalPages(response.pages || 1);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error(error.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load orders on mount and when filters change
   */
  useEffect(() => {
    fetchOrders();
  }, [debouncedSearch, statusFilter, page]);

  /**
   * Handle search input change
   */
  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  /**
   * Handle status filter change
   */
  const handleStatusChange = (status) => {
    setStatusFilter(status === statusFilter ? '' : status);
    setPage(1);
  };

  /**
   * Handle page change
   */
  const handlePageChange = (event, value) => {
    setPage(value);
  };

  /**
   * Handle create order
   */
  const handleCreateOrder = () => {
    navigate('/orders/create');
  };

  /**
   * Export orders to Excel
   */
  const handleExport = () => {
    try {
      const exportData = orders.map((order) => ({
        'Order Number': order.order_number || order.id,
        Customer: order.customer_name || '-',
        Date: order.created_at || order.order_date,
        Status: order.status,
        Amount: order.total_amount || order.amount || 0
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
      XLSX.writeFile(workbook, `orders_${Date.now()}.xlsx`);

      toast.success('Orders exported successfully');
    } catch (error) {
      console.error('Error exporting orders:', error);
      toast.error('Failed to export orders');
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <div>
          <Typography variant="h4" gutterBottom>
            Orders
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage customer orders and deliveries
          </Typography>
        </div>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ExportIcon />}
            onClick={handleExport}
            sx={{ height: 'fit-content' }}
          >
            Export
          </Button>

          {canEdit(user?.roles) && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateOrder}
              sx={{ height: 'fit-content' }}
            >
              Create Order
            </Button>
          )}
        </Box>
      </Box>

      {/* Status Filter Chips */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label="All"
            onClick={() => handleStatusChange('')}
            color={statusFilter === '' ? 'primary' : 'default'}
            variant={statusFilter === '' ? 'filled' : 'outlined'}
          />
          {statusOptions.map((status) => (
            <Chip
              key={status}
              label={status}
              onClick={() => handleStatusChange(status)}
              color={statusFilter === status ? 'primary' : 'default'}
              variant={statusFilter === status ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      </Box>

      {/* Search */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            placeholder="Search by order number or customer name..."
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              {total} order{total !== 1 ? 's' : ''} found
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Orders Table */}
      <OrdersTable orders={orders} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </Container>
  );
};

export default OrdersList;
