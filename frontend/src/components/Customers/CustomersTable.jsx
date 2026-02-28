import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Box,
  Typography,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import CreditIndicator from '../Common/CreditIndicator';
import { formatPhone } from '../../utils/formatters';
import { canEdit, canDelete } from '../../utils/roleCheck';

/**
 * Customers table component with credit indicators and actions
 */
const CustomersTable = ({ customers, onEdit, onDelete, loading }) => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const handleRowClick = (customerId) => {
    navigate(`/customers/${customerId}`);
  };

  const getCustomerTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'wholesale':
        return 'primary';
      case 'retail':
        return 'success';
      case 'distributor':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Credit Usage</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Box sx={{ height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (!customers || customers.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No customers found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Try adjusting your search or filters
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Type</TableCell>
            <TableCell sx={{ minWidth: 250 }}>Credit Usage</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {customers.map((customer) => (
            <TableRow
              key={customer.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => handleRowClick(customer.id)}
            >
              <TableCell>
                <Typography variant="body2" fontWeight={500}>
                  {customer.name}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">{formatPhone(customer.phone)}</Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">{customer.email || '-'}</Typography>
              </TableCell>

              <TableCell>
                <Chip
                  label={customer.customer_type}
                  color={getCustomerTypeColor(customer.customer_type)}
                  size="small"
                />
              </TableCell>

              <TableCell onClick={(e) => e.stopPropagation()}>
                <CreditIndicator
                  used={customer.credit_used || 0}
                  limit={customer.credit_limit || 0}
                  showLabel={false}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  ₹{customer.credit_used || 0} / ₹{customer.credit_limit || 0}
                </Typography>
              </TableCell>

              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="View Details">
                  <IconButton
                    size="small"
                    onClick={() => handleRowClick(customer.id)}
                    color="primary"
                  >
                    <ViewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                {canEdit(user?.roles) && (
                  <Tooltip title="Edit Customer">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(customer);
                      }}
                      color="primary"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {canDelete(user?.roles) && (
                  <Tooltip title="Delete Customer">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(customer);
                      }}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

CustomersTable.propTypes = {
  customers: PropTypes.array.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

export default CustomersTable;
