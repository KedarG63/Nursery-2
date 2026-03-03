/**
 * QR Code Generator Utility
 * Issue #15: [Inventory] Implement QR code generation for lots
 *
 * Generates QR codes for lot tracking with cloud storage integration
 */

const QRCode = require('qrcode');
const { uploadToStorage, isStorageConfigured } = require('../config/cloudStorage');

/**
 * Generate QR code data for a lot
 * @param {Object} lotData - Lot information
 * @param {string} lotData.lot_number - Lot number
 * @param {string} lotData.sku_code - SKU code
 * @param {string} lotData.created_date - Creation date
 * @param {string} [lotData.seed_lot_number] - Seed lot number for traceability
 * @param {string} [lotData.vendor_name] - Seed vendor name
 * @returns {string} Human-readable multiline text for QR code
 */
const generateQRData = (lotData) => {
  const lines = [
    `LOT: ${lotData.lot_number}`,
    `SKU: ${lotData.sku_code || 'N/A'}`,
    `Date: ${lotData.created_date || ''}`,
  ];

  if (lotData.seed_lot_number) {
    lines.push(`Seed Lot: ${lotData.seed_lot_number}`);
  }
  if (lotData.vendor_name) {
    lines.push(`Seed Vendor: ${lotData.vendor_name}`);
  }

  return lines.join('\n');
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

    // Upload to GCP Storage if configured
    if (isStorageConfigured()) {
      try {
        const fileName = `qr-codes/${lotData.lot_number}.png`;
        qrCodeUrl = await uploadToStorage(qrCodeBuffer, fileName, 'image/png');
      } catch (uploadError) {
        console.error('Failed to upload QR code to GCP Storage:', uploadError);
        // Continue without URL if upload fails
      }
    } else {
      console.warn('GCP Storage not configured. QR code URL will be null.');
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
 * Parse QR code data (supports multiline text, JSON, or plain lot number)
 * @param {string} qrData - QR code data string
 * @returns {Object} Parsed data with at least lot_number field
 */
const parseQRData = (qrData) => {
  if (!qrData) return qrData;

  // Try multiline text format: "LOT: xxx\nSKU: yyy\n..."
  if (qrData.startsWith('LOT: ')) {
    const result = {};
    for (const line of qrData.split('\n')) {
      const idx = line.indexOf(': ');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().toLowerCase().replace(/ /g, '_');
        result[key] = line.slice(idx + 2).trim();
      }
    }
    // Normalise: 'lot' → 'lot_number', 'sku' → 'sku_code', 'seed_lot' → 'seed_lot_number'
    if (result.lot) { result.lot_number = result.lot; delete result.lot; }
    if (result.sku) { result.sku_code = result.sku; delete result.sku; }
    if (result.seed_lot) { result.seed_lot_number = result.seed_lot; delete result.seed_lot; }
    if (result.seed_vendor) { result.vendor_name = result.seed_vendor; delete result.seed_vendor; }
    return result;
  }

  // Try legacy JSON format
  try {
    return JSON.parse(qrData);
  } catch (e) {
    // Plain string — treat as lot number
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

  // Plain string — assume it is the lot number
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

    if (typeof parsed === 'object' && parsed.lot_number) {
      return /^LOT-\d{8}-\d{4}$/.test(parsed.lot_number);
    }

    // Plain string — check lot number pattern
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
