import React, { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Button,
  Divider,
  Chip,
  CircularProgress,
  Paper,
  Collapse,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import QRScanner from '../../components/Inventory/QRScanner';
import LotQuickActions from '../../components/Inventory/LotQuickActions';
import LocationChangeDialog from '../../components/Inventory/LocationChangeDialog';
import lotService from '../../services/lotService';
import { canManageWarehouse } from '../../utils/roleCheck';

const SCAN_HISTORY_KEY = 'lot_scan_history';
const MAX_HISTORY_ITEMS = 10;

const LotScanner = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;

  // Check permission
  useEffect(() => {
    if (!canManageWarehouse(userRole)) {
      toast.error('You do not have permission to access this page');
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  const [scannedLot, setScannedLot] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  // Load scan history from localStorage on mount
  useEffect(() => {
    loadScanHistory();
  }, []);

  const loadScanHistory = () => {
    try {
      const history = localStorage.getItem(SCAN_HISTORY_KEY);
      if (history) {
        setScanHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Failed to load scan history:', error);
    }
  };

  const saveScanHistory = (history) => {
    try {
      localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save scan history:', error);
    }
  };

  const addToHistory = (lot) => {
    const historyItem = {
      lotId: lot.id,
      lotNumber: lot.lot_number,
      timestamp: new Date().toISOString(),
      location: lot.current_location,
      stage: lot.stage,
    };

    const newHistory = [historyItem, ...scanHistory]
      .filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.lotId === item.lotId && t.timestamp === item.timestamp)
      )
      .slice(0, MAX_HISTORY_ITEMS);

    setScanHistory(newHistory);
    saveScanHistory(newHistory);
  };

  const clearHistory = () => {
    setScanHistory([]);
    localStorage.removeItem(SCAN_HISTORY_KEY);
    toast.success('Scan history cleared');
  };

  const handleScan = async (qrData) => {
    setIsProcessing(true);
    try {
      const response = await lotService.scanLot(qrData);
      const lot = response.data || response.lot;

      if (!lot) {
        throw new Error('Invalid QR code or lot not found');
      }

      // Vibrate on successful scan
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }

      // Set scanned lot and open drawer
      setScannedLot(lot);
      setDrawerOpen(true);

      // Add to history
      addToHistory(lot);

      toast.success(`Scanned: ${lot.lot_number}`);
    } catch (error) {
      console.error('Failed to scan lot:', error);
      toast.error(error.response?.data?.message || 'Invalid QR code or lot not found');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanError = (error) => {
    console.error('Scan error:', error);
    // Error already displayed by QRScanner component
  };

  const handleStageUpdate = async () => {
    // Refresh the scanned lot data
    try {
      const response = await lotService.getLotById(scannedLot.id);
      const lot = response.data || response.lot;
      setScannedLot(lot);

      // Update history
      addToHistory(lot);
    } catch (error) {
      console.error('Failed to refresh lot data:', error);
    }
  };

  const handleLocationChange = () => {
    setLocationDialogOpen(true);
  };

  const handleLocationChanged = async () => {
    // Refresh the scanned lot data
    try {
      const response = await lotService.getLotById(scannedLot.id);
      const lot = response.data || response.lot;
      setScannedLot(lot);

      // Update history
      addToHistory(lot);
    } catch (error) {
      console.error('Failed to refresh lot data:', error);
    }
  };

  const handleLocationDialogClose = () => {
    setLocationDialogOpen(false);
  };

  const handleScanAnother = () => {
    setScannedLot(null);
    setDrawerOpen(false);
  };

  const handleClose = () => {
    navigate('/inventory/lots');
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setScannedLot(null);
  };

  const toggleHistory = () => {
    setShowHistory(!showHistory);
  };

  const handleHistoryItemClick = async (lotId) => {
    setIsProcessing(true);
    try {
      const response = await lotService.getLotById(lotId);
      const lot = response.data || response.lot;

      if (!lot) {
        throw new Error('Lot not found');
      }

      setScannedLot(lot);
      setDrawerOpen(true);
      setShowHistory(false);

      toast.success(`Loaded: ${lot.lot_number}`);
    } catch (error) {
      console.error('Failed to load lot:', error);
      toast.error(error.response?.data?.message || 'Failed to load lot');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* AppBar */}
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={handleClose}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Lot Scanner
          </Typography>
          <IconButton color="inherit" onClick={toggleHistory}>
            <HistoryIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          p: 2,
        }}
      >
        {/* Processing Overlay */}
        {isProcessing && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              gap: 2,
            }}
          >
            <CircularProgress size={48} />
            <Typography variant="body2" color="textSecondary">
              Processing scan...
            </Typography>
          </Box>
        )}

        {/* Scanner */}
        {!isProcessing && !scannedLot && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2,
                bgcolor: 'primary.lighter',
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" color="primary.dark">
                Scan a QR code on a lot tray to view details and perform quick actions.
              </Typography>
            </Paper>

            <QRScanner
              onScan={handleScan}
              onError={handleScanError}
              isScanning={!scannedLot}
            />
          </Box>
        )}

        {/* Scan History Collapsible */}
        {showHistory && (
          <Paper sx={{ mt: 2 }}>
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="h6">Scan History</Typography>
              {scanHistory.length > 0 && (
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={clearHistory}
                >
                  Clear
                </Button>
              )}
            </Box>
            <Divider />
            {scanHistory.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="textSecondary">
                  No scan history yet
                </Typography>
              </Box>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {scanHistory.map((item, index) => (
                  <React.Fragment key={`${item.lotId}-${item.timestamp}`}>
                    {index > 0 && <Divider />}
                    <ListItem
                      button
                      onClick={() => handleHistoryItemClick(item.lotId)}
                      sx={{ py: 1.5 }}
                    >
                      <ListItemText
                        primary={item.lotNumber}
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="caption"
                              color="textSecondary"
                              display="block"
                            >
                              {dayjs(item.timestamp).format('MMM D, h:mm A')}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip
                                label={item.stage}
                                size="small"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                              {item.location && (
                                <Chip
                                  label={item.location}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                          </>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        )}
      </Box>

      {/* Bottom Drawer for Scanned Lot Details */}
      <Drawer
        anchor="bottom"
        open={drawerOpen}
        onClose={handleDrawerClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '85vh',
          },
        }}
      >
        <Box sx={{ p: 2, pb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6">Lot Details</Typography>
            <IconButton onClick={handleDrawerClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>

          {scannedLot && (
            <LotQuickActions
              lot={{
                ...scannedLot,
                sku_name: scannedLot.sku?.product?.name
                  ? `${scannedLot.sku.product.name} — ${scannedLot.sku.variety || scannedLot.sku.sku_code || ''}`
                  : scannedLot.sku?.variety || scannedLot.sku?.sku_code || 'N/A',
                location: scannedLot.current_location,
              }}
              onStageUpdate={handleStageUpdate}
              onLocationChange={handleLocationChange}
              onScanAnother={handleScanAnother}
            />
          )}
        </Box>
      </Drawer>

      {/* Location Change Dialog */}
      {scannedLot && (
        <LocationChangeDialog
          open={locationDialogOpen}
          onClose={handleLocationDialogClose}
          lotId={scannedLot.id}
          currentLocation={scannedLot.current_location}
          onLocationChanged={handleLocationChanged}
        />
      )}
    </Box>
  );
};

export default LotScanner;
