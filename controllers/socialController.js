const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');
const User = require('../models/User');
const UserData = require('../models/UserData');
const Follower = require('../models/Follower');
const { createNotification } = require('./notificationController');
const authguard = require('../guard/authguard');
const mongoose = require('mongoose');

// All allowed Client IDs (Web - Android - iOS)
const GOOGLE_CLIENT_IDS = [
  '812858670577-lep8tplutu8ed7jnh3t6pn46cquo77j0.apps.googleusercontent.com',
  '812858670577-872vh21h23ac6smmjemgqjtrln6j2ag1.apps.googleusercontent.com',
  'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
];

const client = new OAuth2Client();

const googleLogin = async (req, res) => {
  const { accessToken, idToken } = req.body;

  if (!accessToken && !idToken)
    return res.status(400).json({ status: 'error', message: 'accessToken or idToken required' });

  try {
    let payload;

    if (idToken) {
      // ✅ Verify id_token (for Android/iOS)
      const ticket = await client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_IDS,
      });
      payload = ticket.getPayload();
    } else {
      // ✅ Use access_token (for Web)
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`);
      payload = await response.json();

      if (payload.error) {
        return res.status(401).json({ status: 'error', message: 'Invalid Google Token' });
      }
    }

    const userid = payload.sub || payload.id;
    const email = payload.email;
    const name = payload.name;
    const avatar = payload.picture || null;

    // 🔁 Verify or create the user
    const existingUser = await User.findOne({ social_id: userid, provider: 'google' });

    if (!existingUser) {
      // Create new user
      const newUser = new User({
        social_id: userid,
        provider: 'google',
        email: email
      });
      const savedUser = await newUser.save();
      sendTokens(savedUser._id, res, false, { name, email, avatar });
    } else {
      // Existing user - get profile data
      const internalUserId = existingUser._id;
      const userProfile = await UserData.findOne({ userId: internalUserId })
        .select('isProfileComplete name dateOfBirth gender avatar');

      const user = await User.findById(internalUserId).select('email');

      if (!userProfile) {
        // No profile data, send Google data directly
        sendTokens(internalUserId, res, false, { name, email, avatar });
      } else {
        const profile = {
          name: userProfile.name,
          email: user.email || email, // Use Google email as fallback
          dateOfBirth: userProfile.dateOfBirth,
          gender: userProfile.gender,
          avatar: userProfile.avatar,
          isProfileComplete: userProfile.isProfileComplete
        };

        sendTokens(internalUserId, res, !!profile.isProfileComplete, profile);
      }
    }
  } catch (error) {
    console.error('Google login error: - socialController.js:90', error);
    return res.status(401).json({ status: 'error', message: 'Google token verification failed' });
  }
};

function sendTokens(userId, res, isProfileComplete, profileData) {
  const accessToken = authguard.generateAccessToken(userId);
  const refreshToken = authguard.generateRefreshToken(userId);

  return res.json({
    status: 'success',
    message: 'logged in successfully.',
    accessToken,
    refreshToken,
    expiryDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    isProfileComplete,
    userId,  // <-- Add this line to send userId
    userProfile: {
      name: profileData.name || '',
      email: profileData.email || '',
      dateOfBirth: profileData.dateOfBirth || null,
      gender: profileData.gender || '',
      avatar: profileData.avatar || null,
    },
  });
}

const followUser = async (req, res) => {
  try {
    const { userIdToFollow } = req.body;
    const followerUserId = req.user.userId;

    if (!userIdToFollow) {
      return res.status(400).json({ status: 'error', message: 'userIdToFollow is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userIdToFollow)) {
      return res.status(400).json({ status: 'error', message: 'Invalid userIdToFollow' });
    }

    if (!mongoose.Types.ObjectId.isValid(followerUserId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid follower user ID' });
    }

    // Check if the user to follow exists
    const userToFollow = await User.findById(userIdToFollow);
    if (!userToFollow) {
      return res.status(404).json({ status: 'error', message: 'User to follow not found' });
    }

    // Check if the follower exists
    const follower = await User.findById(followerUserId);
    if (!follower) {
      return res.status(404).json({ status: 'error', message: 'Follower user not found' });
    }

    if (followerUserId === userIdToFollow) {
      return res.status(400).json({ status: 'error', message: 'Cannot follow yourself' });
    }

    const existingFollow = await Follower.findOne({
      follower_user_id: followerUserId,
      following_user_id: userIdToFollow
    });

    if (existingFollow) {
      return res.status(400).json({ status: 'error', message: 'Already following this user' });
    }

    const newFollow = new Follower({
      follower_user_id: followerUserId,
      following_user_id: userIdToFollow
    });

    await newFollow.save();

    // Create notification for the user being followed
    const followerData = await UserData.findOne({ userId: followerUserId });
    const followerName = followerData?.name || 'Someone';
    await createNotification(
      userIdToFollow,
      followerUserId,
      'follow',
      `${followerName} started following you`
    );

    res.json({ status: 'success', message: 'User followed successfully' });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ status: 'error', message: 'Failed to follow user' });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { userIdToUnfollow } = req.body;
    const followerUserId = req.user.userId;

    const follow = await Follower.findOneAndDelete({
      follower_user_id: followerUserId,
      following_user_id: userIdToUnfollow
    });

    if (!follow) {
      return res.status(404).json({ status: 'error', message: 'Follow relationship not found' });
    }

    res.json({ status: 'success', message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ status: 'error', message: 'Failed to unfollow user' });
  }
};

const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;

    const followers = await Follower.find({ following_user_id: userId })
      .populate('follower_user_id', 'email social_id provider')
      .populate({
        path: 'follower_user_id',
        model: 'UserData',
        select: 'name avatar'
      });

    res.json({ status: 'success', data: followers });
  } catch (error) {
    console.error('Error getting followers:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get followers' });
  }
};

const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;

    const following = await Follower.find({ follower_user_id: userId })
      .populate('following_user_id', 'email social_id provider')
      .populate({
        path: 'following_user_id',
        model: 'UserData',
        select: 'name avatar'
      });

    res.json({ status: 'success', data: following });
  } catch (error) {
    console.error('Error getting following:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get following' });
  }
};

module.exports = {
  googleLogin,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing
};
