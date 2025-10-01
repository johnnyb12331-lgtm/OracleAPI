const express = require('express');
const router = express.Router();
const setupProfile = require('../controllers/setupprofilecontroller');
const authguard = require('../guard/authguard');

router.post('/setup-profile', authguard, setupProfile.setupProfile);

module.exports = router;
