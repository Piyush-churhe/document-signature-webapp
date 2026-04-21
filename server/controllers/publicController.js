const Document = require('../models/Document');
const Signature = require('../models/Signature');
const OTP = require('../models/OTP');
const { embedSignatureInPDF } = require('../services/pdfService');
const { sendOTP, verifyOTP } = require('../services/otpService');
const { advanceToNextSigner } = require('./documentController');
const { createAuditLog } = require('../middleware/audit');
const fs = require('fs');
const path = require('path');
const { resolveExistingUploadPath } = require('../utils/fileResolver');

const findDocumentByToken = async (token) => {
  return Document.findOne({
    $or: [
      { signingToken: token },
      { 'signers.signingToken': token },
    ],
  }).populate('owner', 'name email');
};

const getSignerFromToken = (doc, token) => {
  if (!Array.isArray(doc.signers) || doc.signers.length === 0) {
    return {
      signer: { name: doc.signerName, email: doc.signerEmail, order: 1 },
      index: 0,
      isSequential: false,
    };
  }

  const tokenIndex = doc.signers.findIndex(signer => signer.signingToken === token);
  if (tokenIndex >= 0) {
    return {
      signer: doc.signers[tokenIndex],
      index: tokenIndex,
      isSequential: true,
    };
  }

  const currentIndex = Number(doc.currentSignerIndex || 0);
  return {
    signer: doc.signers[currentIndex],
    index: currentIndex,
    isSequential: true,
  };
};

const getFieldSignerOrder = (field) => Number(field?.signerOrder || 1);

const getCategoryFieldsForSigner = (doc, signerOrder, category) => {
  const normalizedCategory = category === 'signature' ? 'signature' : category;
  return (doc.signatureFields || [])
    .filter(field => getFieldSignerOrder(field) === signerOrder)
    .filter(field => field.type === normalizedCategory)
    .map(field => ({
      fieldId: field.id,
      x: field.x,
      y: field.y,
      page: field.page,
      width: field.width,
      height: field.height,
    }));
};

const toFiniteNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const mergeSubmittedSignatureFields = (doc, signerOrder, category, submittedFields = []) => {
  const assignedFields = getCategoryFieldsForSigner(doc, signerOrder, category);
  if (!Array.isArray(submittedFields) || submittedFields.length === 0) return assignedFields;

  const normalizedCategory = category === 'signature' ? 'signature' : category;
  const normalizedSubmitted = submittedFields
    .filter(field => field && typeof field.fieldId === 'string')
    .map(field => ({
      fieldId: field.fieldId,
      x: clamp(toFiniteNumber(field.x, 65), 0, 100),
      y: clamp(toFiniteNumber(field.y, 80), 0, 100),
      page: Math.max(1, Math.round(toFiniteNumber(field.page, doc.pageCount || 1))),
      width: Math.max(40, toFiniteNumber(field.width, 220)),
      height: Math.max(20, toFiniteNumber(field.height, 80)),
    }));

  if (assignedFields.length === 0 && normalizedCategory === 'signature') {
    return normalizedSubmitted;
  }

  const submittedMap = new Map(
    submittedFields
      .filter(field => field && typeof field.fieldId === 'string')
      .map(field => [field.fieldId, field])
  );

  return assignedFields.map(field => {
    const submitted = submittedMap.get(field.fieldId);
    if (!submitted) return field;

    return {
      fieldId: field.fieldId,
      x: clamp(toFiniteNumber(submitted.x, field.x), 0, 100),
      y: clamp(toFiniteNumber(submitted.y, field.y), 0, 100),
      page: Math.max(1, Math.round(toFiniteNumber(submitted.page, field.page))),
      width: Math.max(40, toFiniteNumber(submitted.width, field.width)),
      height: Math.max(20, toFiniteNumber(submitted.height, field.height)),
    };
  });
};

const getTextFieldsForSigner = (doc, signerOrder) => {
  return (doc.signatureFields || [])
    .filter(field => getFieldSignerOrder(field) === signerOrder)
    .filter(field => field.type === 'name' || field.type === 'date' || field.type === 'text')
    .map(field => ({
      fieldId: field.id,
      type: field.type,
      x: field.x,
      y: field.y,
      page: field.page,
      width: field.width,
      height: field.height,
      required: Boolean(field.required),
      value: field.value || '',
    }));
};

const resolveTextFieldPayload = (doc, signerOrder, signerName, submittedFieldValues = []) => {
  const assignedTextFields = getTextFieldsForSigner(doc, signerOrder);
  const submittedMap = new Map(
    Array.isArray(submittedFieldValues)
      ? submittedFieldValues
          .filter(field => field && typeof field.fieldId === 'string')
          .map(field => [field.fieldId, field])
      : []
  );

  const today = new Date().toLocaleDateString('en-GB');

  return assignedTextFields.map(field => {
    const submitted = submittedMap.get(field.fieldId) || {};
    const fallbackValue = field.type === 'name'
      ? (signerName || field.value || '')
      : field.type === 'date'
        ? (field.value || today)
        : (field.value || '');

    const rawValue = typeof submitted.value === 'string' ? submitted.value : fallbackValue;

    return {
      fieldId: field.fieldId,
      type: field.type,
      value: String(rawValue || '').trim(),
      x: clamp(toFiniteNumber(submitted.x, field.x), 0, 100),
      y: clamp(toFiniteNumber(submitted.y, field.y), 0, 100),
      page: Math.max(1, Math.round(toFiniteNumber(submitted.page, field.page))),
      width: Math.max(40, toFiniteNumber(submitted.width, field.width)),
      height: Math.max(20, toFiniteNumber(submitted.height, field.height)),
      required: Boolean(field.required),
    };
  });
};

const syncDocumentStatusFromSigners = (doc) => {
  if (!Array.isArray(doc.signers) || doc.signers.length === 0) return false;

  const hasRejected = doc.signers.some(signer => signer?.status === 'rejected');
  const allSigned = doc.signers.every(signer => signer?.status === 'signed');
  const hasPending = doc.signers.some(signer => signer?.status === 'pending');

  let changed = false;
  if (hasRejected && doc.status !== 'rejected') {
    doc.status = 'rejected';
    changed = true;
  } else if (allSigned && doc.status !== 'signed') {
    doc.status = 'signed';
    changed = true;
  } else if (hasPending && doc.status !== 'pending') {
    doc.status = 'pending';
    changed = true;
  }

  const safeCurrentIndex = Math.min(Math.max(Number(doc.currentSignerIndex || 0), 0), Math.max(doc.signers.length - 1, 0));
  if (doc.currentSignerIndex !== safeCurrentIndex && doc.status === 'pending') {
    doc.currentSignerIndex = safeCurrentIndex;
    changed = true;
  }

  return changed;
};

exports.getDocumentByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await findDocumentByToken(token);
    if (!doc) return res.status(404).json({ message: 'Document not found or link invalid' });

    const normalized = syncDocumentStatusFromSigners(doc);
    if (normalized) await doc.save();

    if (doc.status === 'signed') return res.status(410).json({ message: 'Document already signed', status: 'signed' });
    if (doc.status === 'rejected') return res.status(410).json({ message: 'Document was rejected', status: 'rejected' });

    const { signer, isSequential } = getSignerFromToken(doc, token);
    const activeExpiry = isSequential ? signer?.tokenExpiry : doc.tokenExpiry;
    if (activeExpiry && new Date() > activeExpiry) {
      doc.status = 'expired';
      await doc.save();
      return res.status(410).json({ message: 'Signing link has expired', status: 'expired' });
    }

    await createAuditLog({
      document: doc._id,
      action: 'document_opened',
      actorEmail: signer?.email || doc.signerEmail,
      actorName: signer?.name || doc.signerName,
      ipAddress: req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { token },
    });

    const docObj = doc.toObject();
    delete docObj.signingToken;
    if (Array.isArray(docObj.signers)) {
      docObj.signers = docObj.signers
        .filter(Boolean)
        .map(({ signingToken, ...rest }) => rest);
    }
    if (signer) {
      docObj.signerName = signer.name || docObj.signerName;
      docObj.signerEmail = signer.email || docObj.signerEmail;
      docObj.activeSignerOrder = Number(signer.order || 1);
    }

    res.json({ document: docObj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDocumentFileByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await findDocumentByToken(token);
    if (!doc) return res.status(404).json({ message: 'Document not found or link invalid' });

    const fileCandidates = [doc.signedFilePath, doc.filePath].filter(Boolean);
    const existingPath = fileCandidates.map(resolveExistingUploadPath).find(Boolean);

    if (!existingPath) {
      return res.status(404).json({
        message: 'Document file is not available on server storage. Ask the owner to re-upload and resend signing link.',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(existingPath));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.sendOTPHandler = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token is required' });

    const doc = await findDocumentByToken(token);
    if (!doc) return res.status(404).json({ message: 'Document not found or link invalid' });

    const { signer } = getSignerFromToken(doc, token);
    const recipientEmail = signer?.email || doc.signerEmail;
    const recipientName = signer?.name || doc.signerName;

    if (!recipientEmail) return res.status(400).json({ message: 'Signer email is not configured for this document' });
    if (doc.status === 'signed') return res.status(410).json({ message: 'Document already signed', status: 'signed' });
    if (doc.status === 'rejected') return res.status(410).json({ message: 'Document was rejected', status: 'rejected' });

    const activeExpiry = signer?.tokenExpiry || doc.tokenExpiry;
    if (activeExpiry && new Date() > activeExpiry) {
      doc.status = 'expired';
      await doc.save();
      return res.status(410).json({ message: 'Signing link has expired', status: 'expired' });
    }

    const maskedEmail = await sendOTP({
      email: recipientEmail,
      token,
      documentTitle: doc.title,
      signerName: recipientName,
    });

    res.json({ message: 'OTP sent successfully', maskedEmail });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyOTPHandler = async (req, res) => {
  try {
    const { token, otp } = req.body;
    if (!token || !otp) return res.status(400).json({ message: 'Token and OTP are required' });

    const result = await verifyOTP({ token, otp });
    if (!result.success) return res.status(400).json({ message: result.message });

    res.json({ message: result.message, verified: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.signDocumentByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { signerName, signerEmail, signatures, fieldValues, action, rejectionReason } = req.body;
    const doc = await findDocumentByToken(token);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const normalized = syncDocumentStatusFromSigners(doc);
    if (normalized) await doc.save();

    if (doc.status !== 'pending') return res.status(410).json({ message: 'Document already processed' });

    const { signer: currentSigner, index: currentSignerIndex, isSequential } = getSignerFromToken(doc, token);
    if (!currentSigner) return res.status(403).json({ message: 'Invalid signer token' });

    const activeExpiry = isSequential ? currentSigner.tokenExpiry : doc.tokenExpiry;
    if (activeExpiry && new Date() > activeExpiry) return res.status(410).json({ message: 'Link expired' });

    if (currentSigner.email || doc.signerEmail) {
      const verifiedOtp = await OTP.findOne({ token, verified: true }).sort({ createdAt: -1 });
      if (!verifiedOtp) {
        return res.status(403).json({ message: 'OTP verification required before signing this document' });
      }

      if (new Date() > verifiedOtp.expiresAt) {
        await OTP.deleteMany({ token });
        return res.status(403).json({ message: 'OTP session expired. Please request and verify a new OTP.' });
      }
    }

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    // For multi-signer flow, identity should come from the signer resolved by token.
    // Fallback to submitted values only when token-linked signer details are absent.
    const actingSignerName = String(currentSigner?.name || signerName || doc.signerName || '').trim();
    const actingSignerEmail = String(currentSigner?.email || signerEmail || doc.signerEmail || '').trim().toLowerCase();
    const activeSignerOrder = Number(currentSigner.order || 1);
    
    if (action === 'reject') {
      if (isSequential && doc.signers[currentSignerIndex]) {
        doc.signers[currentSignerIndex].status = 'rejected';
        doc.signers[currentSignerIndex].rejectionReason = rejectionReason;
        doc.signers[currentSignerIndex].ipAddress = ipAddress;
        doc.signers[currentSignerIndex].signingToken = null;
        doc.signers[currentSignerIndex].tokenExpiry = null;
      }

      doc.status = 'rejected';
      doc.rejectionReason = rejectionReason;
      doc.completedAt = new Date();
      doc.signingToken = null;
      doc.tokenExpiry = null;
      await doc.save();

      await createAuditLog({
        document: doc._id,
        action: 'document_rejected',
        actorEmail: actingSignerEmail,
        actorName: actingSignerName,
        ipAddress,
        userAgent: req.headers['user-agent'],
        metadata: { rejectionReason },
      });
      return res.json({ message: 'Document rejected', status: 'rejected' });
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
      return res.status(400).json({ message: 'At least one signature is required' });
    }

    // Resolve target fields from server data, but allow submitted coordinates for assigned fields only.
    const preparedSignatures = signatures
      .map(sig => ({
        ...sig,
        fields: mergeSubmittedSignatureFields(doc, activeSignerOrder, sig.category, sig.fields),
      }))
      .filter(sig => Array.isArray(sig.fields) && sig.fields.length > 0);

    if (preparedSignatures.length === 0) {
      return res.status(400).json({ message: 'No signature fields are assigned to this signer.' });
    }

    const preparedTextFields = resolveTextFieldPayload(doc, activeSignerOrder, actingSignerName, fieldValues);
    const missingRequiredTextField = preparedTextFields.find(field => field.required && !String(field.value || '').trim());
    if (missingRequiredTextField) {
      return res.status(400).json({ message: `Required field is missing: ${missingRequiredTextField.type}` });
    }

    // Enforce unique signature artifact per signer on the same document.
    const submittedData = preparedSignatures
      .map(sig => String(sig.data || '').trim())
      .filter(Boolean);
    if (submittedData.length > 0) {
      const existingMatch = await Signature.findOne({
        document: doc._id,
        data: { $in: submittedData },
        signerEmail: { $ne: actingSignerEmail },
      }).lean();
      if (existingMatch) {
        return res.status(400).json({ message: 'Multiple signers cannot use the same signature' });
      }
    }

    // For sequential signing, each signer must append onto the latest signed PDF.
    const sourcePdfPath = resolveExistingUploadPath(doc.signedFilePath || doc.filePath);
    if (!sourcePdfPath) {
      return res.status(404).json({
        message: 'Document file is not available on server storage. Ask the owner to re-upload and resend signing link.',
      });
    }
    const signedPath = await embedSignatureInPDF(sourcePdfPath, preparedSignatures, doc.signatureFields, preparedTextFields);
    doc.signedFilePath = signedPath;
    doc.signerName = actingSignerName;
    doc.signerEmail = actingSignerEmail || doc.signerEmail;

    const advanceResult = await advanceToNextSigner(doc, {
      ipAddress,
      signerName: actingSignerName,
      signerEmail: actingSignerEmail,
      ownerName: doc.owner?.name || 'Document Owner',
    });

    // Save signature records
    for (const sig of preparedSignatures) {
      await Signature.create({
        document: doc._id,
        signerOrder: activeSignerOrder,
        signerEmail: actingSignerEmail,
        signerName: actingSignerName,
        type: sig.type,
        category: sig.category,
        data: sig.data,
        color: sig.color,
        fields: sig.fields,
        ipAddress,
        userAgent: req.headers['user-agent'],
      });
    }

    await createAuditLog({
      document: doc._id,
      action: 'signature_placed',
      actorEmail: actingSignerEmail,
      actorName: actingSignerName,
      ipAddress,
      userAgent: req.headers['user-agent'],
      metadata: {
        signerOrder: activeSignerOrder,
        signatureCount: preparedSignatures.length,
      },
    });

    if (advanceResult.status === 'signed') {
      await createAuditLog({
        document: doc._id,
        action: 'document_signed',
        actorEmail: actingSignerEmail,
        actorName: actingSignerName,
        ipAddress,
        userAgent: req.headers['user-agent'],
        metadata: {
          signerOrder: activeSignerOrder,
          signatureCount: preparedSignatures.length,
          hasMoreSigners: Boolean(advanceResult.hasMoreSigners),
          nextSigner: advanceResult.nextSigner || null,
        },
      });
    }

    await OTP.deleteMany({ token });

    res.json({
      message: advanceResult.hasMoreSigners
        ? 'Signature saved. The next signer has been notified.'
        : 'Document signed successfully',
      status: advanceResult.status,
      hasMoreSigners: Boolean(advanceResult.hasMoreSigners),
      nextSigner: advanceResult.nextSigner || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.downloadSignedDocument = async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await findDocumentByToken(token);
    // Allow download even after signing by matching original doc
    const docByToken = await Document.findOne({ _id: req.params.docId });
    const targetDoc = doc || docByToken;
    if (!targetDoc || !targetDoc.signedFilePath) return res.status(404).json({ message: 'Signed document not found' });
    const resolvedPath = resolveExistingUploadPath(targetDoc.signedFilePath);
    if (!resolvedPath) return res.status(404).json({ message: 'File not found' });
    res.download(resolvedPath, `signed-${targetDoc.title}.pdf`);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
