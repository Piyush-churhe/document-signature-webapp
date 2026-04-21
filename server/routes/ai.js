const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const aiController = require('../controllers/aiController');

router.post('/analyze/:id', protect, aiController.analyzeDocument);
router.post('/analyze-public/:token', aiController.analyzePublicDocument);

module.exports = router;
