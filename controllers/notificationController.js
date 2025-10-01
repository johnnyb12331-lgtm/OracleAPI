const Notification = require('../models/Notification');
const User = require('../models/User');
const UserData = require('../models/UserData');
const PushNotificationService = require('../services/pushNotificationService');

const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: userId })
      .populate('sender', 'email social_id provider')
      .populate({
        path: 'sender',
        model: 'UserData',
        select: 'name avatar'
      })
      .populate('relatedPost', 'content')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ recipient: userId });
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });

    res.json({
      status: 'success',
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get notifications' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationIds } = req.body;

    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      await Notification.updateMany(
        { _id: { $in: notificationIds }, recipient: userId },
        { isRead: true }
      );
    } else {
      // Mark all notifications as read
      await Notification.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true }
      );
    }

    res.json({ status: 'success', message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications as read' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ status: 'error', message: 'Notification not found' });
    }

    res.json({ status: 'success', message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete notification' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });

    res.json({ status: 'success', unreadCount });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get unread count' });
  }
};

// Helper function to create notifications
const createNotification = async (recipientId, senderId, type, message, relatedPost = null, relatedComment = null) => {
  try {
    // Don't create notification if user is notifying themselves
    if (recipientId.toString() === senderId.toString()) {
      return null;
    }

    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      type,
      message,
      relatedPost,
      relatedComment
    });

    await notification.save();

    // Send push notification
    try {
      let title = 'New Notification';
      let body = message;

      // Customize title and body based on notification type
      switch (type) {
        case 'like':
          title = 'Someone liked your post';
          break;
        case 'comment':
          title = 'New comment';
          break;
        case 'follow':
          title = 'New follower';
          break;
        case 'mention':
          title = 'You were mentioned';
          break;
        default:
          title = 'New Notification';
      }

      await PushNotificationService.sendNotificationToUser(recipientId, {
        title,
        body,
        data: {
          type,
          senderId: senderId.toString(),
          relatedPost: relatedPost ? relatedPost.toString() : '',
          relatedComment: relatedComment ? relatedComment.toString() : '',
          notificationId: notification._id.toString()
        }
      });
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
      // Don't fail the notification creation if push fails
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

const registerDevice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceToken, platform } = req.body;

    if (!deviceToken) {
      return res.status(400).json({ status: 'error', message: 'Device token is required' });
    }

    // Add device token to user's deviceTokens array if not already present
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { deviceTokens: deviceToken } },
      { new: true }
    );

    res.json({ status: 'success', message: 'Device registered successfully' });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({ status: 'error', message: 'Failed to register device' });
  }
};

const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userData = await UserData.findOne({ userId });

    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User data not found' });
    }

    res.json({
      status: 'success',
      data: userData.notificationSettings || {
        pushNotificationsEnabled: true,
        likesEnabled: true,
        commentsEnabled: true,
        followsEnabled: true,
        mentionsEnabled: true,
        messagesEnabled: true,
        groupActivitiesEnabled: true
      }
    });
  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get notification settings' });
  }
};

const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;

    // Validate settings object
    const validSettings = [
      'pushNotificationsEnabled',
      'likesEnabled',
      'commentsEnabled',
      'followsEnabled',
      'mentionsEnabled',
      'messagesEnabled',
      'groupActivitiesEnabled'
    ];

    const updateData = {};
    for (const key of validSettings) {
      if (settings[key] !== undefined) {
        updateData[`notificationSettings.${key}`] = settings[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid settings provided' });
    }

    const userData = await UserData.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json({
      status: 'success',
      message: 'Notification settings updated successfully',
      data: userData.notificationSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update notification settings' });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  deleteNotification,
  getUnreadCount,
  createNotification,
  registerDevice,
  getNotificationSettings,
  updateNotificationSettings
};