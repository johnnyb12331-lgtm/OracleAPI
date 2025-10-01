const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'spam',
      'harassment',
      'inappropriate_content',
      'violence',
      'hate_speech',
      'copyright_violation',
      'adult_content',
      'self_harm',
      'terrorism',
      'child_exploitation',
      'impersonation',
      'scam_fraud',
      'other'
    ]
  },
  category: {
    type: String,
    enum: ['content_violation', 'harassment', 'spam', 'safety_concern', 'copyright', 'other'],
    default: function() {
      const categoryMap = {
        'spam': 'spam',
        'harassment': 'harassment',
        'inappropriate_content': 'content_violation',
        'violence': 'safety_concern',
        'hate_speech': 'harassment',
        'copyright_violation': 'copyright',
        'adult_content': 'content_violation',
        'self_harm': 'safety_concern',
        'terrorism': 'safety_concern',
        'child_exploitation': 'safety_concern',
        'impersonation': 'harassment',
        'scam_fraud': 'spam',
        'other': 'other'
      };
      return categoryMap[this.reason] || 'other';
    }
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: function() {
      const severityMap = {
        'spam': 'low',
        'harassment': 'medium',
        'inappropriate_content': 'medium',
        'violence': 'high',
        'hate_speech': 'high',
        'copyright_violation': 'medium',
        'adult_content': 'high',
        'self_harm': 'critical',
        'terrorism': 'critical',
        'child_exploitation': 'critical',
        'impersonation': 'medium',
        'scam_fraud': 'high',
        'other': 'low'
      };
      return severityMap[this.reason] || 'low';
    }
  },
  description: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed'],
    default: 'pending'
  },
  automated_action: {
    type: String,
    enum: ['none', 'hide_post', 'delete_post', 'suspend_user', 'ban_user'],
    default: 'none'
  },
  action_taken: {
    type: Boolean,
    default: false
  },
  action_timestamp: {
    type: Date
  },
  moderator_notes: {
    type: String,
    maxlength: 1000
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'reports'
});

// Index for efficient querying
reportSchema.index({ status: 1, severity: -1, created_at: -1 });
reportSchema.index({ postId: 1, reporterId: 1 });

module.exports = mongoose.model('Report', reportSchema);