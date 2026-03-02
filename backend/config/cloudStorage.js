/**
 * Cloud Storage Configuration for QR Code Storage
 * Issue #15: [Inventory] Implement QR code generation for lots
 *
 * Supports GCP Cloud Storage for storing QR code images
 */

const { Storage } = require('@google-cloud/storage');

// Initialize GCP Storage client
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE, // path to service account JSON; omit to use ADC
});

const GCP_BUCKET = process.env.GCP_STORAGE_BUCKET || 'nursery-qr-codes';

/**
 * Upload file to GCP Cloud Storage
 * @param {Buffer} buffer - File buffer
 * @param {string} key - Object name (file path within bucket)
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL of uploaded file
 */
const uploadToStorage = async (buffer, key, contentType = 'image/png') => {
  try {
    const bucket = storage.bucket(GCP_BUCKET);
    const file = bucket.file(key);

    await file.save(buffer, {
      contentType,
      metadata: { cacheControl: 'public, max-age=31536000' },
    });

    // Make object publicly readable
    await file.makePublic();

    return `https://storage.googleapis.com/${GCP_BUCKET}/${key}`;
  } catch (error) {
    console.error('GCP Storage Upload Error:', error);
    throw new Error(`Failed to upload to GCP Storage: ${error.message}`);
  }
};

/**
 * Get signed URL for private file download
 * @param {string} key - Object name
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} Signed download URL
 */
const getSignedDownloadUrl = async (key, expiresIn = 3600) => {
  try {
    const file = storage.bucket(GCP_BUCKET).file(key);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });

    return signedUrl;
  } catch (error) {
    console.error('GCP Storage Signed URL Error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Delete file from GCP Cloud Storage
 * @param {string} key - Object name
 * @returns {Promise<void>}
 */
const deleteFromStorage = async (key) => {
  try {
    await storage.bucket(GCP_BUCKET).file(key).delete();
  } catch (error) {
    console.error('GCP Storage Delete Error:', error);
    throw new Error(`Failed to delete from GCP Storage: ${error.message}`);
  }
};

/**
 * Check if GCP Storage is configured
 * @returns {boolean}
 */
const isStorageConfigured = () => {
  return !!(process.env.GCP_PROJECT_ID && process.env.GCP_STORAGE_BUCKET);
};

module.exports = {
  uploadToStorage,
  getSignedDownloadUrl,
  deleteFromStorage,
  isStorageConfigured,
  storageClient: storage,
};
