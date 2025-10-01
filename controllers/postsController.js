const Like = require('../models/Like');
const Reaction = require('../models/Reaction');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const UserData = require('../models/UserData');
const Report = require('../models/Report');
const { createNotification } = require('./notificationController');
const authguard = require('../guard/authguard');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { optimizeImage, validateImage, handleDataUrlImage } = require('../utils/imageOptimizer');
const CommentCache = require('../utils/commentCache');
const contentModerationService = require('../services/contentModerationService');
const gamificationController = require('./gamificationController');
const { baseUrl } = require('../server');

// Configure multer for memory storage (we'll process images in memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif', 'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});

const createPost = async (req, res) => {
    const startTime = Date.now();
    console.log(`📝 Post creation attempt started for user: ${req.user?.userId || 'unknown'}`);
    
    try {
      const { content, video, groupId } = req.body;
      const userId = req.user.userId;

    // Input validation
    const hasContent = content && typeof content === 'string' && content.trim().length > 0;
    const hasMedia = req.file || (req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:image/')) || (video && typeof video === 'string');
    
    if (!hasContent && !hasMedia) {
      console.error('Post creation failed: Content or media required', { 
        content: content, 
        hasFile: !!req.file,
        hasImageDataUrl: !!(req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:image/')),
        hasVideo: !!(video && typeof video === 'string'),
        userId: userId 
      });
      return res.status(400).json({ 
        status: 'error', 
        message: 'Content or media is required' 
      });
    }

    if (hasContent && content.length > 1000) {
      console.error('Post creation failed: Content too long', { 
        contentLength: content.length, 
        userId: userId 
      });
      return res.status(400).json({ 
        status: 'error', 
        message: 'Content must be less than 1000 characters' 
      });
    }

    if (!userId) {
      console.error('Post creation failed: Missing user authentication', { 
        userId: userId, 
        body: req.body 
      });
      return res.status(400).json({ 
        status: 'error', 
        message: 'User authentication required' 
      });
    }

    // Validate groupId if provided
    let group = null;
    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Invalid group ID' 
        });
      }
      
      group = await require('../models/Group').findById(groupId);
      if (!group) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Group not found' 
        });
      }
      
      // Check if user is a member of the group
      const isMember = group.participants.some(p => p.user.toString() === userId);
      if (!isMember) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'You must be a member of the group to post' 
        });
      }
    }

    // Handle media upload (image or video)
    let optimizedImagePath = null;
    let videoPath = null;
    if (req.file) {
      try {
        if (req.file.mimetype.startsWith('image/')) {
          console.log(`🖼️ Processing image upload: ${req.file.originalname} (${req.file.size} bytes)`);
          
          // Validate image
          validateImage(req.file.buffer, req.file.mimetype);
          
          // Optimize image
          optimizedImagePath = await optimizeImage(
            req.file.buffer, 
            req.file.originalname, 
            'uploads'
          );
          
          console.log(`✅ Image optimized and saved: ${optimizedImagePath}`);
        } else if (req.file.mimetype.startsWith('video/')) {
          console.log(`🎥 Processing video upload: ${req.file.originalname} (${req.file.size} bytes)`);
          
          // Save video without optimization
          const fs = require('fs').promises;
          const path = require('path');
          const timestamp = Date.now();
          const baseName = path.parse(req.file.originalname).name;
          const videoFilename = `${baseName}_${timestamp}${path.extname(req.file.originalname)}`;
          videoPath = path.join('uploads', videoFilename);
          
          // Ensure upload directory exists
          await fs.mkdir('uploads', { recursive: true });
          
          // Write video file
          await fs.writeFile(videoPath, req.file.buffer);
          
          console.log(`✅ Video saved: ${videoFilename}`);
          videoPath = videoFilename; // relative path
        } else {
          return res.status(400).json({ 
            status: 'error', 
            message: 'Unsupported file type' 
          });
        }
      } catch (mediaError) {
        console.error('❌ Media processing failed:', mediaError);
        return res.status(400).json({ 
          status: 'error', 
          message: mediaError.message || 'Failed to process media' 
        });
      }
    } else if (req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:image/')) {
      try {
        console.log(`🖼️ Processing data URL image`);
        
        // Handle data URL image
        optimizedImagePath = await handleDataUrlImage(
          req.body.image,
          `post_image_${Date.now()}.png`, // Default filename
          'uploads'
        );
        
        console.log(`✅ Data URL image processed and saved: ${optimizedImagePath}`);
      } catch (imageError) {
        console.error('❌ Data URL image processing failed:', imageError);
        return res.status(400).json({ 
          status: 'error', 
          message: imageError.message || 'Failed to process data URL image' 
        });
      }
    }

    let userData;
    try {
      userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
      if (!userData) {
        userData = new UserData({
          userId: new mongoose.Types.ObjectId(userId),
          name: 'User',
          dateOfBirth: new Date('2000-01-01'),
          gender: 'other'
        });
        await userData.save();
      }
    } catch (userDataError) {
      console.error('Error with user data:', userDataError);
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to retrieve or create user data' 
      });
    }

    // Content moderation
    console.log('🔍 Starting content moderation...');
    const moderationResult = await contentModerationService.moderateContent(
      content.trim(),
      optimizedImagePath ? path.join('uploads', optimizedImagePath) : null
    );

    // TEMPORARILY DISABLE MODERATION FOR TESTING
    // if (moderationResult.overall_flagged) {
    if (false) { // Disabled for testing
      console.log('🚫 Content flagged by moderation:', moderationResult);
      
      // Clean up uploaded media if it was flagged
      if (optimizedImagePath) {
        try {
          const fs = require('fs');
          const path = require('path');
          const imageFullPath = path.join('uploads', optimizedImagePath);
          if (fs.existsSync(imageFullPath)) {
            fs.unlinkSync(imageFullPath);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up flagged image:', cleanupError);
        }
      }
      if (videoPath) {
        try {
          const fs = require('fs');
          const path = require('path');
          const videoFullPath = path.join('uploads', videoPath);
          if (fs.existsSync(videoFullPath)) {
            fs.unlinkSync(videoFullPath);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up flagged video:', cleanupError);
        }
      }

      return res.status(400).json({
        status: 'error',
        message: 'Your post contains content that violates our community guidelines. Please review and modify your content.',
        details: {
          flagged_categories: moderationResult.blocked_categories,
          text_flagged: moderationResult.text?.flagged || false,
          image_flagged: moderationResult.image?.flagged || false
        }
      });
    }
    console.log('✅ Content passed moderation');

    const newPost = new Post({
      userDataId: userData._id,
      groupId: groupId ? new mongoose.Types.ObjectId(groupId) : null,
      content: content.trim(),
      image: optimizedImagePath,
      video: videoPath || video
    });

    let savedPost;
    try {
      savedPost = await newPost.save();
    } catch (saveError) {
      console.error('Error saving post:', saveError);
      
      if (saveError.name === 'ValidationError') {
        const errors = Object.values(saveError.errors).map(err => err.message);
        console.error('Post validation failed:', { 
          validationErrors: errors, 
          userId: userId, 
          content: content?.substring(0, 100) 
        });
        return res.status(400).json({ 
          status: 'error', 
          message: 'Validation failed', 
          details: errors 
        });
      }
      
      if (saveError.code === 11000) {
        console.error('Post creation failed: Duplicate key error', { 
          errorCode: saveError.code, 
          userId: userId, 
          content: content?.substring(0, 100) 
        });
        return res.status(409).json({ 
          status: 'error', 
          message: 'Duplicate post detected' 
        });
      }
      
      console.error('Post creation failed: Database save error', { 
        errorName: saveError.name, 
        errorCode: saveError.code, 
        userId: userId 
      });
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to save post to database' 
      });
    }

    // Populate user data
    let populatedPost;
    try {
      populatedPost = await Post.findById(savedPost._id).populate('userDataId', 'name avatar');
    } catch (populateError) {
      console.error('Error populating post:', populateError);
      // Return the post without populated data as fallback
      populatedPost = savedPost;
    }

    // Add isLikedByCurrentUser field (new posts are never liked by current user initially)
    const postResponse = {
      ...populatedPost.toObject(),
      isLikedByCurrentUser: false
    };

    // Construct full URLs for images and avatars in the response
    if (postResponse.image && !postResponse.image.startsWith('http') && !postResponse.image.startsWith('data:') && postResponse.image.includes('.')) {
      postResponse.image = `${baseUrl}/uploads/${postResponse.image}`;
    }
    if (postResponse.userDataId && postResponse.userDataId.avatar && !postResponse.userDataId.avatar.startsWith('http') && !postResponse.userDataId.avatar.startsWith('data:') && postResponse.userDataId.avatar.includes('.')) {
      postResponse.userDataId.avatar = `${baseUrl}/uploads/${postResponse.userDataId.avatar}`;
    }

    // Track gamification activity
    try {
      await gamificationController.trackActivityInternal(userId, 'post_created');
    } catch (gamificationError) {
      console.error('Gamification tracking error:', gamificationError);
      // Don't fail the post creation if gamification fails
    }

    res.status(201).json({ status: 'success', data: postResponse });
    const duration = Date.now() - startTime;
    console.log(`✅ Post created successfully in ${duration}ms for user: ${req.user?.userId || 'unknown'}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Post creation failed after ${duration}ms:`, error);
    res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred while creating the post' 
    });
  }
};

const getPosts = async (req, res) => {
  console.log(`📋 Get posts request for user: ${req.user?.userId || 'unknown'}, page: ${req.query.page || 1}`);

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Try to get from cache first (for first page only, as it's most frequently accessed)
    if (page === 1) {
      const cachedPosts = CommentCache.getFrequentPosts(page, limit);
      if (cachedPosts) {
        console.log('📋 Serving posts from cache');
        return res.json({
          status: 'success',
          data: cachedPosts.data,
          pagination: cachedPosts.pagination,
          cached: true
        });
      }
    }

    const skip = (page - 1) * limit;
    const userId = req.user.userId;

    // Get user's hidden posts
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    const hiddenPosts = userData ? userData.hiddenPosts : [];

    const posts = await Post.find({ 
      _id: { $nin: hiddenPosts },
      isHidden: { $ne: true } // Exclude posts hidden by moderation
    })
      .populate('userDataId', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get likes and reactions for the current user on these posts
    const postIds = posts.map(post => post._id);
    const userLikes = await Like.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetId: { $in: postIds },
      targetType: 'post'
    }).select('targetId');

    const userReactions = await Reaction.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetId: { $in: postIds },
      targetType: 'post'
    }).select('targetId reactionType');

    // Create a set of liked post IDs for quick lookup
    const likedPostIds = new Set(userLikes.map(like => like.targetId.toString()));
    
    // Create a map of user reactions for quick lookup
    const userReactionMap = new Map();
    userReactions.forEach(reaction => {
      userReactionMap.set(reaction.targetId.toString(), reaction.reactionType);
    });

    // Add isLikedByCurrentUser and currentUserReaction fields to each post
    posts.forEach(post => {
      post.isLikedByCurrentUser = likedPostIds.has(post._id.toString());
      post.currentUserReaction = userReactionMap.get(post._id.toString()) || null;
    });

    // Construct full URLs for images and avatars
    posts.forEach(post => {
      console.log(`🖼️ Processing post ${post._id} image: ${post.image}`);
      if (post.image && !post.image.startsWith('http') && !post.image.startsWith('data:') && post.image.includes('.')) {
        const oldImage = post.image;
        post.image = `${baseUrl}/uploads/${post.image}`;
        console.log(`✅ Image URL constructed: ${oldImage} -> ${post.image}`);
      } else if (post.image) {
        console.log(`ℹ️ Image URL already complete or data URL: ${post.image.startsWith('http') ? 'HTTP URL' : post.image.startsWith('data:') ? 'Data URL' : 'Other format'}`);
      }
      if (post.userDataId && post.userDataId.avatar && !post.userDataId.avatar.startsWith('http') && !post.userDataId.avatar.startsWith('data:') && post.userDataId.avatar.includes('.')) {
        post.userDataId.avatar = `${baseUrl}/uploads/${post.userDataId.avatar}`;
      }
    });

    const totalPosts = await Post.countDocuments({ 
      _id: { $nin: hiddenPosts },
      isHidden: { $ne: true }
    });

    const responseData = {
      status: 'success',
      data: posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNext: page * limit < totalPosts
      }
    };

    // Cache the first page for better performance
    if (page === 1) {
      CommentCache.setFrequentPosts(page, limit, responseData);
      console.log('📋 Posts cached for future requests');
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch posts' });
  }
};

const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId).populate('userDataId', 'name avatar');

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    // Construct full URLs for images and avatars
    console.log(`🖼️ Processing single post ${post._id} image: ${post.image}`);
    if (post.image && !post.image.startsWith('http') && !post.image.startsWith('data:') && post.image.includes('.')) {
      const oldImage = post.image;
      post.image = `${baseUrl}/uploads/${post.image}`;
      console.log(`✅ Image URL constructed: ${oldImage} -> ${post.image}`);
    } else if (post.image) {
      console.log(`ℹ️ Image URL already complete or data URL: ${post.image.startsWith('http') ? 'HTTP URL' : post.image.startsWith('data:') ? 'Data URL' : 'Other format'}`);
    }
    if (post.userDataId && post.userDataId.avatar && !post.userDataId.avatar.startsWith('http') && !post.userDataId.avatar.startsWith('data:') && post.userDataId.avatar.includes('.')) {
      post.userDataId.avatar = `${baseUrl}/uploads/${post.userDataId.avatar}`;
    }

    res.json({ status: 'success', data: post });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch post' });
  }
};

const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, image, video } = req.body;
    const userId = req.user.userId;

    const userData = await UserData.findOne({ userId });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    const post = await Post.findOne({ _id: postId, userDataId: userData._id });

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found or unauthorized' });
    }

    post.content = content || post.content;
    post.image = image !== undefined ? image : post.image;
    post.video = video !== undefined ? video : post.video;

    await post.save();

    res.json({ status: 'success', data: post });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update post' });
  }
};

const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const userData = await UserData.findOne({ userId });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    const post = await Post.findOneAndDelete({ _id: postId, userDataId: userData._id });

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found or unauthorized' });
    }

    // Delete associated likes and comments
    await Like.deleteMany({ targetType: 'post', targetId: postId });
    await Comment.deleteMany({ postId });

    res.json({ status: 'success', message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete post' });
  }
};

const likePost = async (req, res) => {
  console.log('🔥 likePost called with postId:', req.params.postId, 'userId:', req.user?.userId);
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const existingLike = await Like.findOne({ userId, targetType: 'post', targetId: postId });
    console.log('🔍 Existing like found:', !!existingLike);

    if (existingLike) {
      console.log('👎 Unliking post');
      await Like.findByIdAndDelete(existingLike._id);
      // Use aggregation pipeline to decrement likesCount but ensure it doesn't go below 0
      await Post.findByIdAndUpdate(postId, [
        { $set: { likesCount: { $max: [{ $subtract: ['$likesCount', 1] }, 0] } } }
      ]);
      console.log('✅ Post unliked successfully');
      const responseData = { status: 'success', message: 'Post unliked' };
      console.log('📤 Sending response:', JSON.stringify(responseData));
      res.json(responseData);
    } else {
      console.log('👍 Liking post');
      try {
        const newLike = new Like({ userId, targetType: 'post', targetId: postId });
        await newLike.save();
        console.log('✅ Like saved, updating post likes count');
        await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });

        // Create notification for post owner (guard against missing fields)
        const post = await Post.findById(postId).populate('userDataId');
        try {
          if (
            post &&
            post.userDataId &&
            post.userDataId.userId &&
            post.userDataId.userId.toString() !== userId
          ) {
            const likerData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
            const likerName = likerData?.name || 'Someone';
            // Wrap notification creation to ensure it doesn't cause the like endpoint to fail
            try {
              await createNotification(
                post.userDataId.userId,
                userId,
                'like',
                `${likerName} liked your post`,
                postId
              );
            } catch (notifyError) {
              console.error('Error creating like notification:', notifyError);
              // Don't rethrow; notification failure shouldn't block the like action
            }
          }
        } catch (e) {
          // Defensive catch in case post.userDataId is not the expected shape
          console.error('Error while checking post owner for notification:', e);
        }

        console.log('✅ Post liked successfully');
        const responseData = { status: 'success', message: 'Post liked' };
        console.log('📤 Sending response:', JSON.stringify(responseData));
        res.json(responseData);
      } catch (saveError) {
        // Handle duplicate key error (E11000) - if like already exists due to race condition
        if (saveError.code === 11000) {
          // Find and delete the existing like (treat as unlike)
          const existingLike = await Like.findOne({ userId, targetType: 'post', targetId: postId });
          if (existingLike) {
            await Like.findByIdAndDelete(existingLike._id);
            // Use aggregation pipeline to decrement likesCount but ensure it doesn't go below 0
            await Post.findByIdAndUpdate(postId, [
              { $set: { likesCount: { $max: [{ $subtract: ['$likesCount', 1] }, 0] } } }
            ]);
          }
          res.json({ status: 'success', message: 'Post unliked' });
        } else {
          throw saveError;
        }
      }
    }
  } catch (error) {
    console.error('❌ Error liking post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to like post' });
  }
};

const reactToPost = async (req, res) => {
  console.log('🔥 reactToPost called with postId:', req.params.postId, 'userId:', req.user?.userId, 'reactionType:', req.body.reactionType);
  try {
    const { postId } = req.params;
    const { reactionType } = req.body;
    const userId = req.user.userId;

    // Validate reaction type
    const validReactions = ['like', 'love', 'laugh', 'angry', 'sad', 'wow', 'fire', 'celebrate', 'support', 'dislike'];
    if (!validReactions.includes(reactionType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid reaction type' });
    }

    const existingReaction = await Reaction.findOne({ userId, targetType: 'post', targetId: postId });
    console.log('🔍 Existing reaction found:', !!existingReaction, existingReaction?.reactionType);

    if (existingReaction) {
      if (existingReaction.reactionType === reactionType) {
        // Remove reaction if it's the same type
        console.log('👎 Removing reaction');
        await Reaction.findByIdAndDelete(existingReaction._id);
        
        // Decrement reaction count
        const updateField = `reactionsCount.${reactionType}`;
        await Post.findByIdAndUpdate(postId, [
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
        
        // Update post counts (decrement old, increment new)
        const oldField = `reactionsCount.${existingReaction.reactionType}`;
        const newField = `reactionsCount.${reactionType}`;
        
        await Post.findByIdAndUpdate(postId, [
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
        const newReaction = new Reaction({ userId, targetType: 'post', targetId: postId, reactionType });
        await newReaction.save();
        console.log('✅ Reaction saved, updating post reaction counts');
        
        // Increment reaction count
        const updateField = `reactionsCount.${reactionType}`;
        await Post.findByIdAndUpdate(postId, {
          $inc: { 
            [updateField]: 1,
            'reactionsCount.total': 1
          }
        });

        // Create notification for post owner
        const post = await Post.findById(postId).populate('userDataId');
        try {
          if (
            post &&
            post.userDataId &&
            post.userDataId.userId &&
            post.userDataId.userId.toString() !== userId
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
                post.userDataId.userId,
                userId,
                'reaction',
                `${reactorName} reacted ${reactionEmoji[reactionType]} to your post`,
                postId
              );
            } catch (notifyError) {
              console.error('Error creating reaction notification:', notifyError);
            }
          }
        } catch (e) {
          console.error('Error while checking post owner for notification:', e);
        }

        console.log('✅ Post reaction added successfully');
        const responseData = { status: 'success', message: 'Reaction added', currentReaction: reactionType };
        res.json(responseData);
      } catch (saveError) {
        if (saveError.code === 11000) {
          // Handle race condition
          const existingReaction = await Reaction.findOne({ userId, targetType: 'post', targetId: postId });
          if (existingReaction) {
            res.json({ status: 'success', message: 'Reaction already exists', currentReaction: existingReaction.reactionType });
          } else {
            throw saveError;
          }
        } else {
          throw saveError;
        }
      }
    }
  } catch (error) {
    console.error('❌ Error reacting to post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to react to post' });
  }
};

const getPostReactions = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.userId;

    // Get reaction counts
    const post = await Post.findById(postId).select('reactionsCount');
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    // Get current user's reaction if authenticated
    let currentUserReaction = null;
    if (userId) {
      const userReaction = await Reaction.findOne({ userId, targetType: 'post', targetId: postId });
      currentUserReaction = userReaction?.reactionType || null;
    }

    res.json({
      status: 'success',
      data: {
        reactionsCount: post.reactionsCount,
        currentUserReaction
      }
    });
  } catch (error) {
    console.error('❌ Error getting post reactions:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get post reactions' });
  }
};

const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find userData for the userId
    const userData = await UserData.findOne({ userId });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    const posts = await Post.find({ userDataId: userData._id })
      .populate('userDataId', 'name avatar')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    // Construct full URLs for images and avatars
    posts.forEach(post => {
      if (post.image && !post.image.startsWith('http')) {
        post.image = `${baseUrl}/${post.image}`;
      }
      if (post.userDataId && post.userDataId.avatar && !post.userDataId.avatar.startsWith('http')) {
        post.userDataId.avatar = `${baseUrl}/${post.userDataId.avatar}`;
      }
    });

    const totalPosts = await Post.countDocuments({ userDataId: userData._id });

    res.json({
      status: 'success',
      data: posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNext: page * limit < totalPosts
      }
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch user posts' });
  }
};

const hidePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Find the user's UserData
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User data not found' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    // Add post to hidden posts if not already hidden
    if (!userData.hiddenPosts.includes(postId)) {
      userData.hiddenPosts.push(postId);
      await userData.save();
    }

    res.json({ status: 'success', message: 'Post hidden successfully' });
  } catch (error) {
    console.error('Error hiding post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to hide post' });
  }
};

const unhidePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Find the user's UserData
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User data not found' });
    }

    // Remove post from hidden posts
    userData.hiddenPosts = userData.hiddenPosts.filter(id => id.toString() !== postId);
    await userData.save();

    res.json({ status: 'success', message: 'Post unhidden successfully' });
  } catch (error) {
    console.error('Error unhiding post:', error);
    res.status(500).json({ status: 'error', message: 'Failed to unhide post' });
  }
};

const handleAutomatedActions = async (post, report) => {
  try {
    // Count total reports for this post
    const reportCount = await Report.countDocuments({ 
      postId: post._id,
      status: { $in: ['pending', 'under_review'] }
    });

    // Get post author
    const postAuthor = await UserData.findById(post.userDataId);
    if (!postAuthor) return;

    let automatedAction = 'none';
    let shouldExecuteAction = false;

    // Determine action based on severity and report count
    if (report.severity === 'critical') {
      // Immediate action for critical reports
      automatedAction = 'hide_post';
      shouldExecuteAction = true;
    } else if (report.severity === 'high' && reportCount >= 3) {
      automatedAction = 'hide_post';
      shouldExecuteAction = true;
    } else if (report.severity === 'high' && reportCount >= 5) {
      automatedAction = 'delete_post';
      shouldExecuteAction = true;
    } else if (reportCount >= 10) {
      // Many reports regardless of severity
      automatedAction = 'hide_post';
      shouldExecuteAction = true;
    }

    if (shouldExecuteAction) {
      report.automated_action = automatedAction;
      report.action_taken = true;
      report.action_timestamp = new Date();
      report.status = 'resolved';
      report.moderator_notes = `Automated action: ${automatedAction} due to ${reportCount} reports`;

      if (automatedAction === 'hide_post') {
        // Hide the post
        post.isHidden = true;
        post.hiddenReason = 'automated_action';
        post.hiddenAt = new Date();
        await post.save();
      } else if (automatedAction === 'delete_post') {
        // Delete the post
        await Post.findByIdAndDelete(post._id);
        report.moderator_notes += ' - Post deleted';
      }

      await report.save();
      console.log(`🤖 Automated action executed: ${automatedAction} for post ${post._id}`);
    }
  } catch (error) {
    console.error('Error in automated actions:', error);
  }
};

const reportPost = async (req, res) => {
  const startTime = Date.now();
  console.log(`🚨 Post report attempt started for user: ${req.user?.userId || 'unknown'}`);

  try {
    const { postId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user.userId;

    // Input validation
    if (!postId) {
      return res.status(400).json({
        status: 'error',
        message: 'Post ID is required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Report reason is required'
      });
    }

    const validReasons = [
      'spam', 'harassment', 'inappropriate_content', 'violence', 'hate_speech', 
      'copyright_violation', 'adult_content', 'self_harm', 'terrorism', 
      'child_exploitation', 'impersonation', 'scam_fraud', 'other'
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid report reason'
      });
    }

    if (description && description.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Description must be less than 500 characters'
      });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    // Check if user already reported this post
    const existingReport = await Report.findOne({
      postId: new mongoose.Types.ObjectId(postId),
      reporterId: new mongoose.Types.ObjectId(userId)
    });

    if (existingReport) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reported this post'
      });
    }

    // Get user data
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User data not found'
      });
    }

    // Create the report
    const newReport = new Report({
      postId: new mongoose.Types.ObjectId(postId),
      reporterId: userData._id,
      reason,
      description: description?.trim()
    });

    await newReport.save();

    // Check for automated actions based on severity and report count
    await handleAutomatedActions(post, newReport);

    console.log(`✅ Post reported successfully in ${Date.now() - startTime}ms`);
    res.status(201).json({
      status: 'success',
      message: 'Post reported successfully',
      data: {
        reportId: newReport._id,
        reason: newReport.reason,
        status: newReport.status,
        automated_action: newReport.automated_action
      }
    });
  } catch (error) {
    console.error('Error reporting post:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to report post'
    });
  }
};

const searchPosts = async (req, res) => {
  const { query, userId, startDate, endDate, limit = 20 } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ status: 'error', message: 'Query must be at least 2 characters' });
  }

  try {
    // Build search query
    let searchQuery = { $text: { $search: query.trim() } };

    // Add filters
    if (userId) {
      // Find UserData by userId
      const userData = await UserData.findOne({ userId });
      if (userData) {
        searchQuery.userDataId = userData._id;
      } else {
        return res.status(200).json({ status: 'success', posts: [] });
      }
    }

    if (startDate || endDate) {
      searchQuery.created_at = {};
      if (startDate) {
        searchQuery.created_at.$gte = new Date(startDate);
      }
      if (endDate) {
        searchQuery.created_at.$lte = new Date(endDate);
      }
    }

    const posts = await Post.find(searchQuery)
      .populate('userDataId', 'name avatar')
      .select('content image video likesCount commentsCount created_at userDataId')
      .limit(parseInt(limit))
      .sort({ score: { $meta: 'textScore' }, created_at: -1 }); // Sort by relevance then by date

    // Construct full URLs for images and avatars
    posts.forEach(post => {
      if (post.image && !post.image.startsWith('http')) {
        post.image = `${baseUrl}/${post.image}`;
      }
      if (post.userDataId && post.userDataId.avatar && !post.userDataId.avatar.startsWith('http')) {
        post.userDataId.avatar = `${baseUrl}/${post.userDataId.avatar}`;
      }
    });

    res.status(200).json({ status: 'success', posts });

  } catch (err) {
    console.error('[searchPosts] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const viewPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Increment view count
    await Post.findByIdAndUpdate(postId, { $inc: { viewsCount: 1 } });

    res.json({ status: 'success', message: 'Post view recorded' });
  } catch (error) {
    console.error('Error recording post view:', error);
    res.status(500).json({ status: 'error', message: 'Failed to record view' });
  }
};

const sharePostToFeed = async (req, res) => {
  const startTime = Date.now();
  console.log(`🔗 Post share to feed attempt started for user: ${req.user?.userId || 'unknown'}`);

  try {
    const { postId, content } = req.body;
    const userId = req.user.userId;

    // Input validation
    if (!postId) {
      return res.status(400).json({
        status: 'error',
        message: 'Post ID is required'
      });
    }

    // Check if original post exists
    const originalPost = await Post.findById(postId);
    if (!originalPost) {
      return res.status(404).json({
        status: 'error',
        message: 'Original post not found'
      });
    }

    // Create shared post
    const sharedPost = new Post({
      userDataId: userId,
      content: content || `Shared a post: ${originalPost.content}`,
      image: originalPost.image,
      video: originalPost.video,
      // Don't copy likes, comments, etc. - this is a new post
    });

    await sharedPost.save();

    console.log(`✅ Post shared to feed successfully in ${Date.now() - startTime}ms`);
    res.status(201).json({
      status: 'success',
      message: 'Post shared to feed successfully',
      post: sharedPost
    });

  } catch (error) {
    console.error('❌ Error sharing post to feed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

const getGroupPosts = async (req, res) => {
  console.log(`📋 Get group posts request for user: ${req.user?.userId || 'unknown'}, group: ${req.params.groupId}, page: ${req.query.page || 1}`);

  try {
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.userId;

    // Validate group exists and user is a member
    const Group = require('../models/Group');
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Group not found' 
      });
    }

    const isMember = group.participants.some(p => p.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'You must be a member of the group to view posts' 
      });
    }

    const skip = (page - 1) * limit;

    // Get user's hidden posts
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    const hiddenPosts = userData ? userData.hiddenPosts : [];

    const posts = await Post.find({ 
      groupId: new mongoose.Types.ObjectId(groupId),
      _id: { $nin: hiddenPosts },
      isHidden: { $ne: true }
    })
      .populate('userDataId', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get likes and reactions for the current user on these posts
    const postIds = posts.map(post => post._id);
    const userLikes = await Like.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetId: { $in: postIds },
      targetType: 'post'
    }).select('targetId');

    const userReactions = await Reaction.find({
      userId: new mongoose.Types.ObjectId(userId),
      targetId: { $in: postIds },
      targetType: 'post'
    }).select('targetId reactionType');

    const likedPostIds = new Set(userLikes.map(like => like.targetId.toString()));
    
    const userReactionMap = new Map();
    userReactions.forEach(reaction => {
      userReactionMap.set(reaction.targetId.toString(), reaction.reactionType);
    });

    // Add isLikedByCurrentUser and currentUserReaction fields to each post
    posts.forEach(post => {
      post.isLikedByCurrentUser = likedPostIds.has(post._id.toString());
      post.currentUserReaction = userReactionMap.get(post._id.toString()) || null;
    });

    // Construct full URLs for images and avatars
    posts.forEach(post => {
      if (post.image && !post.image.startsWith('http') && !post.image.startsWith('data:') && post.image.includes('.')) {
        post.image = `${baseUrl}/uploads/${post.image}`;
      }
      if (post.userDataId && post.userDataId.avatar && !post.userDataId.avatar.startsWith('http') && !post.userDataId.avatar.startsWith('data:') && post.userDataId.avatar.includes('.')) {
        post.userDataId.avatar = `${baseUrl}/uploads/${post.userDataId.avatar}`;
      }
    });

    const totalPosts = await Post.countDocuments({ 
      groupId: new mongoose.Types.ObjectId(groupId),
      _id: { $nin: hiddenPosts },
      isHidden: { $ne: true }
    });

    res.json({
      status: 'success',
      data: posts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNext: page * limit < totalPosts
      }
    });

  } catch (error) {
    console.error('❌ Error fetching group posts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createPost,
  getPosts,
  getGroupPosts,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  reactToPost,
  getPostReactions,
  getUserPosts,
  hidePost,
  unhidePost,
  reportPost,
  searchPosts,
  viewPost,
  sharePostToFeed
};