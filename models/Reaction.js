const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
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
  reactionType: {
    type: String,
    enum: ['like', 'love', 'laugh', 'angry', 'sad', 'wow', 'fire', 'celebrate', 'support', 'dislike'],
    required: true,
    default: 'like'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'reactions'
});

// Add indexes for common queries
reactionSchema.index({ userId: 1 });
reactionSchema.index({ targetId: 1, targetType: 1 });
reactionSchema.index({ targetId: 1, targetType: 1, reactionType: 1 });

// Add unique compound index to prevent duplicate reactions by same user on same target
reactionSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Reaction', reactionSchema);