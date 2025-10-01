const express = require('express');
const router = express.Router();
const postsController = require('../controllers/postsController');
const authguard = require('../guard/authguard');
const multer = require('multer');

// Validation middleware
const validatePostCreation = (req, res, next) => {
  // Add validation logic for post content, poll options, etc.
  const hasContent = req.body.content && typeof req.body.content === 'string' && req.body.content.trim().length > 0;
  const hasMedia = req.file || (req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:image/')) || (req.body.video && typeof req.body.video === 'string');
  
  if (!hasContent && !hasMedia) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Content or media is required' 
    });
  }
  next();
};

const validateObjectId = (req, res, next) => {
  const { postId, userId } = req.params;
  // Add MongoDB ObjectId validation if needed
  if (postId && !isValidObjectId(postId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid post ID format' });
  }
  if (userId && !isValidObjectId(userId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid user ID format' });
  }
  next();
};

// Helper function for ObjectId validation
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 
      'image/avif', 'image/heic', 'image/heif',
      'video/mp4', 'video/avi', 'video/mov', 
      'video/wmv', 'video/flv', 'video/webm'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ status: 'error', message: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ status: 'error', message: `Upload error: ${error.message}` });
  } else if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }
  next();
};

// Routes with improved organization

// POST routes
router.post('/', 
  authguard, 
  upload.single('media'), // Changed from 'image' to 'media' since you handle videos too
  handleMulterError,
  validatePostCreation,
  postsController.createPost
);

router.post('/:postId/like', 
  authguard, 
  validateObjectId,
  postsController.likePost
);

router.post('/:postId/react', 
  authguard, 
  validateObjectId,
  postsController.reactToPost
);

router.get('/:postId/reactions', 
  authguard, 
  validateObjectId,
  postsController.getPostReactions
);

router.post('/:postId/hide', 
  authguard, 
  validateObjectId,
  postsController.hidePost
);

router.post('/:postId/report', 
  authguard, 
  validateObjectId,
  postsController.reportPost
);

router.post('/share/feed', 
  authguard,
  postsController.sharePostToFeed
);

router.post('/:postId/view', 
  authguard, 
  validateObjectId,
  postsController.viewPost
);

// GET routes
router.get('/', 
  authguard, 
  postsController.getPosts
);

router.get('/group/:groupId', 
  authguard, 
  validateObjectId,
  postsController.getGroupPosts
);

router.get('/user/:userId', 
  authguard, 
  validateObjectId,
  postsController.getUserPosts
);

router.get('/:postId', 
  authguard, 
  validateObjectId,
  postsController.getPostById
);

router.get('/search/posts', 
  authguard, 
  postsController.searchPosts
);

// PUT route
router.put('/:postId', 
  authguard, 
  validateObjectId,
  upload.single('media'),
  handleMulterError,
  postsController.updatePost
);

// DELETE routes
router.delete('/:postId', 
  authguard, 
  validateObjectId,
  postsController.deletePost
);

router.delete('/:postId/hide', 
  authguard, 
  validateObjectId,
  postsController.unhidePost
);

module.exports = router;