import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Skeleton,
  Box,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { canEdit, canDelete } from '../../utils/roleCheck';
import productService from '../../services/productService';

const ProductsTable = ({ products, loading, onEdit, onDelete, onView }) => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Growth Period</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...Array(5)].map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton /></TableCell>
                <TableCell><Skeleton /></TableCell>
                <TableCell><Skeleton /></TableCell>
                <TableCell><Skeleton /></TableCell>
                <TableCell><Skeleton /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (!products || products.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 2,
        }}
      >
        <Typography variant="h6" color="textSecondary" gutterBottom>
          No products found
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {canEdit(userRole)
            ? 'Add your first product to get started'
            : 'No products available at the moment'}
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Growth Period (days)</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => onView && onView(product.id)}
            >
              <TableCell>
                <Typography variant="body2" fontWeight="medium">
                  {product.name}
                </Typography>
                {product.description && (
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {product.description.substring(0, 50)}
                    {product.description.length > 50 && '...'}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Chip label={productService.getCategoryDisplayName(product.category)} size="small" />
              </TableCell>
              <TableCell>{product.growth_period_days || 'N/A'}</TableCell>
              <TableCell>
                <Chip
                  label={product.status === 'active' ? 'Active' : product.status === 'discontinued' ? 'Discontinued' : 'Inactive'}
                  size="small"
                  color={product.status === 'active' ? 'success' : product.status === 'discontinued' ? 'error' : 'default'}
                />
              </TableCell>
              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="View Details">
                  <IconButton
                    size="small"
                    onClick={() => onView && onView(product.id)}
                  >
                    <ViewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {canEdit(userRole) && (
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => onEdit && onEdit(product)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {canDelete(userRole) && (
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => onDelete && onDelete(product.id)}
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

export default ProductsTable;
