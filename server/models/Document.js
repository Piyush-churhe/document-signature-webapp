const mongoose = require('mongoose');

const signatureFieldSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['signature', 'initials', 'stamp', 'name', 'date', 'text'], default: 'signature' },
  signerOrder: { type: Number, default: 1 },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, default: 200 },
  height: { type: Number, default: 80 },
  page: { type: Number, default: 1 },
  required: { type: Boolean, default: true },
  label: { type: String },
  value: { type: String },
  signedAt: { type: Date },
});

const documentSignerSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  order: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'signed', 'rejected'], default: 'pending' },
  signingToken: { type: String },
  tokenExpiry: { type: Date },
  signedAt: { type: Date },
  rejectionReason: { type: String },
  ipAddress: { type: String },
}, { _id: false });

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  originalName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSize: { type: Number },
  mimeType: { type: String, default: 'application/pdf' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'signed', 'rejected', 'expired'], default: 'pending' },
  signers: { type: [documentSignerSchema], default: [] },
  currentSignerIndex: { type: Number, default: 0 },
  signerEmail: { type: String },
  signerName: { type: String },
  signatureFields: [signatureFieldSchema],
  signedFilePath: { type: String },
  signingToken: { type: String },
  tokenExpiry: { type: Date },
  rejectionReason: { type: String },
  message: { type: String },
  aiAnalysis: { type: mongoose.Schema.Types.Mixed },
  aiAnalyzedAt: { type: Date },
  pageCount: { type: Number, default: 1 },
  completedAt: { type: Date },
  expiresAt: { type: Date },
}, { timestamps: true });

// Index for faster queries
documentSchema.index({ owner: 1, status: 1 });
// Unique only for real token values; ignore null/missing/empty tokens.
documentSchema.index(
  { signingToken: 1 },
  {
    unique: true,
    partialFilterExpression: {
      signingToken: { $type: 'string' },
    },
  }
);

module.exports = mongoose.model('Document', documentSchema);
