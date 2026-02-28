import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Paper,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  Cameraswitch as SwitchCameraIcon,
  Close as CloseIcon,
  FlipCameraAndroid as FlipCameraIcon,
} from '@mui/icons-material';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QRScanner = ({ onScan, onError, isScanning }) => {
  const scannerRef = useRef(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' or 'user'
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [scannerInitialized, setScannerInitialized] = useState(false);

  useEffect(() => {
    if (isScanning && !showManualInput && !scannerInitialized) {
      initializeScanner();
    }

    return () => {
      cleanupScanner();
    };
  }, [isScanning, showManualInput, cameraFacingMode]);

  const initializeScanner = () => {
    try {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          facingMode: cameraFacingMode,
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          // Success callback
          handleScanSuccess(decodedText);
        },
        (error) => {
          // Error callback - only log critical errors
          if (error.includes('NotAllowedError') || error.includes('Permission')) {
            setCameraPermissionDenied(true);
            if (onError) {
              onError('Camera permission denied. Please enable camera access or use manual input.');
            }
          }
        }
      );

      scannerRef.current = scanner;
      setScannerInitialized(true);
      setCameraPermissionDenied(false);
    } catch (error) {
      console.error('Failed to initialize scanner:', error);
      setCameraPermissionDenied(true);
      if (onError) {
        onError('Failed to initialize camera. Please use manual input.');
      }
    }
  };

  const cleanupScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
        scannerRef.current = null;
        setScannerInitialized(false);
      } catch (error) {
        console.error('Error cleaning up scanner:', error);
      }
    }
  };

  const handleScanSuccess = (decodedText) => {
    // Vibrate on successful scan if available
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    if (onScan) {
      onScan(decodedText);
    }
  };

  const handleSwitchCamera = () => {
    cleanupScanner();
    setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setScannerInitialized(false);
  };

  const handleManualInputToggle = () => {
    if (!showManualInput) {
      cleanupScanner();
    }
    setShowManualInput(!showManualInput);
    setManualInput('');
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      if (onScan) {
        onScan(manualInput.trim());
      }
      setManualInput('');
    }
  };

  const handleManualInputChange = (event) => {
    setManualInput(event.target.value);
  };

  const handleManualKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleManualSubmit();
    }
  };

  if (cameraPermissionDenied && !showManualInput) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          p: 3,
          textAlign: 'center',
        }}
      >
        <CameraIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Camera Access Required
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          Please enable camera permissions in your browser settings to scan QR codes.
        </Typography>
        <Button
          variant="outlined"
          onClick={handleManualInputToggle}
          sx={{ minHeight: 44 }}
        >
          Enter Code Manually
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Scanner View */}
      {!showManualInput && isScanning && (
        <Box>
          <Box
            id="qr-reader"
            sx={{
              width: '100%',
              '& video': {
                width: '100%',
                height: 'auto',
                borderRadius: 1,
              },
              '& canvas': {
                display: 'none',
              },
            }}
          />

          {/* Scanner Controls */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 2,
              mt: 2,
            }}
          >
            <Button
              variant="outlined"
              startIcon={<FlipCameraIcon />}
              onClick={handleSwitchCamera}
              sx={{ minHeight: 44, flex: 1, maxWidth: 200 }}
            >
              Switch Camera
            </Button>
            <Button
              variant="outlined"
              onClick={handleManualInputToggle}
              sx={{ minHeight: 44, flex: 1, maxWidth: 200 }}
            >
              Enter Manually
            </Button>
          </Box>

          {/* Scanning Guide */}
          <Paper
            elevation={0}
            sx={{
              mt: 2,
              p: 2,
              bgcolor: 'info.lighter',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="info.dark" sx={{ textAlign: 'center' }}>
              Position the QR code within the frame to scan
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Manual Input */}
      {showManualInput && (
        <Paper sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6">Manual Entry</Typography>
            <IconButton onClick={handleManualInputToggle} size="small">
              <CloseIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="QR Code or Lot Number"
              value={manualInput}
              onChange={handleManualInputChange}
              onKeyPress={handleManualKeyPress}
              placeholder="Enter code or lot number"
              autoFocus
              sx={{
                '& .MuiInputBase-input': {
                  minHeight: 44,
                },
              }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleManualInputToggle}
                sx={{ minHeight: 44, flex: 1 }}
              >
                Back to Camera
              </Button>
              <Button
                variant="contained"
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
                sx={{ minHeight: 44, flex: 1 }}
              >
                Submit
              </Button>
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default QRScanner;
