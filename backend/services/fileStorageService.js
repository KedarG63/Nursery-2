const sharp = require('sharp');
const { randomUUID: uuidv4 } = require('crypto');
const { storageClient, BUCKET_NAME } = require('../config/aws');

class FileStorageService {
  // Upload file to GCP Cloud Storage with compression for images
  async uploadFile(file, folder = 'uploads') {
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

    let fileBuffer = file.buffer;

    // Compress images
    if (['jpg', 'jpeg', 'png'].includes(fileExtension.toLowerCase())) {
      fileBuffer = await sharp(file.buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    const bucket = storageClient.bucket(BUCKET_NAME);
    await bucket.file(fileName).save(fileBuffer, { contentType: file.mimetype });

    return {
      key: fileName,
      url: `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`,
    };
  }

  // Generate signed URL for temporary access
  async getSignedUrl(key, expiresIn = 3600) {
    const file = storageClient.bucket(BUCKET_NAME).file(key);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });
    return signedUrl;
  }

  // Delete file from GCP Cloud Storage
  async deleteFile(key) {
    await storageClient.bucket(BUCKET_NAME).file(key).delete();
  }
}

module.exports = new FileStorageService();
