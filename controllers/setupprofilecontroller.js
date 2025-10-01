const UserData = require('../models/UserData');
const mongoose = require('mongoose');
const { handleDataUrlImage } = require('../utils/imageOptimizer');

const setupProfile = async (req, res) => {
  const userId = req.user.userId;
  const { name, dateOfBirth, gender, avatar } = req.body;

  if (!name || !dateOfBirth || !gender) {
    return res.status(400).json({ status: 'error', message: 'Name, dateOfBirth, and gender are required' });
  }

  try {
    // Process avatar if provided
    let processedAvatar = null;
    if (avatar) {
      if (avatar.startsWith('data:image/')) {
        // Handle data URL avatar
        try {
          processedAvatar = await handleDataUrlImage(avatar, 'avatar', 'uploads/avatars');
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
        processedAvatar = avatar;
      }
    }

    // Check if user profile exists
    const existingProfile = await UserData.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    if (existingProfile) {
      // Update existing profile
      existingProfile.name = name;
      existingProfile.dateOfBirth = dateOfBirth;
      existingProfile.gender = gender;
      existingProfile.avatar = processedAvatar;
      existingProfile.isProfileComplete = true;

      await existingProfile.save();

      res.status(200).json({ status: 'success', message: 'Profile updated successfully' });
    } else {
      // Create new profile
      const newProfile = new UserData({
        userId: new mongoose.Types.ObjectId(userId),
        name,
        dateOfBirth,
        gender,
        avatar: processedAvatar,
        isProfileComplete: true
      });

      await newProfile.save();

      res.status(200).json({ status: 'success', message: 'Profile Created successful' });
    }

  } catch (err) {
    console.error('[setupProfile] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};

module.exports = {
  setupProfile,
};
