const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadPDF } = require('../middleware/upload');
const { auditMiddleware } = require('../middleware/audit');
const ctrl = require('../controllers/documentController');

router.get('/', protect, ctrl.getDocuments);
router.post('/upload', protect, uploadPDF.single('pdf'), ctrl.uploadDocument);
router.get('/:id/file', protect, ctrl.getDocumentFile);
router.get('/:id', protect, ctrl.getDocument);
router.get('/:id/signers', protect, ctrl.getSigningProgress);
router.put('/:id/fields', protect, ctrl.updateSignatureFields);
router.post('/:id/signing-link', protect, ctrl.generateSigningLink);
router.delete('/:id', protect, ctrl.deleteDocument);
router.get('/:id/download', protect, ctrl.downloadDocument);

module.exports = router;
