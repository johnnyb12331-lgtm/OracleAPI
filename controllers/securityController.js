const User = require('../models/User');
const UserData = require('../models/UserData');

// Get security settings
exports.getSecuritySettings = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware

    // Get user data including privacy settings
    const userData = await UserData.findOne({ userId });

    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User data not found'
      });
    }

    // Return security and privacy settings
    const securitySettings = {
      privacySettings: userData.privacySettings || {
        profileVisible: true,
        showLocation: true,
        showInterests: true,
        showSocialLinks: true,
        showBirthday: true
      },
      notificationSettings: userData.notificationSettings || {
        pushNotificationsEnabled: true,
        likesEnabled: true,
        commentsEnabled: true,
        followsEnabled: true,
        mentionsEnabled: true,
        messagesEnabled: true,
        groupActivitiesEnabled: true
      },
      blockedUsersCount: userData.blockedUsers ? userData.blockedUsers.length : 0
    };

    res.status(200).json({
      status: 'success',
      data: securitySettings
    });

  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch security settings',
      error: error.message
    });
  }
};

// Update security settings
exports.updateSecuritySettings = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    const { privacySettings, notificationSettings } = req.body;

    // Build update object
    const updateData = {};
    
    if (privacySettings) {
      updateData.privacySettings = privacySettings;
    }
    
    if (notificationSettings) {
      updateData.notificationSettings = notificationSettings;
    }

    // Update user data
    const updatedUserData = await UserData.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUserData) {
      return res.status(404).json({
        status: 'error',
        message: 'User data not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Security settings updated successfully',
      data: {
        privacySettings: updatedUserData.privacySettings,
        notificationSettings: updatedUserData.notificationSettings
      }
    });

  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update security settings',
      error: error.message
    });
  }
};

// Get login history (placeholder - would need to implement login tracking)
exports.getLoginHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // TODO: Implement actual login history tracking
    // For now, return empty array
    res.status(200).json({
      status: 'success',
      data: {
        loginHistory: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Error fetching login history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch login history',
      error: error.message
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 8 characters long'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if user has a password (social auth users might not)
    if (!user.password) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot change password for social login accounts'
      });
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to change password',
      error: error.message
    });
  }
};
