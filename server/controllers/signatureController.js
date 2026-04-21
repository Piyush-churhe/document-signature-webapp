const Document = require('../models/Document');
const Signature = require('../models/Signature');
const { embedSignatureInPDF } = require('../services/pdfService');
const { createAuditLog } = require('../middleware/audit');
const { generateSigningToken, getTokenExpiry } = require('../utils/token');
const path = require('path');
const fs = require('fs');

exports.saveSignature = async (req, res) => {
  try {
    const { documentId, type, category, data, fontStyle, color, fields } = req.body;
    const doc = await Document.findOne({ _id: documentId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const signature = await Signature.create({
      document: documentId,
      signer: req.user._id,
      signerEmail: req.user.email,
      signerName: req.user.name,
      type, category, data, fontStyle, color, fields,
      ipAddress: req.clientIP || req.ip,
      userAgent: req.headers['user-agent'],
    });
    await createAuditLog({
      document: documentId,
      action: 'signature_placed',
      actor: req.user._id,
      actorEmail: req.user.email,
      actorName: req.user.name,
      ipAddress: req.clientIP || req.ip,
      metadata: { type, category },
    });
    res.status(201).json({ signature });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSignatures = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const signatures = await Signature.find({ document: req.params.id });
    res.json({ signatures });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.finalizeDocument = async (req, res) => {
  try {
    const { documentId, signatures, fieldValues } = req.body;
    const doc = await Document.findOne({ _id: documentId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const editableTextFields = Array.isArray(fieldValues)
      ? fieldValues
          .filter(field => field && typeof field.fieldId === 'string')
          .filter(field => field.type === 'name' || field.type === 'date' || field.type === 'text')
          .map(field => ({
            fieldId: field.fieldId,
            type: field.type,
            value: String(field.value || '').trim(),
            x: Number.isFinite(Number(field.x)) ? Number(field.x) : 0,
            y: Number.isFinite(Number(field.y)) ? Number(field.y) : 0,
            page: Math.max(1, Math.round(Number(field.page) || 1)),
            width: Math.max(40, Number(field.width) || 180),
            height: Math.max(20, Number(field.height) || 36),
            required: Boolean(field.required),
          }))
      : (doc.signatureFields || [])
          .filter(field => field.type === 'name' || field.type === 'date' || field.type === 'text')
          .map(field => ({
            fieldId: field.id,
            type: field.type,
            value: String(field.value || '').trim(),
            x: field.x,
            y: field.y,
            page: field.page,
            width: field.width,
            height: field.height,
            required: Boolean(field.required),
          }));

    const sourcePdfPath = doc.signedFilePath || doc.filePath;
    const signedPath = await embedSignatureInPDF(sourcePdfPath, signatures, doc.signatureFields, editableTextFields);

    const now = new Date();
    const actorEmail = (req.user?.email || '').toLowerCase();
    const hasSigners = Array.isArray(doc.signers) && doc.signers.length > 0;

    doc.signedFilePath = signedPath;

    if (!hasSigners) {
      doc.status = 'signed';
      doc.completedAt = now;
      doc.currentSignerIndex = 0;
      doc.signingToken = null;
      doc.tokenExpiry = null;
    } else {
      const safeCurrentIndex = Math.min(
        Math.max(Number(doc.currentSignerIndex || 0), 0),
        Math.max(doc.signers.length - 1, 0)
      );

      let signerIndex = doc.signers.findIndex(
        (signer) => String(signer?.email || '').toLowerCase() === actorEmail
      );

      // If owner email is not in signer list, keep workflow moving by signing current active signer.
      if (signerIndex < 0) signerIndex = safeCurrentIndex;

      const activeSigner = doc.signers[signerIndex];
      if (activeSigner) {
        activeSigner.status = 'signed';
        activeSigner.signedAt = now;
        activeSigner.ipAddress = req.clientIP || req.ip;
        activeSigner.name = activeSigner.name || req.user.name;
        activeSigner.email = (activeSigner.email || actorEmail).toLowerCase();
        activeSigner.signingToken = null;
        activeSigner.tokenExpiry = null;
      }

      const nextPendingIndex = doc.signers.findIndex((signer) => signer?.status === 'pending');

      if (nextPendingIndex === -1) {
        doc.currentSignerIndex = doc.signers.length;
        doc.status = 'signed';
        doc.completedAt = now;
        doc.signingToken = null;
        doc.tokenExpiry = null;
      } else {
        const nextSigner = doc.signers[nextPendingIndex];
        if (!nextSigner.signingToken) nextSigner.signingToken = generateSigningToken();
        if (!nextSigner.tokenExpiry) nextSigner.tokenExpiry = getTokenExpiry();

        doc.currentSignerIndex = nextPendingIndex;
        doc.status = 'pending';
        doc.completedAt = null;
        doc.signingToken = nextSigner.signingToken;
        doc.tokenExpiry = nextSigner.tokenExpiry;
        doc.signerName = nextSigner.name;
        doc.signerEmail = nextSigner.email;
      }
    }

    await doc.save();

    const signerIndex = Array.isArray(doc.signers)
      ? doc.signers.findIndex(signer => String(signer?.email || '').toLowerCase() === actorEmail)
      : -1;
    const signerOrder = signerIndex >= 0
      ? Number(doc.signers[signerIndex]?.order || (signerIndex + 1))
      : Number(doc.currentSignerIndex || 0) + 1;

    const preparedSignatures = Array.isArray(signatures) ? signatures : [];
    for (const sig of preparedSignatures) {
      await Signature.create({
        document: doc._id,
        signer: req.user._id,
        signerOrder,
        signerEmail: req.user.email,
        signerName: req.user.name,
        type: sig.type,
        category: sig.category,
        data: sig.data,
        fontStyle: sig.fontStyle,
        color: sig.color,
        fields: Array.isArray(sig.fields) ? sig.fields : [],
        ipAddress: req.clientIP || req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    await createAuditLog({
      document: documentId,
      action: 'signature_placed',
      actor: req.user._id,
      actorEmail: req.user.email,
      actorName: req.user.name,
      ipAddress: req.clientIP || req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        signerOrder,
        signatureCount: preparedSignatures.length,
      },
    });

    if (doc.status === 'signed') {
      await createAuditLog({
        document: documentId,
        action: 'document_signed',
        actor: req.user._id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        ipAddress: req.clientIP || req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          signerOrder,
          signatureCount: preparedSignatures.length,
        },
      });
    }
    res.json({ document: doc, message: 'Document signed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
