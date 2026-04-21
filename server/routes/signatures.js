const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/signatureController');

router.post('/', protect, ctrl.saveSignature);
router.get('/:id', protect, ctrl.getSignatures);
router.post('/finalize', protect, ctrl.finalizeDocument);

module.exports = router;
