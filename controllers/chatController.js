const Message = require('../models/Message');
const mongoose = require('mongoose');
const PushNotificationService = require('../services/pushNotificationService');
const sendMessage = async (req, res) => {
  const { sender_id, receiver_id, group_id, text, type, media_url, duration } = req.body;

  if (!sender_id || !type) {
    return res.status(400).json({ error: 'Missing required fields: sender_id and type are required' });
  }

  if (!receiver_id && !group_id) {
    return res.status(400).json({ error: 'Either receiver_id or group_id must be provided' });
  }

  if (receiver_id && group_id) {
    return res.status(400).json({ error: 'Cannot send to both receiver and group simultaneously' });
  }

  try {
    const newMessage = new Message({
      sender_id: mongoose.Types.ObjectId(sender_id),
      receiver_id: receiver_id ? mongoose.Types.ObjectId(receiver_id) : undefined,
      group_id: group_id ? mongoose.Types.ObjectId(group_id) : undefined,
      text,
      type,
      media_url,
      duration,
      sent_at: new Date()
    });

    const savedMessage = await newMessage.save();

    // Send push notifications for group messages
    if (group_id) {
      try {
        await PushNotificationService.sendGroupMessageNotification(
          sender_id,
          group_id,
          {
            _id: savedMessage._id,
            messageText: text,
            type,
            media_url
          }
        );
      } catch (notificationError) {
        console.error('Failed to send group message notification:', notificationError);
        // Don't fail the message send if notification fails
      }
    }

    res.status(201).json({ message: 'Message sent', id: savedMessage._id });
  } catch (error) {
    console.error('Send Message Error: - chatController.js:19', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Upload voice message
const uploadVoiceMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No voice file provided' });
    }

    const { sender_id, receiver_id, group_id, duration } = req.body;

    if (!sender_id) {
      return res.status(400).json({ error: 'sender_id is required' });
    }

    if (!receiver_id && !group_id) {
      return res.status(400).json({ error: 'Either receiver_id or group_id must be provided' });
    }

    if (receiver_id && group_id) {
      return res.status(400).json({ error: 'Cannot send to both receiver and group simultaneously' });
    }

    // Create the media URL for the uploaded file
    const media_url = `/uploads/voice/${req.file.filename}`;

    const newMessage = new Message({
      sender_id: mongoose.Types.ObjectId(sender_id),
      receiver_id: receiver_id ? mongoose.Types.ObjectId(receiver_id) : undefined,
      group_id: group_id ? mongoose.Types.ObjectId(group_id) : undefined,
      text: 'Voice message',
      type: 'audio',
      media_url,
      duration: duration ? parseFloat(duration) : null,
      sent_at: new Date()
    });

    const savedMessage = await newMessage.save();

    // Send push notifications for group messages
    if (group_id) {
      try {
        await PushNotificationService.sendGroupMessageNotification(
          sender_id,
          group_id,
          {
            _id: savedMessage._id,
            messageText: 'Voice message',
            type: 'audio',
            media_url
          }
        );
      } catch (notificationError) {
        console.error('Failed to send voice message notification:', notificationError);
        // Don't fail the message send if notification fails
      }
    }

    res.status(201).json({
      message: 'Voice message uploaded successfully',
      id: savedMessage._id,
      media_url
    });
  } catch (error) {
    console.error('Upload Voice Message Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Fetch messages between users or in a group
const getMessages = async (req, res) => {
  const { user1, user2, groupId } = req.query;

  console.log('🔍 getMessages called with user1:', user1, 'user2:', user2, 'groupId:', groupId);

  if (groupId) {
    // Group messages
    try {
      const messages = await Message.find({
        group_id: new mongoose.Types.ObjectId(groupId)
      }).sort({ sent_at: -1 });

      console.log('📬 Found group messages:', messages.length);
      res.json(messages);
    } catch (error) {
      console.error('Get Group Messages Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (user1 && user2) {
    // Direct messages
    try {
      const messages = await Message.find({
        $or: [
          { sender_id: new mongoose.Types.ObjectId(user1), receiver_id: new mongoose.Types.ObjectId(user2) },
          { sender_id: new mongoose.Types.ObjectId(user2), receiver_id: new mongoose.Types.ObjectId(user1) }
        ]
      }).sort({ sent_at: -1 });

      console.log('📬 Found direct messages:', messages.length);
      res.json(messages);
    } catch (error) {
      console.error('Get Direct Messages Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    return res.status(400).json({ error: 'Missing required parameters: either user1+user2 or groupId' });
  }
};

const getInbox = async (req, res) => {
  const userId = req.user?.userId;

  console.log('req.user: - chatController.js:51', req.user);

  if (!userId) {
    return res.status(400).json({ error: 'User ID missing from token' });
  }

  console.log("Fetching inbox for userId: - chatController.js:57", userId);

  try {
    const Group = require('../models/Group');
    const conversations = [];

    // Get all direct messages for this user
    const directMessages = await Message.find({
      $or: [
        { sender_id: new mongoose.Types.ObjectId(userId) },
        { receiver_id: new mongoose.Types.ObjectId(userId) }
      ]
    }).sort({ sent_at: -1 });

    console.log('Found direct messages:', directMessages.length);

    // Group direct messages by conversation partner
    const directConversations = {};
    directMessages.forEach(msg => {
      if (msg.group_id) return; // Skip group messages here

      const partnerId = msg.sender_id.toString() === userId.toString() ? msg.receiver_id : msg.sender_id;

      // Skip if partner is the same as current user (self-messages)
      if (partnerId.toString() === userId.toString()) {
        return;
      }

      const partnerKey = partnerId.toString();

      if (!directConversations[partnerKey]) {
        directConversations[partnerKey] = {
          id: partnerId,
          type: 'direct',
          lastMessage: msg.text || 'No message',
          lastTime: msg.time || msg.sent_at,
          unreadCount: 0
        };
      } else {
        // Update last message if this message is more recent
        const currentLastTime = new Date(directConversations[partnerKey].lastTime);
        const msgTime = new Date(msg.time || msg.sent_at);
        if (msgTime > currentLastTime) {
          directConversations[partnerKey].lastMessage = msg.text || 'No message';
          directConversations[partnerKey].lastTime = msg.time || msg.sent_at;
        }
      }

      // Count unread messages (messages sent to this user that are not read)
      if (msg.receiver_id && msg.receiver_id.toString() === userId.toString() && !msg.is_read) {
        directConversations[partnerKey].unreadCount++;
      }
    });

    // Get all group messages for groups this user is part of
    const userGroups = await Group.find({
      'participants.user': new mongoose.Types.ObjectId(userId)
    });

    for (const group of userGroups) {
      const groupMessages = await Message.find({
        group_id: group._id
      }).sort({ sent_at: -1 }).limit(1);

      // Count unread messages in this group
      const unreadCount = await Message.countDocuments({
        group_id: group._id,
        sender_id: { $ne: new mongoose.Types.ObjectId(userId) }, // Exclude messages sent by current user
        is_read: false
      });

      if (groupMessages.length > 0) {
        const lastMsg = groupMessages[0];
        conversations.push({
          id: group._id.toString(),
          type: 'group',
          name: group.name,
          avatar: group.avatar,
          lastMessage: lastMsg.text || 'No message',
          lastTime: lastMsg.time || lastMsg.sent_at,
          unreadCount: unreadCount,
          groupType: group.type
        });
      } else {
        // Group with no messages yet
        conversations.push({
          id: group._id.toString(),
          type: 'group',
          name: group.name,
          avatar: group.avatar,
          lastMessage: 'No messages yet',
          lastTime: group.created_at,
          unreadCount: 0,
          groupType: group.type
        });
      }
    }

    // Now fetch user data for direct conversations
    const UserData = require('../models/UserData');
    const directConversationArray = Object.values(directConversations);

    for (const conv of directConversationArray) {
      const userData = await UserData.findOne({ userId: new mongoose.Types.ObjectId(conv.id) }).select('name avatar');
      conv.name = userData?.name || 'Unknown User';
      conv.avatar = userData?.avatar || '';
    }

    // Combine direct and group conversations
    const allConversations = [...directConversationArray, ...conversations];

    console.log('Inbox result:', allConversations);
    res.json(allConversations);

  } catch (err) {
    console.error('Error getting inbox: - chatController.js:78', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


const getmessage = async (req, res) => {
  const { user1, user2 } = req.query; // Pass IDs instead of chatId
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 20;
  const offset = page * limit;

  if (!user1 || !user2) {
    return res.status(400).json({ error: 'Missing user ids' });
  }

  try {
    const messages = await Message.find({
      $or: [
        { sender_id: new mongoose.Types.ObjectId(user1), receiver_id: new mongoose.Types.ObjectId(user2) },
        { sender_id: new mongoose.Types.ObjectId(user2), receiver_id: new mongoose.Types.ObjectId(user1) }
      ]
    })
    .sort({ sent_at: -1 })
    .skip(offset)
    .limit(limit);

    console.log('getmessage called with user1:', user1, 'user2:', user2, 'page:', page, 'limit:', limit);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching chat messages:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


const getmessageDD = async (req, res) => {
  const { chatId } = req.params;
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 10;
  const offset = page * limit;

  try {
    const messages = await Message.find({ chat_id: chatId })
      .sort({ time: -1 })
      .skip(offset)
      .limit(limit);

    res.json(messages);
  } catch (err) {
    console.error('Error fetching chat messages:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ Mark all messages as read between two users
const markAsRead = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'User not authenticated' });
    }

    // Only allow marking messages as read if the current user is the receiver
    if (currentUserId !== receiverId) {
      return res.status(403).json({ error: 'You can only mark your own messages as read' });
    }

    // Mark all unread messages from senderId to receiverId as read
    const result = await Message.updateMany(
      {
        sender_id: new mongoose.Types.ObjectId(senderId),
        receiver_id: new mongoose.Types.ObjectId(receiverId),
        is_read: false
      },
      {
        is_read: true,
        read_at: new Date()
      }
    );

    console.log(`Marked ${result.modifiedCount} messages as read from ${senderId} to ${receiverId}`);
    res.json({ message: `${result.modifiedCount} messages marked as read` });
  } catch (err) {
    console.error('[markAsRead] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// Clear all conversations for a user
const clearAllConversations = async (req, res) => {
  try {
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'User not authenticated' });
    }

    // Delete all messages where the user is either sender or receiver
    const result = await Message.deleteMany({
      $or: [
        { sender_id: new mongoose.Types.ObjectId(currentUserId) },
        { receiver_id: new mongoose.Types.ObjectId(currentUserId) }
      ]
    });

    console.log(`Deleted ${result.deletedCount} messages for user ${currentUserId}`);
    res.json({ message: `Cleared ${result.deletedCount} messages from all conversations` });
  } catch (err) {
    console.error('[clearAllConversations] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// Mark all messages as read for a user
const markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'User not authenticated' });
    }

    // Only allow marking messages as read if the current user matches the provided userId
    if (currentUserId !== userId) {
      return res.status(403).json({ error: 'You can only mark your own messages as read' });
    }

    // Mark all unread messages sent to this user as read
    const result = await Message.updateMany(
      {
        receiver_id: new mongoose.Types.ObjectId(userId),
        is_read: false
      },
      {
        is_read: true,
        read_at: new Date()
      }
    );

    console.log(`Marked ${result.modifiedCount} messages as read for user ${userId}`);
    res.json({ message: `${result.modifiedCount} messages marked as read` });
  } catch (err) {
    console.error('[markAllAsRead] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// Mark all messages in a group as read for a user
const markGroupAsRead = async (req, res) => {
  try {
    const { groupId } = req.body;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'User not authenticated' });
    }

    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    // Verify user is a participant in the group
    const Group = require('../models/Group');
    const group = await Group.findOne({
      _id: new mongoose.Types.ObjectId(groupId),
      'participants.user': new mongoose.Types.ObjectId(currentUserId)
    });

    if (!group) {
      return res.status(403).json({ error: 'You are not a participant in this group' });
    }

    // Mark all unread messages in the group as read (except messages sent by the current user)
    const result = await Message.updateMany(
      {
        group_id: new mongoose.Types.ObjectId(groupId),
        sender_id: { $ne: new mongoose.Types.ObjectId(currentUserId) }, // Don't mark own messages as read
        is_read: false
      },
      {
        is_read: true,
        read_at: new Date()
      }
    );

    console.log(`Marked ${result.modifiedCount} group messages as read for user ${currentUserId} in group ${groupId}`);
    res.json({ message: `${result.modifiedCount} messages marked as read` });
  } catch (err) {
    console.error('[markGroupAsRead] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};


const Group = require('../models/Group');

// Create a new group or channel
const createGroup = async (req, res) => {
  const { name, description, type, participants, is_private } = req.body;
  const created_by = req.user?.userId;

  if (!created_by) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  if (!['group', 'channel'].includes(type)) {
    return res.status(400).json({ error: 'Type must be either "group" or "channel"' });
  }

  try {
    // Ensure creator is in participants
    const participantIds = participants ? participants.map(p => p.user || p) : [];
    if (!participantIds.includes(created_by)) {
      participantIds.push(created_by);
    }

    // Create participant objects
    const participantObjects = participantIds.map(userId => ({
      user: new mongoose.Types.ObjectId(userId),
      role: userId === created_by ? 'admin' : 'member'
    }));

    const newGroup = new Group({
      name,
      description: description || '',
      type,
      created_by: new mongoose.Types.ObjectId(created_by),
      participants: participantObjects,
      is_private: is_private !== undefined ? is_private : true
    });

    const savedGroup = await newGroup.save();

    res.status(201).json({
      message: `${type} created successfully`,
      group: savedGroup
    });
  } catch (error) {
    console.error('Create Group Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's groups
const getUserGroups = async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  try {
    const groups = await Group.find({
      'participants.user': new mongoose.Types.ObjectId(userId)
    }).populate('participants.user', 'name avatar');

    res.json(groups);
  } catch (error) {
    console.error('Get User Groups Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add participant to group
const addParticipant = async (req, res) => {
  const { groupId, userId } = req.body;
  const currentUserId = req.user?.userId;

  if (!currentUserId) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  if (!groupId || !userId) {
    return res.status(400).json({ error: 'Group ID and User ID are required' });
  }

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if current user is admin
    const currentUserParticipant = group.participants.find(
      p => p.user.toString() === currentUserId
    );

    if (!currentUserParticipant || currentUserParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add participants' });
    }

    // Check if user is already a participant
    const existingParticipant = group.participants.find(
      p => p.user.toString() === userId
    );

    if (existingParticipant) {
      return res.status(400).json({ error: 'User is already a participant' });
    }

    // Add participant
    group.participants.push({
      user: new mongoose.Types.ObjectId(userId),
      role: 'member'
    });

    await group.save();

    res.json({ message: 'Participant added successfully' });
  } catch (error) {
    console.error('Add Participant Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove participant from group
const removeParticipant = async (req, res) => {
  const { groupId, userId } = req.body;
  const currentUserId = req.user?.userId;

  if (!currentUserId) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  if (!groupId || !userId) {
    return res.status(400).json({ error: 'Group ID and User ID are required' });
  }

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if current user is admin or removing themselves
    const currentUserParticipant = group.participants.find(
      p => p.user.toString() === currentUserId
    );

    if (!currentUserParticipant) {
      return res.status(403).json({ error: 'You are not a participant in this group' });
    }

    const isAdmin = currentUserParticipant.role === 'admin';
    const isRemovingSelf = currentUserId === userId;

    if (!isAdmin && !isRemovingSelf) {
      return res.status(403).json({ error: 'Only admins can remove other participants' });
    }

    // Remove participant
    group.participants = group.participants.filter(
      p => p.user.toString() !== userId
    );

    await group.save();

    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    console.error('Remove Participant Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Change participant role in group
const changeParticipantRole = async (req, res) => {
  const { groupId, userId, newRole } = req.body;
  const currentUserId = req.user?.userId;

  if (!currentUserId) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  if (!groupId || !userId || !newRole) {
    return res.status(400).json({ error: 'Group ID, User ID, and new role are required' });
  }

  if (!['admin', 'member'].includes(newRole)) {
    return res.status(400).json({ error: 'Role must be either "admin" or "member"' });
  }

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if current user is admin
    const currentUserParticipant = group.participants.find(
      p => p.user.toString() === currentUserId
    );

    if (!currentUserParticipant || currentUserParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change participant roles' });
    }

    // Find the participant to update
    const participantIndex = group.participants.findIndex(
      p => p.user.toString() === userId
    );

    if (participantIndex === -1) {
      return res.status(404).json({ error: 'User is not a participant in this group' });
    }

    // Update the role
    group.participants[participantIndex].role = newRole;
    await group.save();

    res.json({ message: 'Participant role updated successfully' });
  } catch (error) {
    console.error('Change Participant Role Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update group information
const updateGroup = async (req, res) => {
  const { groupId, name, description } = req.body;
  const currentUserId = req.user?.userId;

  if (!currentUserId) {
    return res.status(400).json({ error: 'User not authenticated' });
  }

  if (!groupId) {
    return res.status(400).json({ error: 'Group ID is required' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if current user is admin
    const currentUserParticipant = group.participants.find(
      p => p.user.toString() === currentUserId
    );

    if (!currentUserParticipant || currentUserParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update group information' });
    }

    // Update group information
    group.name = name.trim();
    if (description !== undefined) {
      group.description = description.trim();
    }
    group.updated_at = new Date();

    await group.save();

    res.json({
      message: 'Group updated successfully',
      group: {
        _id: group._id,
        name: group.name,
        description: group.description,
        type: group.type,
        avatar: group.avatar,
        updated_at: group.updated_at
      }
    });
  } catch (error) {
    console.error('Update Group Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


module.exports = {
  sendMessage,
  uploadVoiceMessage,
  getMessages,
  getInbox,
  getmessage,
  markAsRead,
  markGroupAsRead,
  clearAllConversations,
  markAllAsRead,
  createGroup,
  getUserGroups,
  addParticipant,
  removeParticipant,
  changeParticipantRole,
  updateGroup
};