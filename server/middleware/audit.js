const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ document, action, actor, actorEmail, actorName, ipAddress, userAgent, metadata }) => {
  try {
    await AuditLog.create({ document, action, actor, actorEmail, actorName, ipAddress, userAgent, metadata });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

const auditMiddleware = (action) => async (req, res, next) => {
  req.auditAction = action;
  req.clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || req.ip;
  next();
};

module.exports = { createAuditLog, auditMiddleware };
