const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://localhost:27017/signatureflow';
const RETRY_DELAY_MS = 5000;

const ensureDocumentSigningTokenIndex = async () => {
  const collection = mongoose.connection.db.collection('documents');
  const indexes = await collection.indexes();
  const tokenIndex = indexes.find((index) => index.name === 'signingToken_1');

  const hasExpectedPartialFilter =
    tokenIndex &&
    tokenIndex.unique === true &&
    tokenIndex.partialFilterExpression &&
    tokenIndex.partialFilterExpression.signingToken &&
    tokenIndex.partialFilterExpression.signingToken.$type === 'string';

  if (!tokenIndex || hasExpectedPartialFilter) return;

  await collection.dropIndex('signingToken_1');
  await collection.createIndex(
    { signingToken: 1 },
    {
      name: 'signingToken_1',
      unique: true,
      partialFilterExpression: {
        signingToken: { $type: 'string' },
      },
    }
  );
  console.log('🔧 Rebuilt documents.signingToken index as partial unique');
};

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || DEFAULT_URI;

  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    await ensureDocumentSigningTokenIndex();
  } catch (error) {
    console.error(`❌ MongoDB error: ${error.message}`);
    console.log(`🔁 Retrying MongoDB connection in ${RETRY_DELAY_MS / 1000}s...`);
    setTimeout(connectDB, RETRY_DELAY_MS);
  }
};

module.exports = connectDB;
