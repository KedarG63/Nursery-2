const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { s3Client, S3_BUCKET_NAME } = require('../config/aws');

class FileStorageService {
  // Upload file to S3 with compression for images
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

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    return {
      key: fileName,
      url: `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`,
    };
  }

  // Generate signed URL for temporary access
  async getSignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  // Delete file from S3
  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  }
}

module.exports = new FileStorageService();
