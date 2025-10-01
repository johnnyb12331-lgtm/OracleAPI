const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  targetType: {
    type: String,
    enum: ['post', 'comment', 'message'],
    default: 'post'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'likes'
});

// Add indexes for common queries
likeSchema.index({ userId: 1 });
likeSchema.index({ targetId: 1, targetType: 1 });

// Add unique compound index to prevent duplicate likes
likeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);