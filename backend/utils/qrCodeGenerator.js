/**
 * QR Code Generator Utility
 * Issue #15: [Inventory] Implement QR code generation for lots
 *
 * Generates QR codes for lot tracking with cloud storage integration
 */

const QRCode = require('qrcode');
const { uploadToS3, isS3Configured } = require('../config/cloudStorage');

/**
 * Generate QR code data for a lot
 * @param {Object} lotData - Lot information
 * @param {string} lotData.lot_number - Lot number
 * @param {string} lotData.sku_code - SKU code
 * @param {string} lotData.created_date - Creation date
 * @param {string} [lotData.seed_lot_number] - Seed lot number for traceability
 * @param {string} [lotData.vendor_name] - Seed vendor name
 * @returns {string} JSON string for QR code
 */
const generateQRData = (lotData) => {
  const qrData = {
    lot_number: lotData.lot_number,
    sku_code: lotData.sku_code,
    created_date: lotData.created_date,
    type: 'lot',
    version: '2.0', // Updated version for seed traceability
  };

  // Include seed traceability if available
  if (lotData.seed_lot_number) {
    qrData.seed_lot = lotData.seed_lot_number;
  }
  if (lotData.vendor_name) {
    qrData.seed_vendor = lotData.vendor_name;
  }

  return JSON.stringify(qrData);
};

/**
 * Generate QR code image and upload to cloud storage
 * @param {Object} lotData - Lot information
 * @param {string} lotData.lot_number - Lot number
 * @param {string} lotData.sku_code - SKU code
 * @param {string} lotData.created_date - Creation date
 * @returns {Promise<Object>} QR data, URL, and buffer
 */
const generateQRCode = async (lotData) => {
  try {
    // Generate QR code data
    const qrData = generateQRData(lotData);

    // Generate QR code as PNG buffer
    const qrCodeBuffer = await QRCode.toBuffer(qrData, {
      errorCorrectionLevel: 'H', // High error correction
      type: 'png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    let qrCodeUrl = null;

    // Upload to S3 if configured
    if (isS3Configured()) {
      try {
        const fileName = `qr-codes/${lotData.lot_number}.png`;
        qrCodeUrl = await uploadToS3(qrCodeBuffer, fileName, 'image/png');
      } catch (uploadError) {
        console.error('Failed to upload QR code to S3:', uploadError);
        // Continue without URL if upload fails
      }
    } else {
      console.warn('S3 not configured. QR code URL will be null.');
    }

    return {
      qr_code: qrData,
      qr_code_url: qrCodeUrl,
      qr_code_buffer: qrCodeBuffer,
    };
  } catch (error) {
    console.error('QR Code Generation Error:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

/**
 * Generate QR code as Data URL (base64)
 * @param {Object} lotData - Lot information
 * @returns {Promise<string>} Base64 Data URL
 */
const generateQRCodeDataURL = async (lotData) => {
  try {
    const qrData = generateQRData(lotData);

    const dataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    return dataURL;
  } catch (error) {
    console.error('QR Code Data URL Generation Error:', error);
    throw new Error(`Failed to generate QR code data URL: ${error.message}`);
  }
};

/**
 * Parse QR code data
 * @param {string} qrData - QR code data string (JSON or plain text)
 * @returns {Object|string} Parsed data or original string
 */
const parseQRData = (qrData) => {
  try {
    return JSON.parse(qrData);
  } catch (e) {
    // If not JSON, return as-is (might be just lot_number)
    return qrData;
  }
};

/**
 * Extract lot number from QR data
 * @param {string} qrData - QR code data
 * @returns {string} Lot number
 */
const extractLotNumber = (qrData) => {
  const parsed = parseQRData(qrData);

  if (typeof parsed === 'object' && parsed.lot_number) {
    return parsed.lot_number;
  }

  // If it's a plain string, assume it's the lot number
  return parsed;
};

/**
 * Validate QR code data structure
 * @param {string} qrData - QR code data
 * @returns {boolean} True if valid
 */
const validateQRData = (qrData) => {
  try {
    const parsed = parseQRData(qrData);

    // If it's an object, validate required fields
    if (typeof parsed === 'object') {
      return !!(parsed.lot_number && parsed.type === 'lot');
    }

    // If it's a string, check if it matches lot number pattern
    return /^LOT-\d{8}-\d{4}$/.test(parsed);
  } catch (e) {
    return false;
  }
};

module.exports = {
  generateQRCode,
  generateQRCodeDataURL,
  generateQRData,
  parseQRData,
  extractLotNumber,
  validateQRData,
};
