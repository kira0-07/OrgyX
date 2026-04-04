const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const isLocalAuth = !process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID === 'your_aws_key';

// Only instantiate S3 if we don't plan to intercept and fallback locally
const s3Client = isLocalAuth ? null : new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BASE_UPLOAD_DIR = path.join(__dirname, '../uploads');

// Utility to recursively create directories
const ensureDirectoryExists = (filePath) => {
  const dirName = path.dirname(filePath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
};

const uploadFile = async (key, buffer, contentType) => {
  try {
    if (isLocalAuth) {
      // INTERCEPT: Local File saving
      const localFilePath = path.join(BASE_UPLOAD_DIR, key);
      ensureDirectoryExists(localFilePath);
      
      await fs.promises.writeFile(localFilePath, buffer);
      logger.info(`File saved locally successfully: ${key}`);
      return { success: true, key };
    } else {
      // NATIVE: AWS S3 Upload
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType
      });

      await s3Client.send(command);
      logger.info(`File uploaded to S3 successfully: ${key}`);
      return { success: true, key };
    }
  } catch (error) {
    logger.error(`Error uploading file: ${error.message}`);
    throw error;
  }
};

const getFileUrl = async (key, expiresIn = 3600) => {
  try {
    if (isLocalAuth) {
      // Local Route Map -> directly mounts uploaded URLs on server port
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
      return `${backendUrl}/uploads/${key}`;
    } else {
      // S3 Signed URL
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });
      return url;
    }
  } catch (error) {
    logger.error(`Error generating signed URL: ${error.message}`);
    throw error;
  }
};

const deleteFile = async (key) => {
  try {
    if (isLocalAuth) {
      // Remove from filesystem
      const localFilePath = path.join(BASE_UPLOAD_DIR, key);
      if (fs.existsSync(localFilePath)) {
        await fs.promises.unlink(localFilePath);
        logger.info(`File deleted locally: ${key}`);
      } else {
        logger.warn(`Local file requested for deletion does not exist: ${key}`);
      }
      return { success: true };
    } else {
      // Remove from S3
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      });
      await s3Client.send(command);
      logger.info(`File deleted from S3 successfully: ${key}`);
      return { success: true };
    }
  } catch (error) {
    logger.error(`Error deleting file: ${error.message}`);
    throw error;
  }
};

module.exports = {
  s3Client,
  uploadFile,
  getFileUrl,
  deleteFile
};
