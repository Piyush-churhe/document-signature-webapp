const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  signer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  signerOrder: { type: Number },
  signerEmail: { type: String },
  signerName: { type: String },
  type: { type: String, enum: ['typed', 'drawn', 'uploaded'], required: true },
  category: { type: String, enum: ['signature', 'initials', 'stamp'], default: 'signature' },
  data: { type: String, required: true }, // base64 image or text
  fontStyle: { type: String },
  color: { type: String, default: '#000000' },
  fields: [{
    fieldId: String,
    x: Number,
    y: Number,
    page: Number,
    width: Number,
    height: Number,
  }],
  ipAddress: { type: String },
  userAgent: { type: String },
  signedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Signature', signatureSchema);
