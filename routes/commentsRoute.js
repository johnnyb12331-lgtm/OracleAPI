const express = require('express');
const router = express.Router();
const commentsController = require('../controllers/commentsController');
const authguard = require('../guard/authguard');
const { createCommentLimiter, getCommentsLimiter, modifyCommentLimiter } = require('../middlewares/commentRateLimit');

// Create comment
router.post('/:postId', authguard, createCommentLimiter, commentsController.createComment);

// Get comments for a post
router.get('/:postId', getCommentsLimiter, commentsController.getComments);

// Like/unlike comment
router.post('/:commentId/like', authguard, modifyCommentLimiter, commentsController.likeComment);

// React to comment
router.post('/:commentId/react', authguard, modifyCommentLimiter, commentsController.reactToComment);

// Get comment reactions
router.get('/:commentId/reactions', authguard, commentsController.getCommentReactions);

// Delete comment
router.delete('/:commentId', authguard, modifyCommentLimiter, commentsController.deleteComment);

module.exports = router;