const Story = require('../models/Story');
const Post = require('../models/Post');
const UserData = require('../models/UserData');
const Follower = require('../models/Follower');
const StoryReaction = require('../models/StoryReaction');
const StoryReply = require('../models/StoryReply');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const { optimizeImage, validateImage, validateVideo, optimizeVideo } = require('../utils/imageOptimizer');
const { baseUrl } = require('../server');
const BASE_URL = baseUrl || 'http://192.168.40.197:3001';

const createStory = async (req, res) => {
  const startTime = Date.now();
  console.log(`📖 Story creation attempt started for user: ${req.user?.userId || 'unknown'}`);

  try {
    const { content, privacy } = req.body;
    const userId = req.user.userId;

    // Input validation
    if (!req.file) {
      console.error('Story creation failed: Image file validation error');
      return res.status(400).json({ 
        status: 'error', 
        message: 'Image file is required' 
      });
    }

    // Handle image/video upload and optimization
    let optimizedMediaPath = null;
    let mediaType = 'image';
    try {
      console.log(`🖼️ Processing story media upload: ${req.file.originalname} (${req.file.size} bytes)`);
      
      // Determine media type
      const mimeType = req.file.mimetype;
      if (mimeType.startsWith('video/')) {
        mediaType = 'video';
      } else if (mimeType.startsWith('image/')) {
        mediaType = 'image';
      } else {
        throw new Error('Unsupported media type. Only images and videos are allowed.');
      }
      
      // Validate and process based on type
      if (mediaType === 'image') {
        validateImage(req.file.buffer, mimeType);
        optimizedMediaPath = await optimizeImage(
          req.file.buffer, 
          req.file.originalname, 
          'uploads'
        );
      } else if (mediaType === 'video') {
        validateVideo(req.file.buffer, mimeType);
        optimizedMediaPath = await optimizeVideo(
          req.file.buffer, 
          req.file.originalname, 
          'uploads'
        );
      }
      
      console.log(`✅ Story media processed and saved: ${optimizedMediaPath} (type: ${mediaType})`);
    } catch (mediaError) {
      console.error('❌ Story media processing failed:', mediaError);
      return res.status(400).json({ 
        status: 'error', 
        message: mediaError.message || 'Failed to process media' 
      });
    }

    if (content && (typeof content !== 'string' || content.length > 200)) {
      console.error('Story creation failed: Content validation error', {
        content: content,
        contentLength: content?.length,
        userId: userId
      });
      return res.status(400).json({
        status: 'error',
        message: 'Content must be a string with maximum 200 characters'
      });
    }

    // Validate privacy setting
    const validPrivacy = ['public', 'friends', 'close_friends'];
    const storyPrivacy = privacy && validPrivacy.includes(privacy) ? privacy : 'friends';

    if (!userId) {
      console.error('Story creation failed: Missing user authentication', {
        userId: userId,
        body: req.body
      });
      return res.status(400).json({
        status: 'error',
        message: 'User authentication required'
      });
    }

    // Verify user exists
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      console.error('Story creation failed: User data not found', { userId: userId });
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found. Please complete your profile setup.'
      });
    }

    // Create the story
    const newStory = new Story({
      userDataId: userData._id,
      imageUrl: optimizedMediaPath,
      content: content?.trim(),
      mediaType: mediaType,
      privacy: storyPrivacy,
    });

    const savedStory = await newStory.save();

    // Save the userDataId before populating (populate modifies the field)
    const userDataId = savedStory.userDataId;

    // Populate user data for response
    await savedStory.populate('userDataId', 'name avatar');

    // Construct full URLs for images and avatars in the response
    const responseData = {
      _id: savedStory._id,
      userDataId: userDataId,  // Use the original ObjectId string
      imageUrl: savedStory.imageUrl,
      content: savedStory.content,
      mediaType: savedStory.mediaType,
      privacy: savedStory.privacy,
      created_at: savedStory.created_at,
      expires_at: savedStory.expires_at,
      userData: savedStory.userDataId  // This is now the populated user data
    };

    // Construct full URLs for images and avatars
    if (responseData.imageUrl && !responseData.imageUrl.startsWith('http') && !responseData.imageUrl.startsWith('data:') && responseData.imageUrl.includes('.')) {
      responseData.imageUrl = `${BASE_URL}/uploads/${responseData.imageUrl}`;
    }
    if (responseData.userData && responseData.userData.avatar && !responseData.userData.avatar.startsWith('http') && !responseData.userData.avatar.startsWith('data:') && responseData.userData.avatar.includes('.')) {
      responseData.userData.avatar = `${BASE_URL}/uploads/${responseData.userData.avatar}`;
    }

    const endTime = Date.now();
    console.log(`✅ Story created successfully in ${endTime - startTime}ms`, {
      storyId: savedStory._id,
      userId: userId,
      userDataId: userData._id
    });

    res.status(201).json({
      status: 'success',
      message: 'Story created successfully',
      data: responseData
    });

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ Story creation failed after ${endTime - startTime}ms:`, error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        message: 'Validation error: ' + Object.values(error.errors).map(err => err.message).join(', ')
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while creating story'
    });
  }
};

const getStories = async (req, res) => {
  const startTime = Date.now();
  console.log(`📖 Stories fetch attempt started for user: ${req.user?.userId || 'unknown'}`);

  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get user data to find friends/following users
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found'
      });
    }

    // Get list of users that the current user is following
    const following = await Follower.find({ follower_user_id: userId })
      .select('following_user_id')
      .lean();

    const followingUserIds = following.map(f => f.following_user_id);

    // Include the user's own stories as well
    followingUserIds.push(userData._id);

    // Build privacy filter
    const privacyFilter = {
      $or: [
        { privacy: 'public' }, // Public stories visible to all
        { 
          privacy: { $in: ['friends', 'close_friends'] }, // Friends/close friends stories
          userDataId: { $in: followingUserIds } // Only from followed users
        },
        { userDataId: userData._id } // User's own stories (regardless of privacy)
      ]
    };

    // For now, get all non-expired stories with privacy filtering
    const stories = await Story.find({
      expires_at: { $gt: new Date() },
      ...privacyFilter
    })
    .populate('userDataId', 'name avatar')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);

    const totalStories = await Story.countDocuments({
      expires_at: { $gt: new Date() },
      ...privacyFilter
    });

    // Construct full URLs for avatars and images
    stories.forEach(story => {
      if (story.userDataId && story.userDataId.avatar && !story.userDataId.avatar.startsWith('http') && !story.userDataId.avatar.startsWith('data:')) {
        if (story.userDataId.avatar.includes('.')) {
          // Check if it's an avatar (stored in uploads/avatars) or other media (in uploads)
          if (story.userDataId.avatar.startsWith('avatar_')) {
            story.userDataId.avatar = `${BASE_URL}/uploads/avatars/${story.userDataId.avatar}`;
          } else {
            story.userDataId.avatar = `${BASE_URL}/uploads/${story.userDataId.avatar}`;
          }
        } else {
          // Only create base64 data URL if the string looks like valid base64
          // Base64 strings should only contain A-Z, a-z, 0-9, +, /, and = for padding
          const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
          if (base64Pattern.test(story.userDataId.avatar) && story.userDataId.avatar.length > 100) {
            story.userDataId.avatar = `data:image/jpeg;base64,${story.userDataId.avatar}`;
          } else {
            // If it doesn't look like base64, treat it as a filename
            story.userDataId.avatar = `${BASE_URL}/uploads/avatars/${story.userDataId.avatar}`;
          }
        }
      }
      if (story.imageUrl && !story.imageUrl.startsWith('http') && !story.imageUrl.startsWith('data:') && story.imageUrl.includes('.')) {
        story.imageUrl = `${BASE_URL}/uploads/${story.imageUrl}`;
      }
    });

    const endTime = Date.now();
    console.log(`✅ Stories fetched successfully in ${endTime - startTime}ms`, {
      count: stories.length,
      total: totalStories,
      page: page,
      userId: userId
    });

    res.status(200).json({
      status: 'success',
      data: stories.map(story => ({
        _id: story._id,
        userDataId: story.userDataId,
        imageUrl: story.imageUrl,
        content: story.content,
        mediaType: story.mediaType,
        views: story.views,
        created_at: story.created_at,
        expires_at: story.expires_at,
        userData: story.userDataId
      })),
      pagination: {
        page: page,
        limit: limit,
        total: totalStories,
        pages: Math.ceil(totalStories / limit)
      }
    });

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ Stories fetch failed after ${endTime - startTime}ms:`, error);

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching stories'
    });
  }
};

const getUserStories = async (req, res) => {
  const startTime = Date.now();
  const { userId } = req.params;

  try {
    // Find user data by userId
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const stories = await Story.find({
      userDataId: userData._id,
      expires_at: { $gt: new Date() }
    })
    .populate('userDataId', 'name avatar')
    .sort({ created_at: -1 });

    // Construct full URLs for avatars and images
    stories.forEach(story => {
      if (story.userDataId && story.userDataId.avatar && !story.userDataId.avatar.startsWith('http') && !story.userDataId.avatar.startsWith('data:')) {
        if (story.userDataId.avatar.includes('.')) {
          // Check if it's an avatar (stored in uploads/avatars) or other media (in uploads)
          if (story.userDataId.avatar.startsWith('avatar_')) {
            story.userDataId.avatar = `${BASE_URL}/uploads/avatars/${story.userDataId.avatar}`;
          } else {
            story.userDataId.avatar = `${BASE_URL}/uploads/${story.userDataId.avatar}`;
          }
        } else {
          // Only create base64 data URL if the string looks like valid base64
          // Base64 strings should only contain A-Z, a-z, 0-9, +, /, and = for padding
          const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
          if (base64Pattern.test(story.userDataId.avatar) && story.userDataId.avatar.length > 100) {
            story.userDataId.avatar = `data:image/jpeg;base64,${story.userDataId.avatar}`;
          } else {
            // If it doesn't look like base64, treat it as a filename
            story.userDataId.avatar = `${BASE_URL}/uploads/avatars/${story.userDataId.avatar}`;
          }
        }
      }
      if (story.imageUrl && !story.imageUrl.startsWith('http') && !story.imageUrl.startsWith('data:') && story.imageUrl.includes('.')) {
        story.imageUrl = `${BASE_URL}/uploads/${story.imageUrl}`;
      }
    });

    const endTime = Date.now();
    console.log(`✅ User stories fetched successfully in ${endTime - startTime}ms`, {
      userId: userId,
      count: stories.length
    });

    res.status(200).json({
      status: 'success',
      data: stories.map(story => ({
        _id: story._id,
        userDataId: story.userDataId,
        imageUrl: story.imageUrl,
        content: story.content,
        mediaType: story.mediaType,
        views: story.views,
        created_at: story.created_at,
        expires_at: story.expires_at,
        userData: story.userDataId
      }))
    });

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ User stories fetch failed after ${endTime - startTime}ms:`, error);

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching user stories'
    });
  }
};

const getUserStoryCount = async (req, res) => {
  const startTime = Date.now();
  const { userId } = req.params;

  try {
    // Find user data by userId
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Count active stories (not expired)
    const storyCount = await Story.countDocuments({
      userDataId: userData._id,
      expires_at: { $gt: new Date() }
    });

    const endTime = Date.now();
    console.log(`✅ User story count fetched successfully in ${endTime - startTime}ms`, {
      userId: userId,
      count: storyCount
    });

    res.status(200).json({
      status: 'success',
      data: {
        count: storyCount
      }
    });

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ User story count fetch failed after ${endTime - startTime}ms:`, error);

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching user story count'
    });
  }
};

const deleteStory = async (req, res) => {
  const startTime = Date.now();
  const { storyId } = req.params;
  const userId = req.user.userId;

  try {
    console.log(`🗑️ Story deletion attempt started for user: ${userId}, story: ${storyId}`);

    // Find the story and verify ownership
    const story = await Story.findById(storyId);
    if (!story) {
      console.error('Story deletion failed: Story not found', { storyId, userId });
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }

    // Verify the user owns this story
    const userData = await UserData.findOne({ userId: userId });
    if (!userData || story.userDataId.toString() !== userData._id.toString()) {
      console.error('Story deletion failed: Unauthorized', { storyId, userId, storyUserDataId: story.userDataId });
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own stories'
      });
    }

    // Delete the story
    await Story.findByIdAndDelete(storyId);

    // Delete associated media file from storage
    if (story.imageUrl) {
      try {
        const filePath = path.join('uploads', story.imageUrl);
        await fs.unlink(filePath);
        console.log(`🗑️ Associated media file deleted: ${filePath}`);
      } catch (fileError) {
        console.warn(`⚠️ Failed to delete associated media file: ${story.imageUrl}`, fileError.message);
        // Don't fail the request if file deletion fails
      }
    }

    const endTime = Date.now();
    console.log(`✅ Story deleted successfully in ${endTime - startTime}ms`, {
      storyId: storyId,
      userId: userId
    });

    res.status(200).json({
      status: 'success',
      message: 'Story deleted successfully'
    });

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ Story deletion failed after ${endTime - startTime}ms:`, error);

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while deleting story'
    });
  }
};

const trackView = async (req, res) => {
  const { storyId } = req.params;
  const userId = req.user.userId;

  try {
    console.log(`👁️ Story view tracked for user: ${userId}, story: ${storyId}`);

    // Increment view count
    const updatedStory = await Story.findByIdAndUpdate(
      storyId,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!updatedStory) {
      console.error('Story view tracking failed: Story not found', { storyId });
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }

    console.log(`✅ Story view count updated: ${updatedStory.views}`);

    res.status(200).json({
      status: 'success',
      message: 'View tracked successfully',
      data: {
        views: updatedStory.views
      }
    });

  } catch (error) {
    console.error(`❌ Story view tracking failed:`, error);

    res.status(500).json({
      status: 'error',
      message: 'Internal server error while tracking view'
    });
  }
};

const addReaction = async (req, res) => {
  const { storyId } = req.params;
  const { reactionType } = req.body;
  const userId = req.user.userId;

  try {
    console.log(`😊 Adding reaction ${reactionType} to story: ${storyId} by user: ${userId}`);

    // Verify story exists
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }

    // Get user data
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if reaction already exists
    const existingReaction = await StoryReaction.findOne({
      storyId: storyId,
      userDataId: userData._id
    });

    if (existingReaction) {
      // Update existing reaction
      existingReaction.reactionType = reactionType;
      await existingReaction.save();
    } else {
      // Create new reaction
      const newReaction = new StoryReaction({
        storyId: storyId,
        userDataId: userData._id,
        reactionType: reactionType
      });
      await newReaction.save();
    }

    // Get reaction counts
    const reactionCounts = await StoryReaction.aggregate([
      { $match: { storyId: new mongoose.Types.ObjectId(storyId) } },
      { $group: { _id: '$reactionType', count: { $sum: 1 } } }
    ]);

    console.log(`✅ Reaction added successfully`);

    res.status(200).json({
      status: 'success',
      message: 'Reaction added successfully',
      data: {
        reactionCounts: reactionCounts.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error(`❌ Add reaction failed:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while adding reaction'
    });
  }
};

const addReply = async (req, res) => {
  const { storyId } = req.params;
  const { content } = req.body;
  const userId = req.user.userId;

  try {
    console.log(`💬 Adding reply to story: ${storyId} by user: ${userId}`);

    // Verify story exists
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }

    // Get user data
    const userData = await UserData.findOne({ userId: userId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Validate content
    if (!content || content.trim().length === 0 || content.length > 200) {
      return res.status(400).json({
        status: 'error',
        message: 'Reply content must be between 1 and 200 characters'
      });
    }

    // Create new reply
    const newReply = new StoryReply({
      storyId: storyId,
      userDataId: userData._id,
      content: content.trim()
    });

    const savedReply = await newReply.save();
    await savedReply.populate('userDataId', 'name avatar');

    // Fix avatar URL if needed
    if (savedReply.userDataId && savedReply.userDataId.avatar && !savedReply.userDataId.avatar.startsWith('http') && !savedReply.userDataId.avatar.startsWith('data:')) {
      if (savedReply.userDataId.avatar.includes('.')) {
        // Check if it's an avatar (stored in uploads/avatars) or other media (in uploads)
        if (savedReply.userDataId.avatar.startsWith('avatar_')) {
          savedReply.userDataId.avatar = `${BASE_URL}/uploads/avatars/${savedReply.userDataId.avatar}`;
        } else {
          savedReply.userDataId.avatar = `${BASE_URL}/uploads/${savedReply.userDataId.avatar}`;
        }
      } else {
        // Only create base64 data URL if the string looks like valid base64
        const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        if (base64Pattern.test(savedReply.userDataId.avatar) && savedReply.userDataId.avatar.length > 100) {
          savedReply.userDataId.avatar = `data:image/jpeg;base64,${savedReply.userDataId.avatar}`;
        } else {
          // If it doesn't look like base64, treat it as a filename
          savedReply.userDataId.avatar = `${BASE_URL}/uploads/avatars/${savedReply.userDataId.avatar}`;
        }
      }
    }

    console.log(`✅ Reply added successfully`);

    res.status(201).json({
      status: 'success',
      message: 'Reply added successfully',
      data: {
        _id: savedReply._id,
        storyId: savedReply.storyId,
        content: savedReply.content,
        created_at: savedReply.created_at,
        userData: savedReply.userDataId
      }
    });

  } catch (error) {
    console.error(`❌ Add reply failed:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while adding reply'
    });
  }
};

const getReactions = async (req, res) => {
  const { storyId } = req.params;

  try {
    const reactionCounts = await StoryReaction.aggregate([
      { $match: { storyId: new mongoose.Types.ObjectId(storyId) } },
      { $group: { _id: '$reactionType', count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        reactionCounts: reactionCounts.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error(`❌ Get reactions failed:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while getting reactions'
    });
  }
};

const getReplies = async (req, res) => {
  const { storyId } = req.params;

  try {
    const replies = await StoryReply.find({ storyId: storyId })
      .populate('userDataId', 'name avatar')
      .sort({ created_at: -1 })
      .limit(50); // Limit to 50 most recent replies

    // Fix avatar URLs for all replies
    replies.forEach(reply => {
      if (reply.userDataId && reply.userDataId.avatar && !reply.userDataId.avatar.startsWith('http') && !reply.userDataId.avatar.startsWith('data:')) {
        if (reply.userDataId.avatar.includes('.')) {
          // Check if it's an avatar (stored in uploads/avatars) or other media (in uploads)
          if (reply.userDataId.avatar.startsWith('avatar_')) {
            reply.userDataId.avatar = `${BASE_URL}/uploads/avatars/${reply.userDataId.avatar}`;
          } else {
            reply.userDataId.avatar = `${BASE_URL}/uploads/${reply.userDataId.avatar}`;
          }
        } else {
          // Only create base64 data URL if the string looks like valid base64
          const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
          if (base64Pattern.test(reply.userDataId.avatar) && reply.userDataId.avatar.length > 100) {
            reply.userDataId.avatar = `data:image/jpeg;base64,${reply.userDataId.avatar}`;
          } else {
            // If it doesn't look like base64, treat it as a filename
            reply.userDataId.avatar = `${BASE_URL}/uploads/avatars/${reply.userDataId.avatar}`;
          }
        }
      }
    });

    res.status(200).json({
      status: 'success',
      data: replies.map(reply => ({
        _id: reply._id,
        storyId: reply.storyId,
        content: reply.content,
        created_at: reply.created_at,
        userData: reply.userDataId
      }))
    });

  } catch (error) {
    console.error(`❌ Get replies failed:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while getting replies'
    });
  }
};

// ✅ Share post to story
const sharePostToStory = async (req, res) => {
  const startTime = Date.now();
  console.log(`📖 Post share to story attempt started for user: ${req.user?.userId || 'unknown'}`);

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

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    console.log(`Post media - image: "${post.image}", video: "${post.video}"`);

    // Check if post has media
    if (!post.image && !post.video) {
      console.log('Post has no media, returning error');
      return res.status(400).json({
        status: 'error',
        message: 'Post must have an image or video to share to story'
      });
    }

    // Determine media URL and type
    const mediaUrl = post.image || post.video;
    const mediaType = post.image ? 'image' : 'video';

    // Create story with post content
    const story = new Story({
      userDataId: userId,
      content: content || `Shared a post: ${post.content}`,
      imageUrl: mediaUrl,
      mediaType: mediaType,
      privacy: 'public', // Default to public for shared stories
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    await story.save();

    console.log(`✅ Post shared to story successfully in ${Date.now() - startTime}ms`);
    res.status(201).json({
      status: 'success',
      message: 'Post shared to story successfully',
      story: story
    });

  } catch (error) {
    console.error('❌ Error sharing post to story:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createStory,
  getStories,
  getUserStories,
  getUserStoryCount,
  deleteStory,
  trackView,
  addReaction,
  addReply,
  getReactions,
  getReplies,
  sharePostToStory
};
