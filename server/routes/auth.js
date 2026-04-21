const express = require('express');
const router = express.Router();
const { register, login, refresh, logout, getProfile } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/profile', protect, getProfile);

module.exports = router;
