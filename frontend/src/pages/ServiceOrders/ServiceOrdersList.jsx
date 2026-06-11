import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  Pagination,
  Grid,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Search as SearchIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useDebounce } from 'use-debounce';
import { toast } from 'react-toastify';
import StatusBadge from '../../components/Common/StatusBadge';
import { getServiceOrders } from '../../services/serviceOrderService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { canEdit } from '../../utils/roleCheck';

/**
 * Service Orders List Page
 * Grow-only orders: customer brings own seeds, nursery charges a flat service fee.
 */
const ServiceOrdersList = () => {
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

  const statusOptions = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];

  const fetchServiceOrders = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      };
      const response = await getServiceOrders(params);
      setOrders(response.data || []);
      setTotal(response.pagination?.total || 0);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Error fetching service orders:', error);
      toast.error(error.message || 'Failed to load service orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, page]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status === statusFilter ? '' : status);
    setPage(1);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <div>
          <Typography variant="h4" gutterBottom>
            Service Orders
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Grow-only jobs where the customer supplies their own seeds
          </Typography>
        </div>

        {canEdit(user?.roles) && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/service-orders/create')}
            sx={{ height: 'fit-content' }}
          >
            New Service Order
          </Button>
        )}
      </Box>

      {/* Status filter */}
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
              label={status.replace(/_/g, ' ')}
              onClick={() => handleStatusChange(status)}
              color={statusFilter === status ? 'primary' : 'default'}
              variant={statusFilter === status ? 'filled' : 'outlined'}
              sx={{ textTransform: 'capitalize' }}
            />
          ))}
        </Stack>
      </Box>

      {/* Search */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            placeholder="Search by service order number or customer name..."
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              {total} service order{total !== 1 ? 's' : ''} found
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Service Order #</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Service Fee</TableCell>
              <TableCell align="right">Balance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    No service orders found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow
                  key={order.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/service-orders/${order.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {order.service_order_number}
                    </Typography>
                  </TableCell>
                  <TableCell>{order.customer_name}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {order.description}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(order.order_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(order.service_fee)}</TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={Number(order.balance_amount) > 0 ? 'error.main' : 'success.main'}
                      fontWeight={500}
                    >
                      {formatCurrency(order.balance_amount)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => setPage(value)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </Container>
  );
};

export default ServiceOrdersList;
