const Document = require('../models/Document');
const { createAuditLog } = require('../middleware/audit');
const { getPDFPageCount } = require('../services/pdfService');
const { v4: uuidv4 } = require('uuid');
const { sendSigningRequest } = require('../services/emailService');
const path = require('path');
const fs = require('fs');
const { resolveExistingUploadPath } = require('../utils/fileResolver');
const { uploadFileToGridFS, downloadGridFSBuffer } = require('../utils/gridfs');

const SIGNING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const clientAppBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

const normalizeSigners = (signers = []) => {
  return signers
    .filter(signer => signer && (signer.name || signer.email))
    .map((signer, index) => ({
      name: String(signer.name || '').trim(),
      email: String(signer.email || '').trim().toLowerCase(),
      order: Number(signer.order) || (index + 1),
      status: 'pending',
      signingToken: null,
      tokenExpiry: null,
      signedAt: null,
      rejectionReason: null,
      ipAddress: null,
    }))
    .filter(signer => signer.name && signer.email)
    .sort((a, b) => a.order - b.order)
    .map((signer, index) => ({ ...signer, order: index + 1 }));
};

const resolveRequestSigners = (body = {}, doc = null) => {
  const payloadSigners = Array.isArray(body.signers) ? normalizeSigners(body.signers) : [];
  if (payloadSigners.length > 0) return payloadSigners;

  const legacyEmail = body.signerEmail || doc?.signerEmail;
  const legacyName = body.signerName || doc?.signerName;
  if (!legacyEmail && !legacyName) return [];

  const fallback = normalizeSigners([{ name: legacyName || 'Signer', email: legacyEmail, order: 1 }]);
  return fallback;
};

const findDuplicateSignerEmails = (signers = []) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const signer of signers) {
    const email = String(signer.email || '').trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) duplicates.add(email);
    seen.add(email);
  }
  return Array.from(duplicates);
};

const getSignatureFieldCoverageIssues = (signers = [], fields = []) => {
  const signatureFields = (fields || []).filter(field => field.type === 'signature');
  const signerOrders = signers.map(signer => Number(signer.order || 1));

  const byOrderCount = signatureFields.reduce((acc, field) => {
    const order = Number(field.signerOrder || 1);
    acc[order] = (acc[order] || 0) + 1;
    return acc;
  }, {});

  const missingOrders = signerOrders.filter(order => !byOrderCount[order]);
  const duplicateOrders = signerOrders.filter(order => (byOrderCount[order] || 0) > 1);

  return {
    totalSignatureFields: signatureFields.length,
    missingOrders,
    duplicateOrders,
  };
};

const parseUploadSigners = (rawSigners) => {
  if (!rawSigners) return [];
  if (Array.isArray(rawSigners)) return normalizeSigners(rawSigners);

  try {
    const parsed = JSON.parse(rawSigners);
    if (!Array.isArray(parsed)) return [];
    return normalizeSigners(parsed.map((signer, index) => ({
      name: signer.name || `Signer ${index + 1}`,
      email: signer.email,
      order: signer.order,
    })));
  } catch {
    return [];
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'PDF file required' });
    const { title, signerEmail, signerName, message } = req.body;
    const uploadSigners = parseUploadSigners(req.body.signers);

    const duplicateEmails = findDuplicateSignerEmails(uploadSigners);
    if (duplicateEmails.length > 0) {
      return res.status(400).json({ message: 'Multiple signers cannot have the same email address' });
    }

    const firstSigner = uploadSigners[0] || null;
    const filePath = req.file.path;
    const pageCount = await getPDFPageCount(filePath);
    let fileStorageId = null;

    try {
      fileStorageId = await uploadFileToGridFS(
        filePath,
        req.file.filename || req.file.originalname,
        { ownerId: String(req.user._id), originalName: req.file.originalname, type: 'original' }
      );
    } catch (storageErr) {
      console.warn('GridFS upload warning (original PDF):', storageErr.message);
    }

    const doc = await Document.create({
      title: title || req.file.originalname.replace('.pdf', ''),
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileStorageId,
      fileSize: req.file.size,
      owner: req.user._id,
      signatureFields: [],
      signers: uploadSigners,
      currentSignerIndex: 0,
      signerEmail: firstSigner?.email || signerEmail,
      signerName: firstSigner?.name || signerName,
      message,
      pageCount,
    });

    await doc.save();
    await createAuditLog({
      document: doc._id,
      action: 'document_created',
      actor: req.user._id,
      actorEmail: req.user.email,
      actorName: req.user.name,
      ipAddress: req.clientIP || req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDocuments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { owner: req.user._id };
    if (status && status !== 'all') filter.status = status;
    const docs = await Document.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const total = await Document.countDocuments(filter);
    const stats = await Document.aggregate([
      { $match: { owner: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({ documents: docs, total, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id }).populate('owner', 'name email');
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const shouldTrackView = String(req.query.trackView ?? 'true') !== 'false';
    if (shouldTrackView) {
      await createAuditLog({
        document: doc._id,
        action: 'document_viewed',
        actor: req.user._id,
        actorEmail: req.user.email,
        actorName: req.user.name,
        ipAddress: req.clientIP || req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDocumentFile = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const fileCandidates = [doc.filePath, doc.signedFilePath].filter(Boolean);
    const existingPath = fileCandidates.map(resolveExistingUploadPath).find(Boolean);

    if (!existingPath) {
      const storageCandidates = [doc.signedFileStorageId, doc.fileStorageId].filter(Boolean);
      for (const fileId of storageCandidates) {
        try {
          const pdfBuffer = await downloadGridFSBuffer(fileId);
          res.setHeader('Content-Type', 'application/pdf');
          return res.send(pdfBuffer);
        } catch {
          // Continue trying the next storage candidate.
        }
      }

      return res.status(404).json({
        message: 'Document file is not available on server storage. Please re-upload this document.',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(existingPath));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSignatureFields = async (req, res) => {
  try {
    const { fields } = req.body;
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    doc.signatureFields = fields;
    await doc.save();
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.generateSigningLink = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const signers = resolveRequestSigners(req.body, doc);
    if (req.body.signers && signers.length === 0) {
      return res.status(400).json({ message: 'Each signer must have name and email' });
    }
    const duplicateEmails = findDuplicateSignerEmails(signers);
    if (duplicateEmails.length > 0) {
      return res.status(400).json({ message: 'Multiple signers cannot have the same email address' });
    }

    if (signers.length > 0) {
      const coverage = getSignatureFieldCoverageIssues(signers, doc.signatureFields);
      if (coverage.totalSignatureFields === 0) {
        return res.status(400).json({
          message: 'Place at least one signature field on the document before generating the signing link.',
        });
      }
      if (coverage.missingOrders.length > 0) {
        return res.status(400).json({
          message: `Each signer must have one signature field. Missing signer order(s): ${coverage.missingOrders.join(', ')}`,
        });
      }
      if (coverage.duplicateOrders.length > 0) {
        return res.status(400).json({
          message: `Each signer can have only one signature field. Duplicate signer order(s): ${coverage.duplicateOrders.join(', ')}`,
        });
      }
    }

    const firstSigner = signers[0] || null;
    const token = firstSigner ? uuidv4() : uuidv4();
    const tokenExpiry = new Date(Date.now() + SIGNING_TOKEN_TTL_MS);

    if (firstSigner) {
      firstSigner.signingToken = token;
      firstSigner.tokenExpiry = tokenExpiry;
    }

    doc.signers = signers;
    doc.currentSignerIndex = 0;
    doc.signingToken = token;
    doc.tokenExpiry = tokenExpiry;
    doc.status = 'pending';

    if (firstSigner) {
      doc.signerEmail = firstSigner.email;
      doc.signerName = firstSigner.name;
    } else {
      if (req.body.signerEmail) doc.signerEmail = req.body.signerEmail;
      if (req.body.signerName) doc.signerName = req.body.signerName;
    }

    if (req.body.message) doc.message = req.body.message;
    await doc.save();

    const signingLink = `${clientAppBaseUrl}/sign/${token}`;
    await createAuditLog({
      document: doc._id,
      action: 'signing_link_generated',
      actor: req.user._id,
      actorEmail: req.user.email,
      actorName: req.user.name,
      ipAddress: req.clientIP || req.ip,
      metadata: {
        signerEmail: doc.signerEmail,
        signerCount: signers.length || (doc.signerEmail ? 1 : 0),
      },
    });

    if (doc.signerEmail) {
      await sendSigningRequest({
        to: doc.signerEmail,
        signerName: doc.signerName,
        ownerName: req.user.name,
        documentTitle: doc.title,
        signingLink,
        message: doc.message,
      }).catch(e => console.error('Email error:', e));
    }
    res.json({ signingLink, token, document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSigningProgress = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const isPlaceholderName = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return true;
      if (normalized === '.') return true;
      if (/^\.+$/.test(normalized)) return true;
      if (/^signer$/i.test(normalized)) return true;
      return false;
    };

    const hasSigners = Array.isArray(doc.signers) && doc.signers.length > 0;
    const signers = hasSigners
      ? doc.signers
      : (doc.signerEmail || doc.signerName
        ? [{
          name: doc.signerName || 'Signer',
          email: doc.signerEmail || '',
          order: 1,
          status: doc.status === 'signed' ? 'signed' : (doc.status === 'rejected' ? 'rejected' : 'pending'),
          signedAt: doc.completedAt || null,
          rejectionReason: doc.rejectionReason || null,
        }]
        : []);

    // Keep progress response consistent with document status for legacy rows
    // where signers might remain pending even after document finalization.
    let normalizedSigners = signers.map((signer, index) => {
      const signerObj = typeof signer?.toObject === 'function' ? signer.toObject() : signer;
      const fallbackName = doc.signerName || req.user?.name || `Signer ${index + 1}`;
      const fallbackEmail = (doc.signerEmail || req.user?.email || '').toLowerCase();

      return {
        order: Number(signerObj?.order || index + 1),
        name: isPlaceholderName(signerObj?.name) ? fallbackName : signerObj?.name,
        email: (signerObj?.email || fallbackEmail || '').toLowerCase(),
        status: signerObj?.status || 'pending',
        signedAt: signerObj?.signedAt || null,
        rejectionReason: signerObj?.rejectionReason || null,
        ipAddress: signerObj?.ipAddress || null,
      };
    });

    if (doc.status === 'signed' && signers.length > 0) {
      normalizedSigners = normalizedSigners.map((signer) => ({
        ...signer,
        status: signer.status === 'rejected' ? 'rejected' : 'signed',
        signedAt: signer.signedAt || doc.completedAt || null,
      }));
    }

    const signedCount = normalizedSigners.filter(s => s.status === 'signed').length;
    res.json({
      signers: normalizedSigners,
      currentSignerIndex: hasSigners ? doc.currentSignerIndex : (doc.status === 'pending' ? 0 : normalizedSigners.length),
      signedCount,
      totalSigners: normalizedSigners.length,
      status: doc.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.advanceToNextSigner = async (doc, context = {}) => {
  const {
    ipAddress,
    signerName,
    signerEmail,
    ownerName = 'Document Owner',
  } = context;

  const now = new Date();
  const hasSigners = Array.isArray(doc.signers) && doc.signers.length > 0;

  if (!hasSigners) {
    doc.status = 'signed';
    doc.completedAt = now;
    doc.signingToken = null;
    doc.tokenExpiry = null;
    await doc.save();
    return { hasMoreSigners: false, status: doc.status };
  }

  const currentIndex = Number(doc.currentSignerIndex || 0);
  const currentSigner = doc.signers[currentIndex];
  if (currentSigner) {
    currentSigner.status = 'signed';
    currentSigner.signedAt = now;
    currentSigner.ipAddress = ipAddress;
    currentSigner.name = signerName || currentSigner.name;
    currentSigner.email = (signerEmail || currentSigner.email || '').toLowerCase();
    currentSigner.signingToken = null;
    currentSigner.tokenExpiry = null;
  }

  const nextIndex = currentIndex + 1;
  const nextSigner = doc.signers[nextIndex];
  if (nextSigner) {
    const nextToken = uuidv4();
    const nextExpiry = new Date(Date.now() + SIGNING_TOKEN_TTL_MS);

    nextSigner.signingToken = nextToken;
    nextSigner.tokenExpiry = nextExpiry;
    nextSigner.status = 'pending';

    doc.currentSignerIndex = nextIndex;
    doc.status = 'pending';
    doc.completedAt = null;
    doc.signingToken = nextToken;
    doc.tokenExpiry = nextExpiry;
    doc.signerName = nextSigner.name;
    doc.signerEmail = nextSigner.email;
    await doc.save();

    await sendSigningRequest({
      to: nextSigner.email,
      signerName: nextSigner.name,
      ownerName,
      documentTitle: doc.title,
      signingLink: `${clientAppBaseUrl}/sign/${nextToken}`,
      message: doc.message,
    }).catch(e => console.error('Email error:', e));

    return {
      hasMoreSigners: true,
      status: doc.status,
      nextSigner: { name: nextSigner.name, email: nextSigner.email, order: nextSigner.order },
    };
  }

  doc.currentSignerIndex = doc.signers.length;
  doc.status = 'signed';
  doc.completedAt = now;
  doc.signingToken = null;
  doc.tokenExpiry = null;
  await doc.save();

  return { hasMoreSigners: false, status: doc.status };
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    // Delete files
    [doc.filePath, doc.signedFilePath].forEach(fp => {
      const resolved = resolveExistingUploadPath(fp);
      if (resolved && fs.existsSync(resolved)) fs.unlinkSync(resolved);
    });
    await doc.deleteOne();
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const filePath = resolveExistingUploadPath(doc.signedFilePath || doc.filePath);
    if (!filePath) {
      const storageId = doc.signedFileStorageId || doc.fileStorageId;
      if (!storageId) return res.status(404).json({ message: 'File not found' });

      try {
        const pdfBuffer = await downloadGridFSBuffer(storageId);
        await createAuditLog({
          document: doc._id,
          action: 'document_downloaded',
          actor: req.user._id,
          ipAddress: req.clientIP || req.ip,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.title}.pdf"`);
        return res.send(pdfBuffer);
      } catch {
        return res.status(404).json({ message: 'File not found' });
      }
    }

    await createAuditLog({
      document: doc._id,
      action: 'document_downloaded',
      actor: req.user._id,
      ipAddress: req.clientIP || req.ip,
    });
    res.download(filePath, `${doc.title}.pdf`);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
