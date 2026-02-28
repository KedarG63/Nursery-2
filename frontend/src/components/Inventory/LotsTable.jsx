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
  Select,
  MenuItem,
} from '@mui/material';
import {
  QrCode as QrCodeIcon,
  Delete as DeleteIcon,
  LocationOn as LocationIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { canManageWarehouse, canDelete } from '../../utils/roleCheck';

const getStageColor = (stage) => {
  const colors = {
    seed: 'default',
    germination: 'info',
    seedling: 'success',
    transplant: 'warning',
    ready: 'primary',
    sold: 'default',
  };
  return colors[stage] || 'default';
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
  onStageChange,
  onLocationChange,
  onDelete,
}) => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  const handleStageChange = (lotId, currentStage, newStage) => {
    if (newStage !== currentStage && onStageChange) {
      onStageChange(lotId, newStage);
    }
  };

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
              <TableCell>Date Created</TableCell>
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
          {canManageWarehouse(userRole)
            ? 'Create your first lot to get started'
            : 'No lots available at the moment'}
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
                    {lot.sku_code || 'N/A'}
                  </Typography>
                  {lot.product_name && (
                    <Typography variant="caption" color="textSecondary">
                      {lot.product_name}
                    </Typography>
                  )}
                </TableCell>

                <TableCell>
                  {canManageWarehouse(userRole) ? (
                    <Select
                      value={lot.growth_stage}
                      onChange={(e) => handleStageChange(lot.id, lot.growth_stage, e.target.value)}
                      size="small"
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="seed">
                        <Chip label="Seed" size="small" color={getStageColor('seed')} />
                      </MenuItem>
                      <MenuItem value="germination">
                        <Chip label="Germination" size="small" color={getStageColor('germination')} />
                      </MenuItem>
                      <MenuItem value="seedling">
                        <Chip label="Seedling" size="small" color={getStageColor('seedling')} />
                      </MenuItem>
                      <MenuItem value="transplant">
                        <Chip label="Transplant" size="small" color={getStageColor('transplant')} />
                      </MenuItem>
                      <MenuItem value="ready">
                        <Chip label="Ready" size="small" color={getStageColor('ready')} />
                      </MenuItem>
                      <MenuItem value="sold">
                        <Chip label="Sold" size="small" color={getStageColor('sold')} />
                      </MenuItem>
                    </Select>
                  ) : (
                    <Chip
                      label={lot.growth_stage}
                      size="small"
                      color={getStageColor(lot.growth_stage)}
                    />
                  )}
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
                    {dayjs(lot.created_at).format('MMM D, YYYY')}
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
                    <Tooltip title="View Traceability">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/inventory/lots/${lot.id}/traceability`)}
                        color="primary"
                      >
                        <TimelineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="View QR Code">
                      <IconButton
                        size="small"
                        onClick={() => onQRCode && onQRCode(lot)}
                      >
                        <QrCodeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    {canManageWarehouse(userRole) && (
                      <Tooltip title="Change Location">
                        <IconButton
                          size="small"
                          onClick={() => onLocationChange && onLocationChange(lot)}
                        >
                          <LocationIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

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
