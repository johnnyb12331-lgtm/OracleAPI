const mongoose = require('mongoose');

const storyReactionSchema = new mongoose.Schema({
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
  reactionType: {
    type: String,
    enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'],
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'story_reactions'
});

// Ensure unique reaction per user per story
storyReactionSchema.index({ storyId: 1, userDataId: 1 }, { unique: true });

module.exports = mongoose.model('StoryReaction', storyReactionSchema);