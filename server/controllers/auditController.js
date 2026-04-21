const AuditLog = require('../models/AuditLog');
const Document = require('../models/Document');

exports.getAuditLogs = async (req, res) => {
  try {
    const { docId } = req.params;
    // Verify ownership
    const doc = await Document.findOne({ _id: docId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const logs = await AuditLog.find({ document: docId })
      .sort({ timestamp: -1 })
      .populate('actor', 'name email');
    res.json({ logs, document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
