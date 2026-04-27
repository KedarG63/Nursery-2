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
  QrCode as QrCodeIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { canDelete } from '../../utils/roleCheck';

const getEffectiveStatus = (lot) => {
  if (lot.growth_stage === 'sold') return { label: 'Sold', color: 'default' };
  if (lot.expected_ready_date && dayjs(lot.expected_ready_date).isBefore(dayjs(), 'day')) {
    return { label: 'Ready', color: 'success' };
  }
  if (lot.expected_ready_date && dayjs(lot.expected_ready_date).isSame(dayjs(), 'day')) {
    return { label: 'Ready Today', color: 'success' };
  }
  return { label: 'Growing', color: 'info' };
};

const getExpectedReadyDisplay = (dateCreated, growthPeriodDays) => {
  if (!dateCreated || !growthPeriodDays) return 'N/A';

  const expectedDate = dayjs(dateCreated).add(growthPeriodDays, 'day');
  const today = dayjs();
  const daysUntilReady = expectedDate.diff(today, 'day');

  const dateStr = expectedDate.format('MMM D');

  if (daysUntilReady < 0) {
    return `${dateStr} (overdue)`;
  } else if (daysUntilReady === 0) {
    return `${dateStr} (today)`;
  } else {
    return `${dateStr} (${daysUntilReady} days)`;
  }
};

const isOverdue = (dateCreated, growthPeriodDays) => {
  if (!dateCreated || !growthPeriodDays) return false;

  const expectedDate = dayjs(dateCreated).add(growthPeriodDays, 'day');
  const today = dayjs();

  return expectedDate.isBefore(today, 'day');
};

const LotsTable = ({
  lots,
  loading,
  onQRCode,
  onLocationChange,
  onDelete,
}) => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  if (loading) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Lot Number</TableCell>
              <TableCell>SKU Name</TableCell>
              <TableCell>Stage</TableCell>
              <TableCell>Location</TableCell>
              <TableCell align="right">Total Qty</TableCell>
              <TableCell align="right">Allocated</TableCell>
              <TableCell align="right">Available</TableCell>
              <TableCell>Planted Date</TableCell>
              <TableCell>Expected Ready</TableCell>
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

  if (!lots || lots.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 2,
        }}
      >
        <Typography variant="h6" color="textSecondary" gutterBottom>
          No lots found
        </Typography>
        <Typography variant="body2" color="textSecondary">
          No lots available at the moment
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Lot Number</TableCell>
            <TableCell>SKU Name</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell>Location</TableCell>
            <TableCell align="right">Total Qty</TableCell>
            <TableCell align="right">Allocated</TableCell>
            <TableCell align="right">Available</TableCell>
            <TableCell>Date Created</TableCell>
            <TableCell>Expected Ready</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lots.map((lot) => {
            const expectedReadyDisplay = lot.expected_ready_date
              ? dayjs(lot.expected_ready_date).format('MMM D, YYYY')
              : 'N/A';
            const isLotOverdue = lot.expected_ready_date
              ? dayjs(lot.expected_ready_date).isBefore(dayjs(), 'day')
              : false;

            return (
              <TableRow key={lot.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {lot.lot_number}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="body2">
                    {lot.product_name || 'N/A'}
                  </Typography>
                  {lot.variety && (
                    <Typography variant="caption" color="textSecondary">
                      {lot.variety}
                    </Typography>
                  )}
                </TableCell>

                <TableCell>
                  {(() => {
                    const status = getEffectiveStatus(lot);
                    return <Chip label={status.label} size="small" color={status.color} />;
                  })()}
                </TableCell>

                <TableCell>
                  <Typography variant="body2">
                    {lot.current_location || 'Not set'}
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  <Typography variant="body2" fontWeight="medium">
                    {lot.quantity}
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight="medium"
                    color={lot.allocated_quantity > 0 ? 'warning.main' : 'text.secondary'}
                  >
                    {lot.allocated_quantity || 0}
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight="medium"
                    color="success.main"
                  >
                    {lot.available_quantity}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="body2">
                    {lot.planted_date ? dayjs(lot.planted_date).format('MMM D, YYYY') : '—'}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography
                    variant="body2"
                    color={isLotOverdue ? 'error' : 'textPrimary'}
                    fontWeight={isLotOverdue ? 'medium' : 'normal'}
                  >
                    {expectedReadyDisplay}
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                    <Tooltip title="View QR Code">
                      <IconButton
                        size="small"
                        onClick={() => onQRCode && onQRCode(lot)}
                      >
                        <QrCodeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    {canDelete(userRole) && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => onDelete && onDelete(lot.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default LotsTable;
