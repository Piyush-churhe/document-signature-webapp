const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicController');

router.get('/sign/:token', ctrl.getDocumentByToken);
router.post('/sign/:token', ctrl.signDocumentByToken);
router.post('/otp/send', ctrl.sendOTPHandler);
router.post('/otp/verify', ctrl.verifyOTPHandler);

module.exports = router;
