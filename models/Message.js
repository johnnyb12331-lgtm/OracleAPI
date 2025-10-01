const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional for group messages
  },
  group_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: false // Optional for direct messages
  },
  message_text: {
    type: String,
    required: false
  },
  text: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio'],
    default: 'text'
  },
  media_url: {
    type: String,
    required: false
  },
  duration: {
    type: Number, // Duration in seconds for audio/video messages
    required: false
  },
  sent_at: {
    type: Date,
    default: Date.now
  },
  time: {
    type: Date,
    default: Date.now
  },
  is_delivered: {
    type: Boolean,
    default: false
  },
  delivered_at: {
    type: Date,
    required: false
  },
  is_read: {
    type: Boolean,
    default: false
  },
  read_at: {
    type: Date,
    required: false
  },
  is_deleted_by_sender: {
    type: Boolean,
    default: false
  },
  is_deleted_by_receiver: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'messages'
});

// Add indexes for common queries
messageSchema.index({ sender_id: 1, receiver_id: 1 });
messageSchema.index({ group_id: 1, sent_at: -1 });
messageSchema.index({ sent_at: -1 });

module.exports = mongoose.model('Message', messageSchema);