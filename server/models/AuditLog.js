const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  action: {
    type: String,
    enum: ['document_created', 'document_viewed', 'signing_link_generated', 'document_opened', 
           'signature_placed', 'document_signed', 'document_rejected', 'document_downloaded',
           'document_expired', 'token_accessed'],
    required: true,
  },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String },
  actorName: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

auditLogSchema.index({ document: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
