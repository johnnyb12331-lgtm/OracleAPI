const express = require('express');
const router = express.Router();
const socialcontroller = require('../controllers/socialController');
const authguard = require('../guard/authguard');

router.post('/GoogleLogin', socialcontroller.googleLogin);
router.post('/follow', authguard, socialcontroller.followUser);
router.post('/unfollow', authguard, socialcontroller.unfollowUser);
router.get('/followers/:userId', authguard, socialcontroller.getFollowers);
router.get('/following/:userId', authguard, socialcontroller.getFollowing);

module.exports = router;
