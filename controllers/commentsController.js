const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Reaction = require('../models/Reaction');
const UserData = require('../models/UserData');
const { createNotification } = require('./notificationController');
const authguard = require('../guard/authguard');
const socketEmitter = require('../utils/socketEmitter');
const mongoose = require('mongoose');
const contentModerationService = require('../services/contentModerationService');

const createComment = async (req, res) => {
  const startTime = Date.now();
  console.log(`⏱️ Starting comment creation for postId: ${req.params.postId}`);
  try {
    const { postId } = req.params;
    const { content, image, video } = req.body;
    const userId = req.user.userId;

    // Validate input - require either content or media
    if ((!content || content.trim().length === 0) && !image && !video) {
      return res.status(400).json({ status: 'error', message: 'Comment must have content, image, or video' });
    }
    if (content && content.length > 500) {
      return res.status(400).json({ status: 'error', message: 'Comment too long (max 500 characters)' });
    }

    // Use parallel execution for performance
    console.log(`⏱️ ${Date.now() - startTime}ms: Starting DB queries`);
    const [post, userData] = await Promise.all([
      Post.findById(postId),
      UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) })
    ]);
    console.log(`⏱️ ${Date.now() - startTime}ms: DB queries completed`);

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    let userDataToUse = userData;
    if (!userData) {
      // Create user profile with upsert to prevent race conditions
      userDataToUse = await UserData.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId) },
        {
          userId: new mongoose.Types.ObjectId(userId),
          name: 'Anonymous',
          isProfileComplete: false,
          created_at: new Date()
        },
        { 
          upsert: true, 
          new: true
        }
      );
    }

    // Content moderation for comments (only if there's text content)
    if (content && content.trim().length > 0) {
      console.log(`⏱️ ${Date.now() - startTime}ms: Starting comment content moderation...`);
      const moderationResult = await contentModerationService.moderateContent(content.trim());

      if (moderationResult.overall_flagged) {
        console.log(`⏱️ ${Date.now() - startTime}ms: Comment flagged by moderation`);
        console.log('🚫 Comment content flagged by moderation:', moderationResult);

        return res.status(400).json({
          status: 'error',
          message: 'Your comment contains content that violates our community guidelines. Please review and modify your content.',
          details: {
            flagged_categories: moderationResult.blocked_categories,
            text_flagged: moderationResult.text?.flagged || false
          }
        });
      }
      console.log(`⏱️ ${Date.now() - startTime}ms: Comment content passed moderation`);
    }

    // Create comment and update post count
    const commentData = {
      postId: new mongoose.Types.ObjectId(postId),
      userDataId: userDataToUse._id,
      content: content ? content.trim() : ''
    };
    
    // Add media if provided
    if (image) {
      commentData.image = image;
    }
    if (video) {
      commentData.video = video;
    }
    
    const newComment = new Comment(commentData);
    console.log(`⏱️ ${Date.now() - startTime}ms: Saving comment and updating post count`);
    const [savedComment] = await Promise.all([
      newComment.save(),
      Post.findByIdAndUpdate(
        postId, 
        { $inc: { commentsCount: 1 } }
      )
    ]);
    console.log(`⏱️ ${Date.now() - startTime}ms: Comment saved and post updated`);

    // Populate user data for response
    console.log(`⏱️ ${Date.now() - startTime}ms: Populating comment data`);
    const populatedComment = await Comment.findById(savedComment._id)
      .populate('userDataId', 'name avatar')
      .lean(); // Use lean() for better performance
    console.log(`⏱️ ${Date.now() - startTime}ms: Comment populated`);

    // Create notification for post owner (non-blocking)
    if (post.userDataId && post.userDataId.toString() !== userDataToUse._id.toString()) {
      const commenterName = userDataToUse.name || 'Someone';
      process.nextTick(async () => {
        try {
          await createNotification(
            post.userDataId,
            userId,
            'comment',
            `${commenterName} commented on your post`,
            postId,
            savedComment._id
          );
        } catch (error) {
          console.error('Error creating notification for comment:', error);
        }
      });
    }

    // Emit to socket (async, non-blocking)
    process.nextTick(() => {
      socketEmitter.emitNewComment(postId, populatedComment);
    });

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Comment creation completed in ${totalTime}ms`);
    res.status(201).json({ status: 'success', data: populatedComment });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`⏱️ Comment creation failed after ${totalTime}ms:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to create comment' });
  }
};

const getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10)); // Cap at 50
    const skip = (page - 1) * limit;
    
    console.log(`📋 Getting comments for postId: ${postId}, page: ${page}, limit: ${limit}`);

    // First, let's check if there are any comments at all
    const allCommentsCount = await Comment.countDocuments();
    console.log(`📋 Total comments in entire DB: ${allCommentsCount}`);
    
    // Check comments for this specific post
    const totalComments = await Comment.countDocuments({ postId: new mongoose.Types.ObjectId(postId) });
    console.log(`📋 Total comments for this post: ${totalComments}`);

    // If no comments for this post, let's see if the postId is valid
    const Post = require('../models/Post');
    const postExists = await Post.findById(postId);
    console.log(`📋 Post exists: ${postExists ? 'Yes' : 'No'}`);

    // Get comments with populated user data
    const comments = await Comment.find({ postId: new mongoose.Types.ObjectId(postId) })
      .populate({
        path: 'userDataId',
        select: 'name avatar'
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`📋 Found ${comments.length} comments after query`);

    // Get current user's reactions for these comments if authenticated
    let userReactions = {};
    if (req.user?.userId && comments.length > 0) {
      const commentIds = comments.map(comment => comment._id);
      const reactions = await Reaction.find({
        userId: req.user.userId,
        targetType: 'comment',
        targetId: { $in: commentIds }
      });
      
      // Create a map of commentId to reaction type
      userReactions = reactions.reduce((acc, reaction) => {
        acc[reaction.targetId.toString()] = reaction.reactionType;
        return acc;
      }, {});
    }

    // Add current user reaction to each comment
    const commentsWithReactions = comments.map(comment => ({
      ...comment.toObject(),
      currentUserReaction: userReactions[comment._id.toString()] || null
    }));

    res.json({
      status: 'success',
      data: commentsWithReactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
        hasNext: page * limit < totalComments,
        limit
      }
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch comments' });
  }
};

const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: 'Comment content is required' });
    }
    if (content.length > 500) {
      return res.status(400).json({ status: 'error', message: 'Comment too long (max 500 characters)' });
    }

    // Use aggregation to check ownership and update in one query
    const updatedComment = await Comment.findOneAndUpdate(
      { 
        _id: commentId,
        userDataId: { $in: await UserData.distinct('_id', { userId: new mongoose.Types.ObjectId(userId) }) }
      },
      { 
        content: content.trim(),
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true
      }
    ).populate('userDataId', 'name avatar').lean();

    if (!updatedComment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found or unauthorized' });
    }

    res.json({ status: 'success', data: updatedComment });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update comment' });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    // Find and delete comment with ownership check
    const comment = await Comment.findOneAndDelete(
      { 
        _id: commentId,
        userDataId: { $in: await UserData.distinct('_id', { userId: new mongoose.Types.ObjectId(userId) }) }
      }
    );

    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found or unauthorized' });
    }

    // Execute all cleanup operations in parallel
    await Promise.all([
      Post.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } }),
      Like.deleteMany({ targetType: 'comment', targetId: commentId })
    ]);

    res.json({ status: 'success', message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete comment' });
  }
};

const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const existingLike = await Like.findOne({ userId, targetType: 'comment', targetId: commentId });

    if (existingLike) {
      await Like.findByIdAndDelete(existingLike._id);
      await Comment.findByIdAndUpdate(commentId, { $inc: { likesCount: -1 } });
      res.json({ status: 'success', message: 'Comment unliked' });
    } else {
      try {
        const newLike = new Like({ userId, targetType: 'comment', targetId: commentId });
        await newLike.save();
        await Comment.findByIdAndUpdate(commentId, { $inc: { likesCount: 1 } });
        res.json({ status: 'success', message: 'Comment liked' });
      } catch (saveError) {
        // Handle duplicate key error (E11000) - if like already exists due to race condition
        if (saveError.code === 11000) {
          // Find and delete the existing like (treat as unlike)
          const existingLike = await Like.findOne({ userId, targetType: 'comment', targetId: commentId });
          if (existingLike) {
            await Like.findByIdAndDelete(existingLike._id);
            await Comment.findByIdAndUpdate(commentId, { $inc: { likesCount: -1 } });
          }
          res.json({ status: 'success', message: 'Comment unliked' });
        } else {
          throw saveError;
        }
      }
    }
  } catch (error) {
    console.error('Error liking comment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to like comment' });
  }
};

const reactToComment = async (req, res) => {
  console.log('🔥 reactToComment called with commentId:', req.params.commentId, 'userId:', req.user?.userId, 'reactionType:', req.body.reactionType);
  try {
    const { commentId } = req.params;
    const { reactionType } = req.body;
    const userId = req.user.userId;

    // Validate reaction type
    const validReactions = ['like', 'love', 'laugh', 'angry', 'sad', 'wow', 'fire', 'celebrate', 'support', 'dislike'];
    if (!validReactions.includes(reactionType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid reaction type' });
    }

    const existingReaction = await Reaction.findOne({ userId, targetType: 'comment', targetId: commentId });
    console.log('🔍 Existing reaction found:', !!existingReaction, existingReaction?.reactionType);

    if (existingReaction) {
      if (existingReaction.reactionType === reactionType) {
        // Remove reaction if it's the same type
        console.log('👎 Removing reaction');
        await Reaction.findByIdAndDelete(existingReaction._id);
        
        // Decrement reaction count
        const updateField = `reactionsCount.${reactionType}`;
        await Comment.findByIdAndUpdate(commentId, [
          { 
            $set: { 
              [updateField]: { $max: [{ $subtract: [`$${updateField}`, 1] }, 0] },
              'reactionsCount.total': { $max: [{ $subtract: ['$reactionsCount.total', 1] }, 0] }
            } 
          }
        ]);
        
        console.log('✅ Reaction removed successfully');
        const responseData = { status: 'success', message: 'Reaction removed', currentReaction: null };
        res.json(responseData);
      } else {
        // Update reaction type
        console.log('🔄 Updating reaction from', existingReaction.reactionType, 'to', reactionType);
        
        // Update reaction document
        existingReaction.reactionType = reactionType;
        await existingReaction.save();
        
        // Update comment counts (decrement old, increment new)
        const oldField = `reactionsCount.${existingReaction.reactionType}`;
        const newField = `reactionsCount.${reactionType}`;
        
        await Comment.findByIdAndUpdate(commentId, [
          { 
            $set: { 
              [oldField]: { $max: [{ $subtract: [`$${oldField}`, 1] }, 0] },
              [newField]: { $add: [`$${newField}`, 1] }
            } 
          }
        ]);
        
        console.log('✅ Reaction updated successfully');
        const responseData = { status: 'success', message: 'Reaction updated', currentReaction: reactionType };
        res.json(responseData);
      }
    } else {
      // Add new reaction
      console.log('👍 Adding new reaction');
      try {
        const newReaction = new Reaction({ userId, targetType: 'comment', targetId: commentId, reactionType });
        await newReaction.save();
        console.log('✅ Reaction saved, updating comment reaction counts');
        
        // Increment reaction count
        const updateField = `reactionsCount.${reactionType}`;
        await Comment.findByIdAndUpdate(commentId, {
          $inc: { 
            [updateField]: 1,
            'reactionsCount.total': 1
          }
        });

        // Create notification for comment owner
        const comment = await Comment.findById(commentId).populate('userDataId');
        try {
          if (
            comment &&
            comment.userDataId &&
            comment.userDataId.userId &&
            comment.userDataId.userId.toString() !== userId
          ) {
            const reactorData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
            const reactorName = reactorData?.name || 'Someone';
            const reactionEmoji = {
              like: '👍',
              love: '❤️',
              laugh: '😂',
              angry: '😠',
              sad: '😢',
              wow: '😮',
              fire: '🔥',
              celebrate: '🎉',
              support: '🙌',
              dislike: '👎'
            };
            
            try {
              await createNotification(
                comment.userDataId.userId,
                userId,
                'reaction',
                commentId,
                `${reactorName} reacted ${reactionEmoji[reactionType] || reactionType} to your comment`,
                'comment'
              );
            } catch (notificationError) {
              console.error('❌ Error creating reaction notification:', notificationError);
            }
          }
        } catch (notificationSetupError) {
          console.error('❌ Error setting up reaction notification:', notificationSetupError);
        }

        console.log('✅ Reaction added successfully');
        const responseData = { status: 'success', message: 'Reaction added', currentReaction: reactionType };
        res.json(responseData);
      } catch (saveError) {
        console.error('❌ Error saving reaction:', saveError);
        res.status(500).json({ status: 'error', message: 'Failed to add reaction' });
      }
    }
  } catch (error) {
    console.error('❌ Error reacting to comment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to react to comment' });
  }
};

const getCommentReactions = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user?.userId;

    // Get reaction counts
    const comment = await Comment.findById(commentId).select('reactionsCount');
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    // Get current user's reaction if authenticated
    let currentUserReaction = null;
    if (userId) {
      const userReaction = await Reaction.findOne({ userId, targetType: 'comment', targetId: commentId });
      currentUserReaction = userReaction?.reactionType || null;
    }

    res.json({
      status: 'success',
      data: {
        reactionsCount: comment.reactionsCount,
        currentUserReaction
      }
    });
  } catch (error) {
    console.error('❌ Error getting comment reactions:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get comment reactions' });
  }
};

module.exports = {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  likeComment,
  reactToComment,
  getCommentReactions
};