const mongoose = require('mongoose');

const storyReplySchema = new mongoose.Schema({
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    required: true
  },
  userDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 200
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'story_replies'
});

module.exports = mongoose.model('StoryReply', storyReplySchema);