import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  Grid,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Info as InfoIcon,
  QrCodeScanner as ScanIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import lotService from '../../services/lotService';

const getStageColor = (stage) => {
  const colors = {
    seed: 'default',
    germination: 'info',
    growing: 'success',
    ready: 'primary',
    sold: 'default',
    damaged: 'error',
  };
  return colors[stage] || 'default';
};

const LotQuickActions = ({ lot, onStageUpdate, onLocationChange, onScanAnother }) => {
  const navigate = useNavigate();
  const [updatingStage, setUpdatingStage] = useState(null);

  const validTransitions = lotService.getValidTransitions(lot.stage);

  const getExpectedReadyCountdown = () => {
    if (!lot.expected_ready_date) return null;

    const expectedDate = dayjs(lot.expected_ready_date);
    const today = dayjs();
    const daysUntilReady = expectedDate.diff(today, 'day');

    if (daysUntilReady < 0) {
      return {
        text: `${Math.abs(daysUntilReady)} days overdue`,
        color: 'error',
        date: expectedDate.format('MMM D, YYYY'),
      };
    } else if (daysUntilReady === 0) {
      return {
        text: 'Ready today',
        color: 'success',
        date: expectedDate.format('MMM D, YYYY'),
      };
    } else {
      return {
        text: `${daysUntilReady} days remaining`,
        color: 'info',
        date: expectedDate.format('MMM D, YYYY'),
      };
    }
  };

  const handleStageTransition = async (newStage) => {
    setUpdatingStage(newStage);
    try {
      await lotService.updateLotStage(lot.id, newStage);
      toast.success(`Stage updated to ${newStage}`);

      // Vibrate on success
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }

      if (onStageUpdate) {
        onStageUpdate();
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
      toast.error(error.response?.data?.message || 'Failed to update stage');
    } finally {
      setUpdatingStage(null);
    }
  };

  const handleViewDetails = () => {
    navigate(`/inventory/lots/${lot.id}`);
  };

  const readyCountdown = getExpectedReadyCountdown();

  return (
    <Card sx={{ width: '100%', boxShadow: 3 }}>
      <CardContent sx={{ pb: 2 }}>
        {/* Lot Header */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" component="div" gutterBottom>
            {lot.lot_number}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {lot.sku_name}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Lot Details Grid */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Typography variant="caption" color="textSecondary" display="block">
              Current Stage
            </Typography>
            <Chip
              label={lot.stage.charAt(0).toUpperCase() + lot.stage.slice(1)}
              color={getStageColor(lot.stage)}
              size="small"
              sx={{ mt: 0.5 }}
            />
          </Grid>

          <Grid item xs={6}>
            <Typography variant="caption" color="textSecondary" display="block">
              Location
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
              <LocationIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight="medium">
                {lot.location || 'Not set'}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="caption" color="textSecondary" display="block">
              Quantity
            </Typography>
            <Typography variant="body2" fontWeight="medium" sx={{ mt: 0.5 }}>
              {lot.quantity} units
            </Typography>
          </Grid>

          {readyCountdown && (
            <Grid item xs={6}>
              <Typography variant="caption" color="textSecondary" display="block">
                Expected Ready
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="body2" fontWeight="medium">
                  {readyCountdown.date}
                </Typography>
                <Typography
                  variant="caption"
                  color={`${readyCountdown.color}.main`}
                  fontWeight="medium"
                >
                  {readyCountdown.text}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>

        {/* Stage Transition Buttons */}
        {validTransitions.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                Update Stage
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {validTransitions.map((stage) => (
                  <Button
                    key={stage}
                    variant="outlined"
                    size="small"
                    endIcon={
                      updatingStage === stage ? (
                        <CircularProgress size={16} />
                      ) : (
                        <ArrowForwardIcon />
                      )
                    }
                    onClick={() => handleStageTransition(stage)}
                    disabled={updatingStage !== null}
                    sx={{
                      minHeight: 44,
                      flex: '1 1 calc(50% - 8px)',
                      minWidth: 120,
                    }}
                  >
                    {stage.charAt(0).toUpperCase() + stage.slice(1)}
                  </Button>
                ))}
              </Box>
            </Box>
          </>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<LocationIcon />}
            onClick={onLocationChange}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            Move Location
          </Button>

          <Button
            variant="outlined"
            startIcon={<InfoIcon />}
            onClick={handleViewDetails}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            View Full Details
          </Button>

          <Button
            variant="contained"
            startIcon={<ScanIcon />}
            onClick={onScanAnother}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            Scan Another
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default LotQuickActions;
