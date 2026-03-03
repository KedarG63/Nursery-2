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
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { canEdit, canDelete } from '../../utils/roleCheck';
import skuService from '../../services/skuService';
import { formatCurrency } from '../../utils/formatters';

const SKUsTable = ({ skus, loading, onEdit, onDelete }) => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  // Function to get stock level color
  const getStockColor = (currentStock, minStock) => {
    if (currentStock === 0) return 'error';
    if (currentStock <= minStock) return 'warning';
    return 'success';
  };

  // Function to get stock status label
  const getStockLabel = (currentStock, minStock) => {
    if (currentStock === 0) return 'Out of Stock';
    if (currentStock <= minStock) return 'Low Stock';
    return 'In Stock';
  };

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>SKU Code</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell>Variety</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Container Type</TableCell>
              <TableCell align="right">Price</TableCell>
              {(userRole === 'Admin' || userRole === 'Manager') && (
                <TableCell align="right">Cost</TableCell>
              )}
              <TableCell align="right">Current Stock</TableCell>
              <TableCell align="right">Min Stock Level</TableCell>
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
                <TableCell><Skeleton /></TableCell>
                {(userRole === 'Admin' || userRole === 'Manager') && (
                  <TableCell><Skeleton /></TableCell>
                )}
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

  if (!skus || skus.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 2,
        }}
      >
        <Typography variant="h6" color="textSecondary" gutterBottom>
          No SKUs found
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {canEdit(userRole)
            ? 'Add your first SKU to get started'
            : 'No SKUs available at the moment'}
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>SKU Code</TableCell>
            <TableCell>Product Name</TableCell>
            <TableCell>Variety</TableCell>
            <TableCell>Size</TableCell>
            <TableCell>Container Type</TableCell>
            <TableCell align="right">Price</TableCell>
            {(userRole === 'Admin' || userRole === 'Manager') && (
              <TableCell align="right">Cost</TableCell>
            )}
            <TableCell align="right">Current Stock</TableCell>
            <TableCell align="right">Min Stock Level</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {skus.map((sku) => (
            <TableRow key={sku.id} hover>
              <TableCell>
                <Typography variant="body2" fontWeight="medium">
                  {sku.sku_code}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {sku.product?.name || 'N/A'}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="textSecondary">
                  {sku.variety || '-'}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip label={skuService.getSizeDisplayName(sku.size)} size="small" variant="outlined" />
              </TableCell>
              <TableCell>
                <Chip label={skuService.getContainerTypeDisplayName(sku.container_type)} size="small" variant="outlined" />
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight="medium">
                  {formatCurrency(sku.price)}
                </Typography>
              </TableCell>
              {(userRole === 'Admin' || userRole === 'Manager') && (
                <TableCell align="right">
                  <Typography variant="body2" color="textSecondary">
                    {formatCurrency(sku.cost)}
                  </Typography>
                </TableCell>
              )}
              <TableCell align="right">
                <Tooltip
                  title={
                    sku.stock_breakdown ? (
                      <Box>
                        <Typography variant="caption" display="block">
                          <strong>Stock Breakdown:</strong>
                        </Typography>
                        <Typography variant="caption" display="block">
                          • Seeds: {sku.stock_breakdown.seeds_available || 0}
                        </Typography>
                        <Typography variant="caption" display="block">
                          • Ready Saplings: {sku.stock_breakdown.saplings_ready || 0}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          • In Growth: {sku.stock_breakdown.saplings_in_growth || 0}
                        </Typography>
                      </Box>
                    ) : (
                      'Click to view stock details'
                    )
                  }
                  arrow
                  placement="left"
                >
                  <Chip
                    label={`${sku.current_stock || 0} - ${getStockLabel(
                      sku.current_stock || 0,
                      sku.min_stock_level
                    )}`}
                    size="small"
                    color={getStockColor(sku.current_stock || 0, sku.min_stock_level)}
                    sx={{ cursor: 'help' }}
                  />
                </Tooltip>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2">{sku.min_stock_level}</Typography>
              </TableCell>
              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                {canEdit(userRole) && (
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => onEdit && onEdit(sku)}
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
                      onClick={() => onDelete && onDelete(sku.id)}
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

export default SKUsTable;
