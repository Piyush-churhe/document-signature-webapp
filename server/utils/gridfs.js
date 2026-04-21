const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');

const getBucket = () => {
  if (!mongoose.connection?.db) return null;
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'documents' });
};

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
};

const uploadFileToGridFS = (filePath, fileName, metadata = {}) => {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    if (!bucket) {
      reject(new Error('MongoDB bucket is not available'));
      return;
    }

    const uploadStream = bucket.openUploadStream(fileName, { metadata });
    const source = fs.createReadStream(filePath);

    source.on('error', reject);
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));

    source.pipe(uploadStream);
  });
};

const downloadGridFSBuffer = (fileId) => {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    const objectId = toObjectId(fileId);
    if (!bucket || !objectId) {
      reject(new Error('Invalid GridFS file id'));
      return;
    }

    const chunks = [];
    const stream = bucket.openDownloadStream(objectId);

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const writeGridFSFileToTemp = async (fileId, extension = '.pdf') => {
  const buffer = await downloadGridFSBuffer(fileId);
  const tempPath = path.join(
    os.tmpdir(),
    `signatureflow-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`
  );
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
};

module.exports = {
  uploadFileToGridFS,
  downloadGridFSBuffer,
  writeGridFSFileToTemp,
};
