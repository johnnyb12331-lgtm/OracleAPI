const express = require('express');
const router = express.Router();
const storiesController = require('../controllers/storiesController');
const authguard = require('../guard/authguard');
const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif', 'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});

router.post('/', authguard, upload.single('image'), storiesController.createStory);
router.get('/', authguard, storiesController.getStories);
router.get('/user/:userId', authguard, storiesController.getUserStories);
router.get('/user/:userId/count', authguard, storiesController.getUserStoryCount);
router.delete('/:storyId', authguard, storiesController.deleteStory);
router.post('/:storyId/view', authguard, storiesController.trackView);
router.post('/:storyId/reaction', authguard, storiesController.addReaction);
router.post('/:storyId/reply', authguard, storiesController.addReply);
router.get('/:storyId/reactions', authguard, storiesController.getReactions);
router.get('/:storyId/replies', authguard, storiesController.getReplies);
router.post('/share', authguard, storiesController.sharePostToStory);

module.exports = router;