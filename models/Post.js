const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  userDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: false // null for main feed posts, set for group posts
  },
  content: {
    type: String,
    required: false, // Allow posts with only media
    default: '',
    maxlength: 1000
  },
  image: {
    type: String, // URL or path to image
    required: false
  },
  video: {
    type: String, // URL or path to video
    required: false
  },
  likesCount: {
    type: Number,
    default: 0
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
    total: {
      type: Number,
      default: 0
    }
  },
  commentsCount: {
    type: Number,
    default: 0
  },
  viewsCount: {
    type: Number,
    default: 0
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  hiddenReason: {
    type: String,
    enum: ['user_request', 'moderation', 'automated_action'],
    default: null
  },
  hiddenAt: {
    type: Date,
    default: null
  },
  poll: {
    question: {
      type: String,
      required: false,
      maxlength: 200
    },
    options: [{
      text: {
        type: String,
        required: true,
        maxlength: 100
      },
      votes: {
        type: Number,
        default: 0
      }
    }],
    votedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserData'
    }],
    totalVotes: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Create text index on content for search
postSchema.index({ content: 'text' });

module.exports = mongoose.model('Post', postSchema, 'posts');