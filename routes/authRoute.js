const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authmw');

router.post('/Login', authMiddleware, authController.Login);
router.post('/Register', authMiddleware, authController.Register);
router.post('/Logout', authController.Logout);
router.post('/RefreshToken', authController.RefreshToken);
router.post('/ForgotPassword', authMiddleware, authController.ForgotPassword);
router.get('/profile/:userId', authController.getProfile);

module.exports = router;