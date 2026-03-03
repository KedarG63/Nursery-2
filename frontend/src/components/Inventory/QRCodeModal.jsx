import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardMedia,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Grid,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../../utils/api';
import lotService from '../../services/lotService';

const QRCodeModal = ({ open, onClose, lotId, lotNumber, lotDetails }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && lotId) {
      loadQRCode();
    }

    // Cleanup object URL on unmount
    return () => {
      if (qrCodeUrl && qrCodeUrl.startsWith('blob:')) {
        window.URL.revokeObjectURL(qrCodeUrl);
      }
    };
  }, [open, lotId]);

  const loadQRCode = async () => {
    setLoading(true);
    try {
      // Use api instance so the Authorization: Bearer header is sent automatically
      const response = await api.get(`/api/lots/${lotId}/qr`, { responseType: 'blob' });
      const objectUrl = window.URL.createObjectURL(response.data);
      setQrCodeUrl(objectUrl);
    } catch (error) {
      console.error('Failed to load QR code:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      // If qrCodeUrl is already a blob URL, use it directly
      const link = document.createElement('a');
      link.href = qrCodeUrl;
      link.download = `lot-${lotNumber}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download QR code:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          '@media print': {
            boxShadow: 'none',
          },
        },
      }}
    >
      <DialogTitle className="no-print">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">QR Code - Lot {lotNumber}</Typography>
          <IconButton onClick={onClose} className="no-print">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: 300,
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* QR Code Image — shows in both screen and print */}
              <Card
                className="qr-print-area"
                sx={{ width: '100%', maxWidth: 400, boxShadow: 3 }}
              >
                <CardMedia
                  component="img"
                  image={qrCodeUrl}
                  alt={`QR Code for Lot ${lotNumber}`}
                  sx={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                />
                {/* Lot number shown below QR — visible on sticker for human reference */}
                <Box sx={{ textAlign: 'center', py: 1 }}>
                  <Typography variant="caption" fontFamily="monospace" fontWeight="bold">
                    {lotNumber}
                  </Typography>
                </Box>
              </Card>

              {/* Lot Details — screen only, hidden when printing */}
              {lotDetails && (
                <Box className="no-print" sx={{ width: '100%', mt: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Lot Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="textSecondary">
                        Lot Number:
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {lotNumber}
                      </Typography>
                    </Grid>
                    {lotDetails.skuName && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          SKU:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.skuName}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.productName && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">
                          Product:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.productName}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.location && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Location:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.location}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.stage && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Stage:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.stage}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.expected_ready_date && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">
                          Expected Ready Date:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {dayjs(lotDetails.expected_ready_date).format('MMM D, YYYY')}
                        </Typography>
                      </Grid>
                    )}

                    {lotDetails.lot_created_at && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">
                          Lot Created:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {dayjs(lotDetails.lot_created_at).format('MMM D, YYYY')}
                        </Typography>
                      </Grid>
                    )}

                    {/* Seed Traceability */}
                    {(lotDetails.seed_lot_number || lotDetails.seed_vendor_name) && (
                      <Grid item xs={12}>
                        <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                          Seed Traceability
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.seed_lot_number && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Seed Lot Number:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.seed_lot_number}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.seed_vendor_name && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Seed Vendor:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {lotDetails.seed_vendor_name}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.seed_purchase_date && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Seed Purchase Date:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {dayjs(lotDetails.seed_purchase_date).format('MMM D, YYYY')}
                        </Typography>
                      </Grid>
                    )}
                    {lotDetails.seed_expiry_date && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="textSecondary">
                          Seed Expiry Date:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {dayjs(lotDetails.seed_expiry_date).format('MMM D, YYYY')}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }} className="no-print">
        <Button
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={loading}
        >
          Download PNG
        </Button>
        <Button
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          disabled={loading}
          variant="outlined"
        >
          Print
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>

      <style>
        {`
          @media print {
            /* Hide everything that is not the QR card */
            .no-print { display: none !important; }
            body * { visibility: hidden; }
            .qr-print-area, .qr-print-area * { visibility: visible; }
            .qr-print-area {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 7cm;
              box-shadow: none !important;
            }
          }
        `}
      </style>
    </Dialog>
  );
};

export default QRCodeModal;
