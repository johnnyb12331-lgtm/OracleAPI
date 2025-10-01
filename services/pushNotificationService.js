const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// You'll need to add your service account key
let firebaseInitialized = false;

try {
  // For production, use service account key from environment
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY !== '<your-firebase-service-account-json-as-string>') {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || 'your-project-id'
    });
  } else {
    // For development, you can use default credentials or skip initialization
    console.log('Firebase service account key not provided, push notifications disabled');
  }
  firebaseInitialized = true;
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

class PushNotificationService {
  static async sendNotificationToUser(userId, notification) {
    if (!firebaseInitialized) {
      console.log('Firebase not initialized, skipping push notification');
      return;
    }

    try {
      // Get user's device tokens from database
      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
        console.log(`No device tokens found for user ${userId}`);
        return;
      }

      const { title, body, data } = notification;

      // Send to all user's devices
      const messages = user.deviceTokens.map(token => ({
        token,
        notification: {
          title,
          body,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'calls',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }));

      const response = await admin.messaging().sendAll(messages);
      console.log('Push notifications sent:', response.successCount, 'success,', response.failureCount, 'failed');

      // Remove invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens = [];
        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error?.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(user.deviceTokens[index]);
          }
        });

        if (invalidTokens.length > 0) {
          await User.findByIdAndUpdate(userId, {
            $pull: { deviceTokens: { $in: invalidTokens } }
          });
        }
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  static async sendCallNotification(callerId, receiverId, callData) {
    const User = require('../models/User');
    const caller = await User.findById(callerId);

    if (!caller) return;

    const notification = {
      title: 'Incoming Call',
      body: `${caller.username || 'Someone'} is calling you`,
      data: {
        type: 'incoming_call',
        callerId: callerId.toString(),
        callId: callData.callId,
        isVideo: callData.isVideo.toString(),
      },
    };

    await this.sendNotificationToUser(receiverId, notification);
  }

  static async sendGroupMessageNotification(senderId, groupId, messageData) {
    if (!firebaseInitialized) {
      console.log('Firebase not initialized, skipping group message push notification');
      return;
    }

    try {
      const User = require('../models/User');
      const Group = require('../models/Group');
      const Message = require('../models/Message');

      // Get sender info
      const sender = await User.findById(senderId);
      if (!sender) return;

      // Get group info
      const group = await Group.findById(groupId);
      if (!group) return;

      // Get all participants except the sender
      const participantIds = group.participants
        .filter(p => p.user.toString() !== senderId.toString())
        .map(p => p.user);

      // Get device tokens for all participants
      const participants = await User.find({ _id: { $in: participantIds } });

      const notification = {
        title: group.name,
        body: `${sender.username}: ${messageData.messageText || 'Sent a message'}`,
        data: {
          type: 'group_message',
          groupId: groupId.toString(),
          senderId: senderId.toString(),
          messageId: messageData._id?.toString() || '',
        },
      };

      // Send notifications to all participants
      for (const participant of participants) {
        if (participant.deviceTokens && participant.deviceTokens.length > 0) {
          await this.sendNotificationToUser(participant._id, notification);
        }
      }

    } catch (error) {
      console.error('Error sending group message notification:', error);
    }
  }
}

module.exports = PushNotificationService;