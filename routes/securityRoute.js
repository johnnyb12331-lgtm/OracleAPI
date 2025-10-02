const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const authMiddleware = require('../middlewares/authmw');

// All routes require authentication
router.use(authMiddleware);

// GET /api/security/settings - Get security and privacy settings
router.get('/settings', securityController.getSecuritySettings);

// PUT /api/security/settings - Update security and privacy settings
router.put('/settings', securityController.updateSecuritySettings);

// GET /api/security/login-history - Get login history
router.get('/login-history', securityController.getLoginHistory);

// POST /api/security/change-password - Change password
router.post('/change-password', securityController.changePassword);

module.exports = router;
