const User = require('../models/User');
const UserData = require('../models/UserData');
const Follower = require('../models/Follower');
const Like = require('../models/Like');
const mongoose = require('mongoose');
const CommentCache = require('../utils/commentCache');
const { handleDataUrlImage } = require('../utils/imageOptimizer');
const { baseUrl } = require('../server');


const getProfile = async (req, res) => {
  const userId = req.params.userId; // ← Use userId from the link
  const viewerId = req.user?.userId; // Get the viewer ID from auth token

  try {
    // Try to get from cache first
    const cachedProfile = CommentCache.getUserProfile(userId);
    if (cachedProfile) {
      console.log(`👤 Serving profile from cache for user: ${userId}`);
      return res.json({
        status: 'success',
        ...cachedProfile,
        cached: true
      });
    }

    const user = await User.findById(userId).select('email');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    // Increment profile views if viewer is not the profile owner
    if (viewerId && viewerId !== userId) {
      await UserData.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId) },
        { $inc: { profileViews: 1 } }
      );
      // Check for view-based achievements
      await checkAndAwardAchievements(userId);
    }

    // Check privacy settings
    const isOwnProfile = viewerId === userId;
    const privacySettings = userData?.privacySettings || {};

    // Convert to plain object to avoid mongoose cloning issues
    const userDataPlain = userData ? userData.toObject() : {};

    const profileData = {
      email: user.email || '',
      name: userDataPlain?.name || '',
      dateOfBirth: (isOwnProfile || privacySettings.showBirthday !== false) ? userDataPlain?.dateOfBirth : null,
      gender: userDataPlain?.gender || '',
      avatar: userDataPlain?.avatar ? (userDataPlain.avatar.startsWith('http') || userDataPlain.avatar.startsWith('data:') ? userDataPlain.avatar : (userDataPlain.avatar.startsWith('avatar_') ? `${baseUrl}/uploads/avatars/${userDataPlain.avatar}` : `${baseUrl}/uploads/${userDataPlain.avatar}`)) : '',
      coverPhoto: userDataPlain?.coverPhoto ? (userDataPlain.coverPhoto.startsWith('http') || userDataPlain.coverPhoto.startsWith('data:') ? userDataPlain.coverPhoto : (userDataPlain.coverPhoto.startsWith('cover_') ? `${baseUrl}/uploads/covers/${userDataPlain.coverPhoto}` : `${baseUrl}/uploads/${userDataPlain.coverPhoto}`)) : '',
      bio: userDataPlain?.bio || '',
      location: (isOwnProfile || privacySettings.showLocation !== false) ? userDataPlain?.location : null,
      interests: (isOwnProfile || privacySettings.showInterests !== false) ? userDataPlain?.interests || [] : [],
      socialLinks: (isOwnProfile || privacySettings.showSocialLinks !== false) ? userDataPlain?.socialLinks || {} : {},
      profileViews: userDataPlain?.profileViews || 0,
      achievements: userDataPlain?.achievements || [],
      privacySettings: isOwnProfile ? privacySettings : undefined,
    };

    // Cache the profile data
    CommentCache.setUserProfile(userId, profileData);
    CommentCache.setAvatarUrl(userId, userDataPlain?.avatar);

    console.log(`👤 Profile cached for user: ${userId}`);

    res.json({
      status: 'success',
      ...profileData
    });

  } catch (err) {
    console.error('[getProfile] Database error: - userController.js:26', err);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};


const getUserMe = async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId).select('email');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) }).select('isProfileComplete name dateOfBirth gender avatar');

    res.status(200).json({
      status: 'success',
      userProfile: {
        email: user.email,
        name: userData?.name,
        dateOfBirth: userData?.dateOfBirth,
        gender: userData?.gender,
        avatar: userData?.avatar ? (userData.avatar.startsWith('http') || userData.avatar.startsWith('data:') ? userData.avatar : (userData.avatar.startsWith('avatar_') ? `${baseUrl}/uploads/avatars/${userData.avatar}` : `${baseUrl}/uploads/${userData.avatar}`)) : null,
        isProfileComplete: !!userData?.isProfileComplete,
      }
    });

  } catch (err) {
    console.error('[getUserMe] Database error: - userController.js:45', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getProfileStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .select('isProfileComplete name dateOfBirth gender avatar');
    
    const isComplete = !!userData?.isProfileComplete;
    
    console.log(`[getProfileStatus] User ${userId} profile complete: ${isComplete}`);
    
    res.status(200).json({
      status: 'success',
      isProfileComplete: isComplete,
      hasUserData: !!userData
    });
  } catch (err) {
    console.error('[getProfileStatus] Error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getFollowerCount = async (req, res) => {
  const userId = req.params.userId;

  try {
    const followerCount = await Follower.countDocuments({ following_user_id: userId });

    res.status(200).json({
      status: 'success',
      followerCount
    });

  } catch (err) {
    console.error('[getFollowerCount] Database error: - userController.js:74', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getFollowingCount = async (req, res) => {
  const userId = req.params.userId;

  try {
    const followingCount = await Follower.countDocuments({ follower_user_id: userId });

    res.status(200).json({
      status: 'success',
      followingCount
    });

  } catch (err) {
    console.error('[getFollowingCount] Database error: - userController.js:95', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getLikesCount = async (req, res) => {
  const userId = req.params.userId;

  try {
    const likesCount = await Like.countDocuments({ userId });

    res.status(200).json({
      status: 'success',
      likesCount
    });

  } catch (err) {
    console.error('[getLikesCount] Database error: - userController.js:116', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getCommentsCount = async (req, res) => {
  const userId = req.params.userId;

  try {
    // First get the UserData document for this user
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    
    if (!userData) {
      return res.status(200).json({
        status: 'success',
        commentsCount: 0
      });
    }

    // Count comments by this user's UserData ID
    const commentsCount = await Comment.countDocuments({ userDataId: userData._id });

    res.status(200).json({
      status: 'success',
      commentsCount
    });

  } catch (err) {
    console.error('[getCommentsCount] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const getLikedPosts = async (req, res) => {
  const userId = req.params.userId;

  try {
    const likedPosts = await Like.find({ userId, targetType: 'post' })
      .populate({
        path: 'postId',
        model: 'Post',
        populate: {
          path: 'userId',
          model: 'UserData',
          select: 'name avatar'
        }
      })
      .sort({ created_at: -1 });

    // Filter out null postId (in case posts were deleted)
    const validLikedPosts = likedPosts.filter(like => like.postId != null);

    res.status(200).json({
      status: 'success',
      data: validLikedPosts
    });

  } catch (err) {
    console.error('[getLikedPosts] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const updateProfile = async (req, res) => {
  const userId = req.params.userId;
  const { name, dateOfBirth, gender, avatar, coverPhoto, bio, location, interests, socialLinks, privacySettings } = req.body;

  try {
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    // Process avatar if provided
    if (avatar !== undefined) {
      if (avatar.startsWith('data:image/')) {
        // Handle data URL avatar
        try {
          const processedAvatar = await handleDataUrlImage(avatar, 'avatar', 'uploads/avatars');
          userData.avatar = processedAvatar;
          console.log(`✅ Avatar processed: ${processedAvatar}`);
        } catch (avatarError) {
          console.error('❌ Avatar processing failed:', avatarError);
          return res.status(400).json({ status: 'error', message: 'Invalid avatar image' });
        }
      } else if (avatar.startsWith('data:') || avatar.includes('base64')) {
        // Handle other data URLs or base64
        return res.status(400).json({ status: 'error', message: 'Avatar must be a valid image data URL' });
      } else {
        // Assume it's a filename or URL
        userData.avatar = avatar;
      }
    }

    // Process cover photo if provided
    if (coverPhoto !== undefined) {
      if (coverPhoto.startsWith('data:image/')) {
        // Handle data URL cover photo
        try {
          const processedCoverPhoto = await handleDataUrlImage(coverPhoto, 'cover', 'uploads/covers');
          userData.coverPhoto = processedCoverPhoto;
          console.log(`✅ Cover photo processed: ${processedCoverPhoto}`);
        } catch (coverError) {
          console.error('❌ Cover photo processing failed:', coverError);
          return res.status(400).json({ status: 'error', message: 'Invalid cover photo image' });
        }
      } else if (coverPhoto.startsWith('data:') || coverPhoto.includes('base64')) {
        // Handle other data URLs or base64
        return res.status(400).json({ status: 'error', message: 'Cover photo must be a valid image data URL' });
      } else {
        // Assume it's a filename or URL
        userData.coverPhoto = coverPhoto;
      }
    }

    if (name !== undefined) userData.name = name;
    if (dateOfBirth !== undefined) userData.dateOfBirth = dateOfBirth;
    if (gender !== undefined) userData.gender = gender;
    if (bio !== undefined) userData.bio = bio;
    if (location !== undefined) userData.location = location;
    if (interests !== undefined) userData.interests = interests;
    if (socialLinks !== undefined) userData.socialLinks = { ...userData.socialLinks, ...socialLinks };
    if (privacySettings !== undefined) userData.privacySettings = { ...userData.privacySettings, ...privacySettings };

    await userData.save();

    // Check for achievements after profile update
    await checkAndAwardAchievements(userId);

    // Invalidate cached profile and avatar data
    CommentCache.invalidateUserAllData(userId);
    console.log(`🗑️ Cache invalidated for updated user: ${userId}`);

    res.status(200).json({ status: 'success', message: 'Profile updated successfully' });

  } catch (err) {
    console.error('[updateProfile] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

const checkAndAwardAchievements = async (userId) => {
  try {
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) return;

    const existingAchievements = userData.achievements || [];
    const existingTypes = existingAchievements.map(a => a.type);
    const newAchievements = [];

    // Check profile completion
    const profileComplete = userData.name && userData.bio && userData.avatar;
    if (profileComplete && !existingTypes.includes('profile_complete')) {
      newAchievements.push({
        type: 'profile_complete',
        earnedAt: new Date(),
        description: 'Completed your profile'
      });
    }

    // Check social links
    const hasSocialLinks = userData.socialLinks && Object.keys(userData.socialLinks).length > 0;
    if (hasSocialLinks && !existingTypes.includes('social_butterfly')) {
      newAchievements.push({
        type: 'social_butterfly',
        earnedAt: new Date(),
        description: 'Added social media links'
      });
    }

    // Check interests
    const hasInterests = userData.interests && userData.interests.length > 0;
    if (hasInterests && !existingTypes.includes('interesting_person')) {
      newAchievements.push({
        type: 'interesting_person',
        earnedAt: new Date(),
        description: 'Added your interests'
      });
    }

    // Check profile views milestones
    const views = userData.profileViews || 0;
    if (views >= 10 && !existingTypes.includes('getting_noticed')) {
      newAchievements.push({
        type: 'getting_noticed',
        earnedAt: new Date(),
        description: 'Profile viewed 10 times'
      });
    }
    if (views >= 50 && !existingTypes.includes('popular')) {
      newAchievements.push({
        type: 'popular',
        earnedAt: new Date(),
        description: 'Profile viewed 50 times'
      });
    }

    if (newAchievements.length > 0) {
      await UserData.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId) },
        { $push: { achievements: { $each: newAchievements } } }
      );
    }
  } catch (error) {
    console.error('Error checking achievements:', error);
  }
};

const searchUsers = async (req, res) => {
  const { query, interests, location, limit = 20 } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ status: 'error', message: 'Query must be at least 2 characters' });
  }

  try {
    // Build search query
    let searchQuery = { $text: { $search: query.trim() } };

    // Add filters
    if (interests) {
      const interestsArray = interests.split(',').map(i => i.trim());
      searchQuery.interests = { $in: interestsArray };
    }

    if (location) {
      searchQuery.location = { $regex: location.trim(), $options: 'i' };
    }

    const users = await UserData.find(searchQuery)
      .select('userId name avatar bio location interests')
      .limit(parseInt(limit))
      .sort({ score: { $meta: 'textScore' } }); // Sort by relevance

    const userIds = users.map(u => u.userId);
    const userEmails = await User.find({ _id: { $in: userIds } }).select('_id email');

    const emailMap = {};
    userEmails.forEach(u => emailMap[u._id.toString()] = u.email);

    const results = users.map(u => ({
      userId: u.userId,
      name: u.name,
      email: emailMap[u.userId] || '',
      avatar: u.avatar ? (u.avatar.startsWith('http') || u.avatar.startsWith('data:') ? u.avatar : (u.avatar.startsWith('avatar_') ? `${baseUrl}/uploads/avatars/${u.avatar}` : `${baseUrl}/uploads/${u.avatar}`)) : '',
      bio: u.bio,
      location: u.location,
      interests: u.interests
    }));

    res.status(200).json({ status: 'success', users: results });

  } catch (err) {
    console.error('[searchUsers] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Block a user
const blockUser = async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    const { blockedUserId } = req.body;

    if (!currentUserId) {
      return res.status(400).json({ status: 'error', message: 'User not authenticated' });
    }

    if (!blockedUserId) {
      return res.status(400).json({ status: 'error', message: 'Blocked user ID is required' });
    }

    if (currentUserId === blockedUserId) {
      return res.status(400).json({ status: 'error', message: 'Cannot block yourself' });
    }

    // Check if user exists
    const blockedUser = await User.findById(blockedUserId);
    if (!blockedUser) {
      return res.status(404).json({ status: 'error', message: 'User to block not found' });
    }

    // Add to blocked users list
    await UserData.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(currentUserId) },
      { $addToSet: { blockedUsers: new mongoose.Types.ObjectId(blockedUserId) } },
      { upsert: true }
    );

    console.log(`User ${currentUserId} blocked user ${blockedUserId}`);
    res.json({ status: 'success', message: 'User blocked successfully' });
  } catch (err) {
    console.error('[blockUser] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Unblock a user
const unblockUser = async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    const { blockedUserId } = req.body;

    if (!currentUserId) {
      return res.status(400).json({ status: 'error', message: 'User not authenticated' });
    }

    if (!blockedUserId) {
      return res.status(400).json({ status: 'error', message: 'Blocked user ID is required' });
    }

    // Remove from blocked users list
    await UserData.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(currentUserId) },
      { $pull: { blockedUsers: new mongoose.Types.ObjectId(blockedUserId) } }
    );

    console.log(`User ${currentUserId} unblocked user ${blockedUserId}`);
    res.json({ status: 'success', message: 'User unblocked successfully' });
  } catch (err) {
    console.error('[unblockUser] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Get blocked users list
const getBlockedUsers = async (req, res) => {
  try {
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(400).json({ status: 'error', message: 'User not authenticated' });
    }

    // Get user's blocked users
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(currentUserId) })
      .select('blockedUsers')
      .populate('blockedUsers', 'name avatar');

    if (!userData) {
      return res.json([]);
    }

    // Get user details for blocked users
    const blockedUsers = userData.blockedUsers.map(user => ({
      id: user._id,
      name: user.name || 'Unknown User',
      avatar: user.avatar ? (user.avatar.startsWith('http') || user.avatar.startsWith('data:') ? user.avatar : (user.avatar.startsWith('avatar_') ? `${baseUrl}/uploads/avatars/${user.avatar}` : `${baseUrl}/uploads/${user.avatar}`)) : '',
      lastSeen: new Date() // You might want to add lastSeen to User model
    }));

    res.json(blockedUsers);
  } catch (err) {
    console.error('[getBlockedUsers] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Upload profile media (photo/video)
const uploadProfileMedia = async (req, res) => {
  const userId = req.params.userId;
  const { mediaUrl, mediaType, caption } = req.body;

  try {
    // Check if user exists
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Validate media type
    if (!['image', 'video'].includes(mediaType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid media type' });
    }

    // Add new media to profileMedia array
    const newMedia = {
      url: mediaUrl,
      type: mediaType,
      caption: caption || '',
      uploadedAt: new Date()
    };

    userData.profileMedia.push(newMedia);
    await userData.save();

    res.status(200).json({
      status: 'success',
      message: 'Media uploaded successfully',
      mediaId: userData.profileMedia[userData.profileMedia.length - 1]._id
    });

  } catch (err) {
    console.error('[uploadProfileMedia] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Get user's profile media
const getProfileMedia = async (req, res) => {
  const userId = req.params.userId;
  const { page = 1, limit = 20 } = req.query;

  try {
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Sort by uploadedAt descending and paginate
    const profileMedia = userData.profileMedia
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice((page - 1) * limit, page * limit);

    res.status(200).json({
      status: 'success',
      data: profileMedia,
      totalCount: userData.profileMedia.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (err) {
    console.error('[getProfileMedia] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

// Delete profile media
const deleteProfileMedia = async (req, res) => {
  const userId = req.params.userId;
  const mediaId = req.params.mediaId;

  try {
    const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Find and remove media
    const mediaIndex = userData.profileMedia.findIndex(media => media._id.toString() === mediaId);
    if (mediaIndex === -1) {
      return res.status(404).json({ status: 'error', message: 'Media not found' });
    }

    userData.profileMedia.splice(mediaIndex, 1);
    await userData.save();

    res.status(200).json({
      status: 'success',
      message: 'Media deleted successfully'
    });

  } catch (err) {
    console.error('[deleteProfileMedia] Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

module.exports = { 
  getUserMe,
  getProfileStatus,
  getFollowerCount,
  getFollowingCount,
  getLikesCount,
  getCommentsCount,
  getLikedPosts,
  getProfile,
  updateProfile,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  uploadProfileMedia,
  getProfileMedia,
  deleteProfileMedia
 };