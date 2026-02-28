import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import lotService from '../../services/lotService';

const LocationChangeDialog = ({ open, onClose, lotId, currentLocation, onLocationChanged }) => {
  const [newLocation, setNewLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const validateLocation = (location) => {
    // Format: A-1-01 (alphanumeric with hyphens)
    const locationRegex = /^[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+$/;

    if (!location) {
      return 'Location is required';
    }

    if (!locationRegex.test(location)) {
      return 'Location format must be A-1-01 (alphanumeric with hyphens)';
    }

    return '';
  };

  const handleLocationChange = (event) => {
    const value = event.target.value;
    setNewLocation(value);

    if (value) {
      const error = validateLocation(value);
      setLocationError(error);
    } else {
      setLocationError('');
    }
  };

  const handleNotesChange = (event) => {
    setNotes(event.target.value);
  };

  const handleConfirm = async () => {
    // Validate location
    const error = validateLocation(newLocation);
    if (error) {
      setLocationError(error);
      return;
    }

    setLoading(true);
    try {
      await lotService.updateLotLocation(lotId, newLocation, notes);
      toast.success('Location updated successfully');

      // Reset form
      setNewLocation('');
      setNotes('');
      setLocationError('');

      // Notify parent and close
      if (onLocationChanged) {
        onLocationChanged();
      }
      onClose();
    } catch (error) {
      console.error('Failed to update location:', error);
      toast.error(error.response?.data?.message || 'Failed to update location');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setNewLocation('');
      setNotes('');
      setLocationError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Change Location</Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Current Location */}
          <Box>
            <Typography variant="body2" color="textSecondary">
              Current Location:
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {currentLocation || 'Not set'}
            </Typography>
          </Box>

          {/* New Location */}
          <TextField
            label="New Location"
            value={newLocation}
            onChange={handleLocationChange}
            placeholder="A-1-01"
            required
            fullWidth
            error={!!locationError}
            helperText={locationError || 'Format: A-1-01 (alphanumeric with hyphens)'}
            disabled={loading}
            autoFocus
          />

          {/* Notes */}
          <TextField
            label="Notes (Optional)"
            value={notes}
            onChange={handleNotesChange}
            multiline
            rows={3}
            fullWidth
            placeholder="Reason for location change..."
            disabled={loading}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || !newLocation || !!locationError}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? 'Updating...' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LocationChangeDialog;
