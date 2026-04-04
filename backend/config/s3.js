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
      // INTERCEPT: Local File saving (Keys missing)
      logger.info(`AWS Keys missing/default. Falling back to local upload: ${key}`);
      return await saveToLocalDisk(key, buffer);
    } else {
      // NATIVE: AWS S3 Upload
      try {
        logger.info(`Attempting S3 upload: Bucket=${process.env.AWS_S3_BUCKET}, Key=${key}`);
        const command = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType
        });

        await s3Client.send(command);
        logger.info(`File uploaded to S3 successfully: ${key}`);
        return { success: true, key };
      } catch (s3Error) {
        // EMERGENCY FALLBACK: If S3 fails (especially AccessDenied), save locally instead of dying
        if (s3Error.name === 'AccessDenied' || s3Error.$metadata?.httpStatusCode === 403) {
          logger.warn(`AWS S3 Access Denied! Falling back to local disk so recording isn't lost: ${s3Error.message}`);
          return await saveToLocalDisk(key, buffer);
        }
        throw s3Error; // Rethrow other errors (e.g. network timeout)
      }
    }
  } catch (error) {
    logger.error(`CRITICAL UPLOAD FAILURE: ${error.message}`);
    if (error.stack) logger.error(error.stack);
    throw error;
  }
};

const saveToLocalDisk = async (key, buffer) => {
  const localFilePath = path.join(BASE_UPLOAD_DIR, key);
  ensureDirectoryExists(localFilePath);
  await fs.promises.writeFile(localFilePath, buffer);
  logger.info(`File saved locally successfully at: ${localFilePath}`);
  return { success: true, key, isLocal: true };
};

const getFileUrl = async (key, expiresIn = 3600) => {
  try {
    // Check if file exists locally first (handles fallback files during AWS outages)
    const localFilePath = path.join(BASE_UPLOAD_DIR, key);
    const baseUrl = (process.env.BACKEND_URL || 'http://localhost:5001').replace(/\/$/, "");
    
    if (fs.existsSync(localFilePath)) {
      return `${baseUrl}/uploads/${key}`;
    }

    if (isLocalAuth) {
      return `${baseUrl}/uploads/${key}`;
    }

    // S3 Signed URL
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error(`Error generating file URL for ${key}: ${error.message}`);
    return null;
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
