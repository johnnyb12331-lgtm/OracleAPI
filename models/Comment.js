const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true // Index for fast queries by post
  },
  userDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true,
    index: true // Index for user-specific queries
  },
  content: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  likesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  reactionsCount: {
    like: {
      type: Number,
      default: 0
    },
    love: {
      type: Number,
      default: 0
    },
    laugh: {
      type: Number,
      default: 0
    },
    angry: {
      type: Number,
      default: 0
    },
    sad: {
      type: Number,
      default: 0
    },
    wow: {
      type: Number,
      default: 0
    },
    fire: {
      type: Number,
      default: 0
    },
    celebrate: {
      type: Number,
      default: 0
    },
    support: {
      type: Number,
      default: 0
    },
    dislike: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true // Index for sorting by date
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' },
  collection: 'comments'
});

// Compound indexes for optimal query performance
commentSchema.index({ postId: 1, created_at: -1 }); // Comments by post, sorted by date
commentSchema.index({ userDataId: 1, created_at: -1 }); // Comments by user, sorted by date
commentSchema.index({ postId: 1, userDataId: 1 }); // Ownership checks

// Pre-save middleware to update timestamp
commentSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Comment', commentSchema);