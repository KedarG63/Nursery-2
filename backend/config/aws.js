const { Storage } = require('@google-cloud/storage');

const storageClient = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE, // omit to use Application Default Credentials
});

const BUCKET_NAME = process.env.GCP_STORAGE_BUCKET || 'nursery-uploads';

module.exports = { storageClient, BUCKET_NAME };
