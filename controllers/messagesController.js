const Message = require('../models/Message');
const Post = require('../models/Post');
const mongoose = require('mongoose');
const gamificationController = require('./gamificationController');

// ✅ Send Message
const sendMessage = async (req, res) => {
  try {
    const { sender_id, receiver_id, message_text } = req.body;

    const newMessage = new Message({
      sender_id: new mongoose.Types.ObjectId(sender_id),
      receiver_id: new mongoose.Types.ObjectId(receiver_id),
      text: message_text,
      sent_at: new Date()
    });

    const savedMessage = await newMessage.save();

    // Track gamification activity
    try {
      await gamificationController.trackActivityInternal(sender_id, 'message_sent');
    } catch (gamificationError) {
      console.error('Gamification tracking error:', gamificationError);
      // Don't fail the message send if gamification fails
    }

    res.status(201).json({
      message: 'Message sent successfully',
      messageId: savedMessage._id
    });
  } catch (err) {
    console.error('[sendMessage] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Mark as Delivered
const markAsDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveredAt = new Date();

    const updatedMessage = await Message.findByIdAndUpdate(
      id,
      {
        is_delivered: true,
        delivered_at: deliveredAt
      },
      { new: true }
    );

    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Message marked as delivered' });
  } catch (err) {
    console.error('[markAsDelivered] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Mark as Read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const readAt = new Date();

    const updatedMessage = await Message.findByIdAndUpdate(
      id,
      {
        is_read: true,
        read_at: readAt
      },
      { new: true }
    );

    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Message marked as read' });
  } catch (err) {
    console.error('[markAsRead] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Get Messages Between Two Users
const getMessages = async (req, res) => {
  try {
    const { user1, user2 } = req.query;

    const messages = await Message.find({
      $or: [
        { sender_id: new mongoose.Types.ObjectId(user1), receiver_id: new mongoose.Types.ObjectId(user2), is_deleted_by_sender: false },
        { sender_id: new mongoose.Types.ObjectId(user2), receiver_id: new mongoose.Types.ObjectId(user1), is_deleted_by_receiver: false }
      ]
    }).sort({ sent_at: 1 });

    res.json(messages);
  } catch (err) {
    console.error('[getMessages] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

const getAllMessages = async (req, res) => {
  try {
    const user_id = req.query.user_id || req.body.user_id;

    const messages = await Message.find({
      $or: [
        { sender_id: new mongoose.Types.ObjectId(user_id), is_deleted_by_sender: false },
        { receiver_id: new mongoose.Types.ObjectId(user_id), is_deleted_by_receiver: false }
      ]
    }).sort({ sent_at: -1 });

    res.json(messages);
  } catch (err) {
    console.error('[getAllMessages] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Get chat users for a user (chat list, like WhatsApp)
const getChatList = async (req, res) => {
  try {
    const { user_id } = req.query;
    const userObjectId = new mongoose.Types.ObjectId(user_id);

    const chatList = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender_id: userObjectId, is_deleted_by_sender: false },
            { receiver_id: userObjectId, is_deleted_by_receiver: false }
          ]
        }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$sender_id', userObjectId] },
              then: '$receiver_id',
              else: '$sender_id'
            }
          },
          last_message_time: { $max: '$sent_at' }
        }
      },
      {
        $project: {
          user_id: '$_id',
          last_message_time: 1,
          _id: 0
        }
      },
      {
        $sort: { last_message_time: -1 }
      }
    ]);

    res.json(chatList);
  } catch (err) {
    console.error('[getChatList] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};


// ✅ Delete Message (Soft Delete)
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let updateField;
    if (message.sender_id.toString() === user_id) {
      updateField = 'is_deleted_by_sender';
    } else if (message.receiver_id.toString() === user_id) {
      updateField = 'is_deleted_by_receiver';
    } else {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await Message.findByIdAndUpdate(id, { [updateField]: true });

    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    console.error('[deleteMessage] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Clear All Chats (Soft Delete all messages for a user)
const clearAllChats = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const userObjectId = new mongoose.Types.ObjectId(user_id);

    // Update all messages where user is sender
    await Message.updateMany(
      { sender_id: userObjectId },
      { is_deleted_by_sender: true }
    );

    // Update all messages where user is receiver
    await Message.updateMany(
      { receiver_id: userObjectId },
      { is_deleted_by_receiver: true }
    );

    res.json({ message: 'All chats cleared successfully' });
  } catch (err) {
    console.error('[clearAllChats] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Get unread messages count for a user
const getUnreadCount = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const count = await Message.countDocuments({
      receiver_id: new mongoose.Types.ObjectId(user_id),
      is_read: false,
      is_deleted_by_receiver: false
    });

    res.json({ unreadCount: count });
  } catch (err) {
    console.error('[getUnreadCount] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

// ✅ Share post to message
const sharePostToMessage = async (req, res) => {
  try {
    const { postId, chatId, content } = req.body;
    const userId = req.user.userId;

    // Input validation
    if (!postId || !chatId) {
      return res.status(400).json({
        status: 'error',
        message: 'Post ID and Chat ID are required'
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

    // Create shared message
    const sharedMessage = new Message({
      sender_id: new mongoose.Types.ObjectId(userId),
      receiver_id: new mongoose.Types.ObjectId(chatId), // For direct messages
      text: content || `Shared a post: ${post.content}`,
      type: 'text', // Could be enhanced to include post data
      sent_at: new Date()
    });

    await sharedMessage.save();

    res.status(201).json({
      status: 'success',
      message: 'Post shared to message successfully',
      messageId: sharedMessage._id
    });
  } catch (err) {
    console.error('[sharePostToMessage] Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

module.exports = {
  sendMessage,
  markAsDelivered,
  markAsRead,
  getMessages,
  deleteMessage,
  getAllMessages,
  getChatList,
  clearAllChats,
  getUnreadCount,
  sharePostToMessage
};
