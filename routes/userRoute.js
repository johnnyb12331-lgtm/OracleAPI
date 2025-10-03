const express = require('express');
const router = express.Router();
const authguard = require('../guard/authguard');
const  usersdata  = require('../controllers/userController');

//router.get('/me', authguard, usersdata.getUserMe);
//router.get('/:userId/profile', authguard, usersdata.getProfile);
// Static routes first (no dynamic parameters)
router.get('/search', authguard, usersdata.searchUsers);
router.get('/profile-status', authguard, usersdata.getProfileStatus);
router.get('/blocked', authguard, usersdata.getBlockedUsers);

// Dynamic routes after static routes
router.get('/:userId/profile', usersdata.getProfile);
router.put('/:userId/profile', authguard, usersdata.updateProfile);

router.get('/:userId/followers/count', authguard, usersdata.getFollowerCount);
router.get('/:userId/following/count', authguard, usersdata.getFollowingCount);
router.get('/:userId/likes/count', authguard, usersdata.getLikesCount);
router.get('/:userId/comments/count', authguard, usersdata.getCommentsCount);
router.get('/:userId/likes', authguard, usersdata.getLikedPosts);

// Profile media endpoints - must come before generic /:userId routes
router.get('/:userId/media', authguard, usersdata.getProfileMedia);
router.post('/:userId/media', authguard, usersdata.uploadProfileMedia);
router.delete('/:userId/media/:mediaId', authguard, usersdata.deleteProfileMedia);

// Block/unblock users
router.post('/block', authguard, usersdata.blockUser);
router.post('/unblock', authguard, usersdata.unblockUser);

module.exports = router;
