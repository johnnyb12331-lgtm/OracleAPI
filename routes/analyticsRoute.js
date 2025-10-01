const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authguard = require('../guard/authguard');

router.get('/user', authguard, analyticsController.getUserAnalytics);
router.get('/platform', authguard, analyticsController.getPlatformAnalytics);

module.exports = router;