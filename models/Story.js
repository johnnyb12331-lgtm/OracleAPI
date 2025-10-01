const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  userDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  imageUrl: {
    type: String, // URL or path to image/video
    required: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    default: 'image'
  },
  content: {
    type: String,
    required: false,
    maxlength: 200 // Shorter than posts
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  privacy: {
    type: String,
    enum: ['public', 'friends', 'close_friends'],
    default: 'friends'
  },
  expires_at: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from creation
    index: true
  },
}, {
  timestamps: true,
  collection: 'stories'
});

// Index for efficient querying of non-expired stories
// storySchema.index({ expires_at: 1 }); // Removed since index is now on the field

// Virtual to check if story is expired
storySchema.virtual('isExpired').get(function() {
  return new Date() > this.expires_at;
});

module.exports = mongoose.model('Story', storySchema);