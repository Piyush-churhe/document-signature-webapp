const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getAuditLogs } = require('../controllers/auditController');

router.get('/:docId', protect, getAuditLogs);

module.exports = router;
