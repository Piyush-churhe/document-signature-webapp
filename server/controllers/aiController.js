const path = require('path');
const Document = require('../models/Document');
const aiService = require('../services/aiService');

const resolveAbsolutePath = (filePath) => {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(__dirname, '..', filePath);
};

const shouldForceReanalyze = (forceValue) => forceValue === 'true' || forceValue === '1';

exports.analyzeDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const force = shouldForceReanalyze(req.query.force);

    const document = await Document.findOne({ _id: id, owner: req.user._id });
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!document.filePath) {
      return res.status(400).json({ message: 'Document file not found' });
    }

    if (document.aiAnalysis && !force) {
      return res.status(200).json({ analysis: document.aiAnalysis, cached: true });
    }

    const analysis = await aiService.analyzeDocument(resolveAbsolutePath(document.filePath));

    document.aiAnalysis = analysis;
    document.aiAnalyzedAt = new Date();
    await document.save();

    return res.status(200).json({ analysis, cached: false });
  } catch (error) {
    console.error('analyzeDocument error:', error);
    return res.status(error.statusCode || 500).json({ message: error.userMessage || error.message || 'Failed to analyze document' });
  }
};

exports.analyzePublicDocument = async (req, res) => {
  try {
    const { token } = req.params;
    const force = shouldForceReanalyze(req.query.force);

    const document = await Document.findOne({
      $or: [
        { signingToken: token },
        { 'signers.signingToken': token },
      ],
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found or link invalid' });
    }

    if (document.status !== 'pending') {
      return res.status(410).json({ message: 'Document is no longer available for signing' });
    }

    if (!document.filePath) {
      return res.status(400).json({ message: 'Document file not found' });
    }

    if (document.aiAnalysis && !force) {
      return res.status(200).json({ analysis: document.aiAnalysis, cached: true });
    }

    const analysis = await aiService.analyzeDocument(resolveAbsolutePath(document.filePath));

    document.aiAnalysis = analysis;
    document.aiAnalyzedAt = new Date();
    await document.save();

    return res.status(200).json({ analysis, cached: false });
  } catch (error) {
    console.error('analyzePublicDocument error:', error);
    return res.status(error.statusCode || 500).json({ message: error.userMessage || error.message || 'Failed to analyze document' });
  }
};
